import { describe, it, expect } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import {
  canReadMerchantRevenue,
  initialRevenueFilters,
  revenueOperatorKey,
  revenueQuery,
  revenueReadError,
  verifyRevenueOperator,
} from "@/features/revenue/merchant-revenue-model";
import {
  operator,
  filters,
} from "@/features/revenue/merchant-revenue-fixtures.test-helper";
describe("merchant revenue identity and applied filters", () => {
  it("accepts configured business grants without a merchant role key", () => {
    expect(canReadMerchantRevenue(operator)).toBe(true);
    expect(
      revenueOperatorKey({
        ...operator,
        permissionKeys: [...operator.permissionKeys].reverse(),
      }),
    ).toBe(revenueOperatorKey(operator));
  });
  it.each(["management:portal:enter", "revenue:merchant:list"])(
    "requires %s",
    (grant) => {
      expect(
        canReadMerchantRevenue({
          ...operator,
          permissionKeys: operator.permissionKeys.filter(
            (key) => key !== grant,
          ),
        }),
      ).toBe(false);
    },
  );
  it.each([null, {}, { merchantId: 0 }, { merchantId: 2147483648 }])(
    "rejects invalid merchant %j",
    (merchant) => {
      expect(canReadMerchantRevenue({ ...operator, merchant })).toBe(false);
    },
  );
  it.each([0, -1, 1.5, 2147483648])("rejects invalid actor %s", (userId) => {
    expect(canReadMerchantRevenue({ ...operator, userId })).toBe(false);
  });
  it.each([
    { ...operator, userId: 43 },
    { ...operator, merchant: { merchantId: 8 } },
    { ...operator, roles: [{ roleKey: "other", roleName: "另一角色" }] },
    { ...operator, permissionKeys: [...operator.permissionKeys, "new:grant"] },
  ])(
    "invalidates the previous view for identity or authorization changes %j",
    (current) => {
      expect(revenueOperatorKey(current)).not.toBe(
        revenueOperatorKey(operator),
      );
      expect(() => verifyRevenueOperator(current, operator)).toThrow("变化");
    },
  );
  it("uses explicit Beijing calendar dates across UTC midnight", () => {
    expect(initialRevenueFilters(new Date("2026-10-31T16:30:00Z"))).toEqual({
      resortId: "",
      fromDate: "2026-10-03",
      toDate: "2026-11-01",
    });
  });
  it("normalizes the optional resort and only sends approved query keys", () => {
    expect(
      Object.fromEntries(revenueQuery({ ...filters, resortId: " 9 " }, 2, 50)),
    ).toEqual({
      page: "2",
      pageSize: "50",
      resortId: "9",
      fromDate: filters.fromDate,
      toDate: filters.toDate,
    });
    expect(revenueQuery({ ...filters, resortId: " " }).has("resortId")).toBe(
      false,
    );
  });
  it.each([
    { resortId: "-1" },
    { resortId: "1.5" },
    { resortId: "0" },
    { resortId: "1e2" },
    { resortId: "2147483648" },
    { fromDate: "" },
    { toDate: "" },
    { fromDate: "2026-02-30" },
    { fromDate: "2026-99-99" },
    { fromDate: "2026-11-01", toDate: "2026-10-30" },
    { fromDate: "2025-01-01", toDate: "2026-01-03" },
  ])("rejects invalid drafts %j before reading", (patch) => {
    expect(() => revenueQuery({ ...filters, ...patch })).toThrow();
  });
  it.each([
    [0, 20],
    [1.5, 20],
    [2147483648, 1],
    [2147483647, 100],
    [1, 0],
    [1, 101],
    [1, 1.5],
  ])("rejects invalid pagination %s/%s", (page, pageSize) => {
    expect(() => revenueQuery(filters, page, pageSize)).toThrow();
  });
  it("allows leap days and the backend's inclusive 367-day limit", () => {
    expect(() =>
      revenueQuery({
        ...filters,
        fromDate: "2024-02-29",
        toDate: "2025-03-01",
      }),
    ).not.toThrow();
    expect(() =>
      revenueQuery({
        ...filters,
        fromDate: "2024-02-29",
        toDate: "2025-03-02",
      }),
    ).toThrow("367");
  });
  it.each([401, 403, 404, 500])(
    "maps %s and preserves trace ID without private error text",
    (status) => {
      const text = revenueReadError(
        new ApiError("secret sql", {
          status,
          code: status,
          traceId: "trace-revenue",
        }),
      );
      expect(text).toContain("trace-revenue");
      expect(text).not.toContain("secret");
    },
  );
});
