import { describe, expect, it, vi } from "vitest";
import type { apiRequest } from "@/platform/api";
import type { CurrentUser } from "@/platform/auth/session-model";
import {
  parseDashboardResorts,
  parseDashboardRevenue,
} from "@/features/merchant-dashboard/dashboard-response";
import {
  readMerchantDashboard,
  merchantDashboardIdentity,
} from "@/features/merchant-dashboard/dashboard-queries";
import { createMerchantDashboardRun } from "@/features/merchant-dashboard/dashboard-run";
import {
  loadMerchantDashboard,
  type DashboardFilters,
  type DashboardView,
} from "@/features/merchant-dashboard/dashboard-model";

const user: CurrentUser = {
  userId: 7,
  account: "operator",
  nickname: "业务账号",
  avatarUrl: null,
  roles: [{ roleKey: "custom", roleName: "可配置角色" }],
  merchant: { merchantId: 8, businessName: "商家" },
  menuTree: [],
  permissionKeys: [
    "management:portal:enter",
    "merchant:dashboard:read",
    "resort:merchant:list",
    "revenue:merchant:list",
  ],
};
const filters: DashboardFilters = {
  fromDate: "2026-10-01",
  toDate: "2026-10-30",
  resortId: "7",
  status: "draft",
};
const card = {
  resortId: 7,
  name: "雪场",
  province: "吉林",
  city: null,
  district: null,
  status: "draft",
  updatedAt: "2026-10-30T00:00:00.000Z",
};
const resorts = {
  page: 1,
  pageSize: 5,
  total: 1,
  hasNext: false,
  items: [card],
};
const record = {
  revenueId: 1,
  resortId: 7,
  resortName: "雪场",
  reportDate: "2026-10-01",
  revenueAmount: "123.45",
  source: "manual",
  note: null,
  createdBy: { userId: 1, nickname: "录入人" },
  createdAt: card.updatedAt,
  updatedAt: card.updatedAt,
};
const records = { ...resorts, items: [record] };
const summary = {
  resortId: 7,
  resortName: "雪场",
  fromDate: filters.fromDate,
  toDate: filters.toDate,
  totalAmount: "123.45",
  daily: [{ date: filters.fromDate, amount: "123.45" }],
};
const revenue = { status: "ready", records, summary };
const signal = () => new AbortController().signal;
function request() {
  return vi.fn(async (path: string) =>
    path === "/auth/me"
      ? user
      : path.startsWith("/merchant/resorts?")
        ? resorts
        : path.startsWith("/merchant/revenue/summary?")
          ? summary
          : records,
  );
}
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((yes) => {
    resolve = yes;
  });
  return { resolve, promise };
}

describe("merchant overview projection", () => {
  it("keeps only displayed resort fields and approved revenue fields at every depth", () => {
    expect(
      parseDashboardResorts(
        {
          ...resorts,
          secret: "private",
          items: [
            { ...card, customFields: { private: "secret" }, merchantId: 999 },
          ],
        },
        "draft",
      ),
    ).toEqual(resorts);
    expect(
      parseDashboardRevenue(
        {
          ...revenue,
          private: true,
          records: {
            ...records,
            items: [
              {
                ...record,
                owner: "secret",
                createdBy: { ...record.createdBy, password: "secret" },
              },
            ],
          },
          summary: {
            ...summary,
            secret: "secret",
            daily: [{ ...summary.daily[0], secret: true }],
          },
        },
        filters,
      ),
    ).toEqual(revenue);
  });
  it.each([
    null,
    [],
    {},
    { ...resorts, items: null },
    { ...resorts, page: 2 },
    { ...resorts, pageSize: 20 },
    { ...resorts, total: -1 },
    { ...resorts, total: 1.5 },
    { ...resorts, hasNext: true },
    { ...resorts, items: [card, card], total: 2 },
    { ...resorts, items: [{ ...card, resortId: "7" }] },
    { ...resorts, items: [{ ...card, name: null }] },
    { ...resorts, items: [{ ...card, status: "published" }] },
    { ...resorts, items: [{ ...card, updatedAt: "invalid" }] },
  ])("rejects malformed or mismatching resorts %j", (value) => {
    expect(() => parseDashboardResorts(value, "draft")).toThrow();
  });
  it.each(["-1.00", "1e2", 123, "NaN", "1.001", "", null])(
    "rejects invalid financial values %j before BigInt rendering",
    (value) => {
      expect(() =>
        parseDashboardRevenue(
          { ...revenue, summary: { ...summary, totalAmount: value } },
          filters,
        ),
      ).toThrow();
    },
  );
  it.each([
    { resortId: 9 },
    { fromDate: "2026-10-02" },
    { toDate: "2026-10-29" },
    { daily: [{ date: "2026-11-01", amount: "1.00" }] },
    {
      daily: [
        { date: "2026-10-01", amount: "1.00" },
        { date: "2026-10-01", amount: "2.00" },
      ],
    },
    { daily: [{ date: "2026-02-30", amount: "1.00" }] },
  ])("rejects mismatching summary %j", (patch) => {
    expect(() =>
      parseDashboardRevenue(
        { ...revenue, summary: { ...summary, ...patch } },
        filters,
      ),
    ).toThrow();
  });
  it.each([
    { resortId: 9 },
    { reportDate: "2026-11-01" },
    { createdBy: null },
    { revenueId: 0 },
    { source: "unknown" },
    { revenueAmount: "oops" },
  ])("rejects invalid record %j", (patch) => {
    expect(() =>
      parseDashboardRevenue(
        {
          ...revenue,
          records: { ...records, items: [{ ...record, ...patch }] },
        },
        filters,
      ),
    ).toThrow();
  });
  it("preserves exact large aggregate strings and zero", () => {
    expect(
      parseDashboardRevenue(
        {
          ...revenue,
          summary: {
            ...summary,
            totalAmount: "9007199254740993.99",
            daily: [{ date: filters.fromDate, amount: "0.00" }],
          },
        },
        filters,
      ).summary.totalAmount,
    ).toBe("9007199254740993.99");
  });
  it("keeps the other panel available after invalid data", async () => {
    const mock = request();
    mock.mockImplementation(async (path) =>
      path.startsWith("/merchant/resorts?")
        ? ({ ...resorts, total: "oops" } as never)
        : path.includes("/summary?")
          ? (summary as never)
          : (records as never),
    );
    expect(
      await loadMerchantDashboard(
        filters,
        user.permissionKeys,
        signal(),
        mock as typeof apiRequest,
      ),
    ).toMatchObject({
      resorts: { status: "error" },
      revenue: { status: "ready" },
    });
  });
});
describe("merchant overview identity and cancellation", () => {
  it("checks identity before and after the three private reads with no-store", async () => {
    const mock = request(),
      controller = new AbortController();
    const result = await readMerchantDashboard(
      mock as typeof apiRequest,
      user,
      filters,
      controller.signal,
    );
    expect(result).toMatchObject({
      resorts: { status: "ready", data: resorts },
      revenue: { status: "ready", data: revenue },
    });
    expect(mock.mock.calls.map((call) => call[0])).toEqual([
      "/auth/me",
      expect.stringContaining("/merchant/resorts?"),
      expect.stringContaining("/merchant/revenue?"),
      expect.stringContaining("/merchant/revenue/summary?"),
      "/auth/me",
    ]);
    for (const call of mock.mock.calls as unknown as [
      string,
      { signal: AbortSignal; cache: string },
    ][])
      expect(call[1]).toEqual({ signal: controller.signal, cache: "no-store" });
  });
  it.each([
    { ...user, userId: 9 },
    { ...user, account: "other" },
    { ...user, merchant: { merchantId: 9, businessName: "other" } },
    { ...user, merchant: null },
    {
      ...user,
      permissionKeys: ["management:portal:enter", "merchant:dashboard:read"],
    },
    { ...user, roles: [] },
  ])("rejects changed final identity %j", async (changed) => {
    const mock = request();
    let n = 0;
    const transport = (async (path, options) => {
      if (path === "/auth/me" && ++n === 2) return changed;
      return (mock as typeof apiRequest)(path, options);
    }) as typeof apiRequest;
    await expect(
      readMerchantDashboard(transport, user, filters, signal()),
    ).rejects.toThrow("身份");
  });
  it.each([
    { ...user, merchant: null },
    { ...user, permissionKeys: [] },
    { ...user, roles: null },
  ])("denies local invalid identity without a request %j", async (changed) => {
    const mock = request();
    await expect(
      readMerchantDashboard(
        mock as typeof apiRequest,
        changed as CurrentUser,
        filters,
        signal(),
      ),
    ).rejects.toThrow();
    expect(mock).not.toHaveBeenCalled();
  });
  it("rejects excessive dates before any request and normalizes identity sets", async () => {
    const mock = request();
    await expect(
      readMerchantDashboard(
        mock as typeof apiRequest,
        user,
        { ...filters, fromDate: "2020-01-01" },
        signal(),
      ),
    ).rejects.toThrow("367");
    expect(mock).not.toHaveBeenCalled();
    expect(
      merchantDashboardIdentity({
        ...user,
        roles: [{ roleKey: "custom", roleName: "renamed" }],
        permissionKeys: [...user.permissionKeys].reverse(),
      }),
    ).toBe(merchantDashboardIdentity(user));
  });
  it.each(["before", "data", "after"])(
    "ignores cancellation during %s even if transport resolves",
    async (phase) => {
      const mock = request(),
        pending = deferred(),
        controller = new AbortController();
      let reads = 0;
      const transport = (async (path, options) => {
        if (
          (phase === "data" && path.startsWith("/merchant/resorts?")) ||
          (path === "/auth/me" && ++reads === (phase === "before" ? 1 : 2))
        )
          return pending.promise;
        return (mock as typeof apiRequest)(path, options);
      }) as typeof apiRequest;
      const task = readMerchantDashboard(
        transport,
        user,
        filters,
        controller.signal,
      );
      await vi.waitFor(() =>
        expect(
          phase === "data" ? mock.mock.calls.length : reads,
        ).toBeGreaterThanOrEqual(phase === "after" ? 2 : 1),
      );
      controller.abort();
      pending.resolve(phase === "data" ? resorts : user);
      await expect(task).rejects.toMatchObject({ name: "AbortError" });
    },
  );
  it("clears hidden results, rejects late completion, allows explicit recovery and stops on dispose", async () => {
    const pending = deferred(),
      mock = request();
    mock.mockImplementationOnce(async () => pending.promise as never);
    const views: DashboardView[] = [],
      run = createMerchantDashboardRun(
        (view) => views.push(view),
        user,
        mock as typeof apiRequest,
      );
    const task = run.load(filters);
    run.clear();
    pending.resolve(user);
    await task;
    expect(views.every((view) => view.resorts.status === "loading")).toBe(true);
    await run.load(filters);
    expect(views.at(-1)?.revenue.status).toBe("ready");
    run.dispose();
    const count = views.length;
    await run.load(filters);
    run.clear();
    expect(views).toHaveLength(count);
  });
});
