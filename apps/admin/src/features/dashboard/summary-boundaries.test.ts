import { describe, expect, it, vi } from "vitest";
import type { apiRequest } from "@/platform/api";
import {
  parseSummary,
  type DashboardSummary,
} from "@/features/dashboard/summary-response";
import {
  readSummary,
  dashboardIdentity,
  type SummaryOperator,
} from "@/features/dashboard/summary-queries";
import {
  createSummaryRun,
  type SummaryState,
} from "@/features/dashboard/summary-model";

const user: SummaryOperator = {
  userId: 1,
  account: "operator",
  nickname: "操作员",
  avatarUrl: null,
  roles: [{ roleKey: "custom", roleName: "自定义" }],
  menuTree: [],
  merchant: { merchantId: 2, businessName: "商家资料" },
  permissionKeys: [
    "management:portal:enter",
    "resort:merchant:list",
    "revenue:merchant:list",
  ],
};
const empty: DashboardSummary = {
  generatedAt: "2026-11-03T00:00:00.000Z",
  users: null,
  merchants: null,
  resorts: null,
  articles: null,
  dynamics: null,
  rag: null,
  revenue: null,
};
const merchant: DashboardSummary = {
  ...empty,
  resorts: { total: 1, draft: 1, pendingReview: 0, published: 0, offline: 0 },
  revenue: {
    amount: "9007199254740993.99",
    currency: "CNY",
    period: "all-time",
    scope: "merchant",
  },
};
const signal = () => new AbortController().signal;
function request(...values: unknown[]) {
  const mock = vi.fn();
  for (const value of values) mock.mockResolvedValueOnce(value);
  return mock;
}
function deferred() {
  let resolve!: (v: unknown) => void;
  const promise = new Promise<unknown>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

describe("summary response projection", () => {
  it("projects only approved fields, retaining exact decimal strings and zero counts", () => {
    const data = parseSummary({
      ...merchant,
      secret: "private",
      revenue: { ...merchant.revenue, ownerAccount: "private" },
      resorts: { ...merchant.resorts, merchantId: 999 },
      rag: { failed: 0, lastError: "private" },
    });
    expect(data).toEqual({ ...merchant, rag: { failed: 0 } });
    expect(JSON.stringify(data)).not.toMatch(/private|merchantId/);
    expect(parseSummary(empty)).toEqual(empty);
  });
  it.each([
    null,
    [],
    "summary",
    {},
    { ...empty, generatedAt: "invalid" },
    { ...empty, generatedAt: "2026-11-03" },
  ])("rejects malformed summary %j", (value) => {
    expect(() => parseSummary(value)).toThrow();
  });
  it.each([
    "users",
    "merchants",
    "resorts",
    "articles",
    "dynamics",
    "rag",
    "revenue",
  ] as const)("requires explicit nullable %s", (key) => {
    const value = { ...empty } as Record<string, unknown>;
    delete value[key];
    expect(() => parseSummary(value)).toThrow();
    expect(() => parseSummary({ ...empty, [key]: [] })).toThrow();
  });
  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "1", null])(
    "rejects invalid counters %j",
    (failed) => {
      expect(() => parseSummary({ ...empty, rag: { failed } })).toThrow();
    },
  );
  it.each([
    ["users", { total: 2, active: 1, disabled: 0 }],
    ["merchants", { total: 1, active: 0, disabled: 0 }],
    [
      "resorts",
      { total: 2, draft: 1, pendingReview: 0, published: 0, offline: 0 },
    ],
    ["articles", { total: 2, draft: 1, published: 0, withdrawn: 0 }],
    ["dynamics", { total: 2, pending: 1, published: 0, hidden: 0 }],
  ])("rejects inconsistent %s status totals", (key, panel) => {
    expect(() => parseSummary({ ...empty, [String(key)]: panel })).toThrow();
  });
  it.each([1, 1.01, "1", "1.0", "-1.00", "1e2", "NaN", "1.001"])(
    "rejects non-contract money %j",
    (amount) => {
      expect(() =>
        parseSummary({ ...merchant, revenue: { ...merchant.revenue, amount } }),
      ).toThrow();
    },
  );
  it.each([{ currency: "USD" }, { period: "today" }, { scope: "self" }])(
    "rejects invented revenue semantics %j",
    (change) => {
      expect(() =>
        parseSummary({
          ...merchant,
          revenue: { ...merchant.revenue, ...change },
        }),
      ).toThrow();
    },
  );
});
describe("summary authorized reads and lifecycle", () => {
  it("uses fresh identity before and after a single summary read, without caller IDs", async () => {
    const mock = request(user, merchant, user),
      controller = new AbortController();
    expect(
      await readSummary(mock as typeof apiRequest, user, controller.signal),
    ).toEqual(merchant);
    expect(mock.mock.calls.map((call) => call[0])).toEqual([
      "/auth/me",
      "/admin/dashboard/summary",
      "/auth/me",
    ]);
    for (const [, options] of mock.mock.calls)
      expect(options).toEqual({ signal: controller.signal, cache: "no-store" });
  });
  it.each([
    { ...user, userId: 3 },
    { ...user, account: "other" },
    { ...user, roles: [] },
    { ...user, merchant: null },
    { ...user, permissionKeys: ["management:portal:enter"] },
    { ...user, roles: null },
  ])("rejects changed final identity %j", async (changed) => {
    const mock = request(user, merchant, changed);
    await expect(
      readSummary(mock as typeof apiRequest, user, signal()),
    ).rejects.toThrow("身份");
  });
  it("compares sets independently of role/grant order and display names", () => {
    expect(
      dashboardIdentity({
        ...user,
        permissionKeys: [...user.permissionKeys].reverse(),
        roles: [{ roleKey: "custom", roleName: "更名" }],
      }),
    ).toBe(dashboardIdentity(user));
  });
  it("rejects locally denied identities without making a request", async () => {
    const mock = vi.fn();
    await expect(
      readSummary(
        mock as typeof apiRequest,
        { ...user, permissionKeys: [] },
        signal(),
      ),
    ).rejects.toThrow();
    expect(mock).not.toHaveBeenCalled();
  });
  it.each([
    { ...empty, users: { total: 0, active: 0, disabled: 0 } },
    { ...empty, merchants: { total: 0, active: 0, disabled: 0 } },
    { ...empty, articles: { total: 0, draft: 0, published: 0, withdrawn: 0 } },
    { ...empty, dynamics: { total: 0, pending: 0, published: 0, hidden: 0 } },
    { ...empty, rag: { failed: 0 } },
    { ...merchant, revenue: { ...merchant.revenue, scope: "all" } },
  ])(
    "refuses non-null panels outside the expected authorization %j",
    async (data) => {
      const mock = request(user, data, user);
      await expect(
        readSummary(mock as typeof apiRequest, user, signal()),
      ).rejects.toThrow("工作台");
      expect(mock).toHaveBeenCalledTimes(2);
    },
  );
  it("does not treat a configurable role with protected grants as system_admin", async () => {
    const expected = {
      ...user,
      permissionKeys: [
        ...user.permissionKeys,
        "ai:knowledge:list",
        "revenue:system:summary",
      ],
    };
    const mock = request(expected, { ...empty, rag: { failed: 0 } }, expected);
    await expect(
      readSummary(mock as typeof apiRequest, expected, signal()),
    ).rejects.toThrow("授权");
  });
  it.each(["identity-before", "data", "identity-after"])(
    "cancels a late %s response",
    async (phase) => {
      const pending = deferred(),
        controller = new AbortController(),
        mock = vi.fn();
      if (phase !== "identity-before") mock.mockResolvedValueOnce(user);
      if (phase === "identity-after") mock.mockResolvedValueOnce(merchant);
      mock.mockImplementationOnce(() => pending.promise);
      const task = readSummary(
        mock as typeof apiRequest,
        user,
        controller.signal,
      );
      await vi.waitFor(() =>
        expect(mock).toHaveBeenCalledTimes(
          phase === "identity-before" ? 1 : phase === "data" ? 2 : 3,
        ),
      );
      controller.abort();
      pending.resolve(phase === "data" ? merchant : user);
      await expect(task).rejects.toMatchObject({ name: "AbortError" });
    },
  );
  it("hiding clears private panels, cancels pending reads, and still allows an explicit new read", async () => {
    const pending = deferred(),
      mock = vi
        .fn()
        .mockResolvedValueOnce(user)
        .mockImplementationOnce(() => pending.promise),
      states: SummaryState[] = [];
    const run = createSummaryRun(
      (state) => states.push(state),
      user,
      mock as typeof apiRequest,
    );
    const task = run.load();
    await vi.waitFor(() => expect(mock).toHaveBeenCalledTimes(2));
    run.clear();
    pending.resolve(merchant);
    await task;
    expect(states.every((state) => state.status === "loading")).toBe(true);
    mock
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce(merchant)
      .mockResolvedValueOnce(user);
    await run.load();
    expect(states.at(-1)).toEqual({ status: "ready", data: merchant });
    run.dispose();
    const count = states.length;
    run.clear();
    expect(states).toHaveLength(count);
  });
});
