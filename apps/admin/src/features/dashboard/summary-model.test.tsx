import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ApiError } from "@common/api-contracts/client";
import type { components } from "@common/api-contracts/openapi";
import type { apiRequest } from "@/platform/api";
import {
  createSummaryRun,
  dashboardIdentity,
  type DashboardSummary,
  type SummaryState,
} from "@/features/dashboard/summary-model";
import { SummaryPanels } from "@/features/dashboard/summary-panels";

const empty: DashboardSummary = {
  generatedAt: "2026-10-31T10:00:00.000Z",
  users: null,
  merchants: null,
  resorts: null,
  articles: null,
  dynamics: null,
  rag: null,
  revenue: null,
};
const user: components["schemas"]["CurrentUserVO"] = {
  userId: 7,
  account: "test",
  nickname: "Test",
  avatarUrl: null,
  roles: [{ roleKey: "system_admin", roleName: "系统管理员" }],
  permissionKeys: [
    "management:portal:enter",
    "system:user:list",
    "ai:knowledge:list",
  ],
  menuTree: [],
  merchant: null,
};
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function markup(data: DashboardSummary) {
  return renderToStaticMarkup(
    <SummaryPanels state={{ status: "ready", data }} retry={() => {}} />,
  );
}
function withIdentity(
  request: (
    path: string,
    options?: Parameters<typeof apiRequest>[1],
  ) => unknown,
): typeof apiRequest {
  return ((path, options) =>
    path === "/auth/me"
      ? Promise.resolve(user)
      : request(path, options)) as typeof apiRequest;
}

describe("Dashboard summary presentation and request lifecycle", () => {
  it("uses only the aggregate endpoint with no client identity, query or list stitching", async () => {
    const request = vi.fn().mockResolvedValue(empty),
      publish = vi.fn();
    await createSummaryRun(publish, user, withIdentity(request)).load();
    expect(request).toHaveBeenCalledExactlyOnceWith(
      "/admin/dashboard/summary",
      { signal: expect.any(AbortSignal), cache: "no-store" },
    );
    expect(publish.mock.calls.map(([state]) => state.status)).toEqual([
      "loading",
      "ready",
    ]);
  });
  it("null panels are hidden and the no-panel state is explicit", () => {
    const html = markup(empty);
    expect(html).toContain("尚无可展示的统计面板");
    for (const title of [
      'aria-label="账号"',
      'aria-label="社区动态"',
      "累计收益",
      "RAG 索引",
    ])
      expect(html).not.toContain(title);
    expect(html).toContain("北京时间");
    expect(html).toContain("刷新统计");
  });
  it("authorized zero counts remain visible", () => {
    const html = markup({
      ...empty,
      users: { total: 0, active: 0, disabled: 0 },
      resorts: {
        total: 0,
        draft: 0,
        pendingReview: 0,
        published: 0,
        offline: 0,
      },
      rag: { failed: 0 },
    });
    expect(html).toContain('aria-label="账号"');
    expect(html).toContain('aria-label="雪场"');
    expect(html).toContain("待审核");
    expect(html).toContain(">0</dd>");
    expect(html.match(/data-primary="true"/g)).toHaveLength(3);
    expect(html.match(/data-primary="false"/g)).toHaveLength(6);
    expect(html).not.toContain("尚无可展示的统计面板");
  });
  it("renders every lifecycle count and data scope label", () => {
    const html = markup({
      ...empty,
      merchants: { total: 2, active: 1, disabled: 1 },
      articles: { total: 3, draft: 1, published: 1, withdrawn: 1 },
      dynamics: { total: 3, pending: 1, published: 1, hidden: 1 },
    });
    for (const label of [
      "商家资料",
      "按资料状态统计",
      "知识文章",
      "已撤回",
      "全局审核范围",
      "已隐藏",
    ])
      expect(html).toContain(label);
  });
  it.each(["0.00", "10000000005.29", "9007199254740993.99"])(
    "preserves monetary string %s without floating point conversion",
    (amount) => {
      const html = markup({
        ...empty,
        revenue: { amount, currency: "CNY", period: "all-time", scope: "all" },
      });
      expect(html).toContain(`${amount} 元（CNY）`);
      expect(html).toContain("全平台有效雪场");
      expect(html).toContain("全部时间");
      expect(
        markup({
          ...empty,
          revenue: {
            amount,
            currency: "CNY",
            period: "all-time",
            scope: "merchant",
          },
        }),
      ).toContain("本人商家获授权雪场");
    },
  );
  it.each([401, 403, 500])(
    "handles %i without exposing private server diagnostics or stale data",
    async (status) => {
      const request = vi.fn().mockRejectedValue(
          new ApiError("private database error", {
            status,
            code: status,
            traceId: "public-trace",
          }),
        ),
        states: SummaryState[] = [];
      await createSummaryRun(
        (state) => states.push(state),
        user,
        withIdentity(request),
      ).load();
      const state = states.at(-1)!;
      expect(state.status).toBe("error");
      const html = renderToStaticMarkup(
        <SummaryPanels state={state} retry={() => {}} />,
      );
      expect(html).toContain("public-trace");
      expect(html).toContain("重试汇总");
      expect(html).not.toContain("private database error");
      if (status === 403) expect(html).toContain("数据范围存在冲突");
    },
  );
  it("network errors can be retried and success follows a fresh loading state", async () => {
    const request = vi
        .fn()
        .mockRejectedValueOnce(new TypeError("private transport"))
        .mockResolvedValueOnce(empty),
      publish = vi.fn();
    const run = createSummaryRun(publish, user, withIdentity(request));
    await run.load();
    await run.load();
    expect(publish.mock.calls.map(([state]) => state.status)).toEqual([
      "loading",
      "error",
      "loading",
      "ready",
    ]);
  });
  it.each(["resolve", "reject"] as const)(
    "disposal on identity/authorization change ignores late %s even if transport ignores abort",
    async (outcome) => {
      const old = deferred<DashboardSummary>(),
        publish = vi.fn(),
        request = vi.fn().mockReturnValue(old.promise);
      const run = createSummaryRun(publish, user, withIdentity(request)),
        loading = run.load();
      await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
      run.dispose();
      expect(request.mock.calls[0]?.[1].signal.aborted).toBe(true);
      if (outcome === "resolve")
        old.resolve({
          ...empty,
          revenue: {
            amount: "999.99",
            currency: "CNY",
            period: "all-time",
            scope: "all",
          },
        });
      else old.reject(new Error("old error"));
      await loading;
      expect(publish).toHaveBeenCalledTimes(1);
      await run.load();
      expect(request).toHaveBeenCalledTimes(1);
    },
  );
  it("refresh aborts previous request, clears old data and ignores old completion", async () => {
    const first = deferred<DashboardSummary>(),
      second = deferred<DashboardSummary>();
    const request = vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise),
      publish = vi.fn();
    const run = createSummaryRun(publish, user, withIdentity(request));
    const one = run.load();
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    const two = run.load();
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(request.mock.calls[0]?.[1].signal.aborted).toBe(true);
    second.resolve({ ...empty, rag: { failed: 0 } });
    await two;
    first.resolve({ ...empty, rag: { failed: 888 } });
    await one;
    expect(publish.mock.calls.map(([state]) => state.status)).toEqual([
      "loading",
      "loading",
      "ready",
    ]);
    expect(publish.mock.lastCall?.[0].data.rag.failed).toBe(0);
  });
  it("identity key follows account, grants, roles and merchant changes", () => {
    for (const changed of [
      { ...user, userId: 8 },
      { ...user, account: "different" },
      { ...user, permissionKeys: ["management:portal:enter"] },
      { ...user, merchant: { merchantId: 99, businessName: "商家" } },
      {
        ...user,
        roles: [{ roleId: 99, roleKey: "custom", roleName: "Custom" }],
      },
    ])
      expect(dashboardIdentity(changed)).not.toBe(dashboardIdentity(user));
    expect(
      dashboardIdentity({
        ...user,
        permissionKeys: [...user.permissionKeys].reverse(),
      }),
    ).toBe(dashboardIdentity(user));
  });
});
