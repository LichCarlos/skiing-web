import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ApiError } from "@common/api-contracts/client";
import type { components } from "@common/api-contracts/openapi";
import type { apiRequest } from "@/platform/api";
import { DashboardSections } from "@/features/merchant-dashboard/dashboard-sections";
import {
  initialDashboardFilters,
  loadMerchantDashboard,
  validateDashboardFilters,
  type DashboardFilters,
  type ResortPage,
} from "@/features/merchant-dashboard/dashboard-model";

const grants = [
  "management:portal:enter",
  "merchant:dashboard:read",
  "resort:merchant:list",
  "revenue:merchant:list",
];
const filters: DashboardFilters = {
  fromDate: "2026-10-01",
  toDate: "2026-10-30",
  resortId: "7",
  status: "pending_review",
};
const resorts: ResortPage = {
  items: [],
  total: 17,
  page: 1,
  pageSize: 5,
  hasNext: true,
};
const records: components["schemas"]["RevenuePageVO"] = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 5,
  hasNext: false,
};
const summary: components["schemas"]["RevenueSummaryVO"] = {
  resortId: 7,
  resortName: "雪场甲",
  fromDate: filters.fromDate,
  toDate: filters.toDate,
  totalAmount: "9999999999.99",
  daily: [{ date: "2026-10-01", amount: "0.10" }],
};
function transport() {
  return vi.fn(async (path: string) =>
    path.startsWith("/merchant/resorts?")
      ? resorts
      : path.startsWith("/merchant/revenue/summary?")
        ? summary
        : records,
  );
}
function error(status: number) {
  return new ApiError("private server diagnostic", {
    status,
    code: status,
    traceId: "trace-public-id",
  });
}

describe("merchant dashboard authorization, queries and cancellation", () => {
  it.each(
    [
      [],
      grants.filter((g) => g !== "management:portal:enter"),
      grants.filter((g) => g !== "merchant:dashboard:read"),
    ].map((permissionKeys) => ({ permissionKeys })),
  )(
    "makes no request without both entry grants: %j",
    async ({ permissionKeys }) => {
      const request = transport();
      const view = await loadMerchantDashboard(
        filters,
        permissionKeys,
        new AbortController().signal,
        request as typeof apiRequest,
      );
      expect(request).not.toHaveBeenCalled();
      expect(view).toMatchObject({
        resorts: { status: "blocked" },
        revenue: { status: "blocked" },
      });
    },
  );
  it.each(["resort:merchant:list", "revenue:merchant:list"])(
    "loads only independently granted panels without role-key assumptions: %s",
    async (resourceGrant) => {
      const request = transport();
      const view = await loadMerchantDashboard(
        filters,
        grants.filter((g) => g !== resourceGrant),
        new AbortController().signal,
        request as typeof apiRequest,
      );
      expect(view.resorts.status).toBe(
        resourceGrant === "resort:merchant:list" ? "blocked" : "ready",
      );
      expect(view.revenue.status).toBe(
        resourceGrant === "revenue:merchant:list" ? "blocked" : "ready",
      );
      expect(request).toHaveBeenCalledTimes(
        resourceGrant === "resort:merchant:list" ? 2 : 1,
      );
    },
  );
  it("forwards the same date/resort filters and signal without client identity or aggregate inference", async () => {
    const request = transport(),
      signal = new AbortController().signal;
    const view = await loadMerchantDashboard(
      filters,
      grants,
      signal,
      request as typeof apiRequest,
    );
    expect(request).toHaveBeenCalledTimes(3);
    for (const [path, options] of request.mock.calls as unknown as [
      string,
      { signal: AbortSignal },
    ][]) {
      expect(options.signal).toBe(signal);
      const url = new URL(path, "https://local.invalid");
      expect(url.searchParams.get("pageSize")).toBe("5");
      expect(url.searchParams.get("page")).toBe("1");
      expect(url.searchParams.has("merchantId")).toBe(false);
      expect(url.searchParams.has("userId")).toBe(false);
      if (url.pathname === "/merchant/resorts") {
        expect(url.searchParams.get("status")).toBe("pending_review");
        expect(url.searchParams.has("resortId")).toBe(false);
      } else {
        expect(url.searchParams.get("fromDate")).toBe(filters.fromDate);
        expect(url.searchParams.get("toDate")).toBe(filters.toDate);
        expect(url.searchParams.get("resortId")).toBe("7");
        expect(url.searchParams.has("status")).toBe(false);
      }
    }
    expect(view.resorts).toEqual({ status: "ready", data: resorts });
    expect(view.revenue).toMatchObject({
      status: "ready",
      data: { records, summary },
    });
  });
  it.each([401, 403, 404, 500])(
    "keeps revenue available on resort failure and sanitizes status %s",
    async (status) => {
      const request = vi.fn(async (path: string) => {
        if (path.startsWith("/merchant/resorts?")) throw error(status);
        return path.startsWith("/merchant/revenue/summary?")
          ? summary
          : records;
      });
      const view = await loadMerchantDashboard(
        filters,
        grants,
        new AbortController().signal,
        request as typeof apiRequest,
      );
      expect(view.resorts).toMatchObject({
        status: "error",
        traceId: "trace-public-id",
      });
      expect(JSON.stringify(view.resorts)).not.toContain(
        "private server diagnostic",
      );
      expect(view.revenue.status).toBe("ready");
    },
  );
  it.each(["/merchant/revenue?", "/merchant/revenue/summary?"])(
    "does not expose partial financial data if %s fails",
    async (failurePath) => {
      const request = vi.fn(async (path: string) => {
        if (path.startsWith(failurePath)) throw error(403);
        return path.startsWith("/merchant/resorts?")
          ? resorts
          : path.startsWith("/merchant/revenue/summary?")
            ? summary
            : records;
      });
      const view = await loadMerchantDashboard(
        filters,
        grants,
        new AbortController().signal,
        request as typeof apiRequest,
      );
      expect(view.resorts.status).toBe("ready");
      expect(view.revenue).toEqual({
        status: "error",
        message: "收益查询未获授权或数据范围不可用",
        traceId: "trace-public-id",
      });
    },
  );
  it("ignores late transport results after cancellation", async () => {
    const abort = new AbortController();
    let resolve!: (value: ResortPage) => void;
    const delayed = new Promise<ResortPage>((done) => {
      resolve = done;
    });
    const request = vi.fn(async (path: string) =>
      path.startsWith("/merchant/resorts?")
        ? delayed
        : path.startsWith("/merchant/revenue/summary?")
          ? summary
          : records,
    );
    const pending = loadMerchantDashboard(
      filters,
      grants,
      abort.signal,
      request as typeof apiRequest,
    );
    abort.abort();
    resolve(resorts);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
  it("does not issue already cancelled requests", async () => {
    const abort = new AbortController();
    abort.abort();
    const request = transport();
    await expect(
      loadMerchantDashboard(
        filters,
        grants,
        abort.signal,
        request as typeof apiRequest,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(request).not.toHaveBeenCalled();
  });
});

describe("dashboard date boundaries and output", () => {
  it("defaults to 30 business dates across the UTC+8 date/year boundary", () => {
    expect(initialDashboardFilters(new Date("2026-12-31T16:00:00Z"))).toEqual({
      fromDate: "2026-12-03",
      toDate: "2027-01-01",
      resortId: "",
      status: "",
    });
    expect(
      validateDashboardFilters({ ...filters, resortId: " 7 " }).resortId,
    ).toBe("7");
  });
  it.each([
    { fromDate: "2026-02-30" },
    { toDate: "2026-99-99" },
    { fromDate: "2026-11-01" },
    { resortId: "0" },
    { resortId: "2147483648" },
    { resortId: "1e2" },
    { status: "invalid" },
  ])("rejects invalid filters without requests: %j", async (patch) => {
    const request = transport();
    await expect(
      loadMerchantDashboard(
        { ...filters, ...patch } as DashboardFilters,
        grants,
        new AbortController().signal,
        request as typeof apiRequest,
      ),
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it("renders actual total, lifecycle, precise amounts and recent records with escaped names", () => {
    const resort: components["schemas"]["MerchantResortVO"] = {
      resortId: 7,
      name: "<雪场甲>",
      province: "吉林",
      city: null,
      district: null,
      address: null,
      longitude: null,
      latitude: null,
      coverAssetId: null,
      coverUrl: null,
      gallery: [],
      rating: null,
      ratingCount: 0,
      fitTags: [],
      price: 100,
      openStatus: "open",
      snowCondition: "snow",
      snowConditionUpdatedAt: null,
      openingHours: null,
      trailSummary: null,
      facilitySummary: null,
      officialUrl: null,
      description: "",
      customFields: {},
      status: "pending_review",
      updatedAt: "2026-10-30T08:00:00Z",
    };
    const record: components["schemas"]["RevenueRecordVO"] = {
      revenueId: 1,
      resortId: 7,
      resortName: "雪场甲",
      reportDate: "2026-10-01",
      revenueAmount: "0.10",
      source: "manual",
      note: null,
      createdBy: { userId: 1, nickname: "管理员" },
      createdAt: resort.updatedAt,
      updatedAt: resort.updatedAt,
    };
    const html = renderToStaticMarkup(
      <DashboardSections
        view={{
          resorts: { status: "ready", data: { ...resorts, items: [resort] } },
          revenue: {
            status: "ready",
            data: {
              status: "ready",
              records: { ...records, items: [record] },
              summary,
            },
          },
        }}
      />,
    );
    for (const text of [
      "<strong>17</strong>",
      "&lt;雪场甲&gt;",
      "审核中",
      "吉林",
      "¥9,999,999,999.99",
      "¥0.10",
      "每日收益",
      "最近 5 条收益记录",
      'href="/admin/merchant/resorts"',
      'href="/admin/merchant/revenue"',
    ])
      expect(html).toContain(text);
  });
  it("renders empty states and zero totals", () => {
    const html = renderToStaticMarkup(
      <DashboardSections
        view={{
          resorts: {
            status: "ready",
            data: { ...resorts, total: 0, hasNext: false },
          },
          revenue: {
            status: "ready",
            data: {
              status: "ready",
              records,
              summary: { ...summary, totalAmount: "0.00", daily: [] },
            },
          },
        }}
      />,
    );
    expect(html).toContain("当前范围和筛选条件下暂无雪场");
    expect(html).toContain("该区间暂无收益记录");
    expect(html).toContain("¥0.00");
  });
  it("does not retain ready data or links in loading, blocked and error panels", () => {
    const html = renderToStaticMarkup(
      <DashboardSections
        view={{
          resorts: { status: "loading" },
          revenue: {
            status: "error",
            message: "收益不可用",
            traceId: "trace-public-id",
          },
        }}
      />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("trace-public-id");
    expect(html).not.toContain("¥");
    expect(html).not.toContain("href=");
    const blocked = renderToStaticMarkup(
      <DashboardSections
        view={{
          resorts: { status: "blocked", message: "尚未授权" },
          revenue: { status: "blocked", message: "尚未授权" },
        }}
      />,
    );
    expect(blocked).toContain("尚未授权");
    expect(blocked).not.toContain("href=");
  });
});
