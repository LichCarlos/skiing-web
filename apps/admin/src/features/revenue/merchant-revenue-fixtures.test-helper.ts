import type { components } from "@common/api-contracts/openapi";
import type {
  RevenueOperator,
  MerchantRevenueFilters,
} from "@/features/revenue/merchant-revenue-model";
export const operator: RevenueOperator = {
  userId: 42,
  account: "snow-operator",
  nickname: "商家账号",
  roles: [{ roleKey: "custom-operations", roleName: "经营管理" }],
  permissionKeys: ["management:portal:enter", "revenue:merchant:list"],
  merchant: { merchantId: 7, businessName: "滑雪场商家" },
  avatarUrl: null,
  menuTree: [],
};
export const filters: MerchantRevenueFilters = {
  resortId: "9",
  fromDate: "2026-10-01",
  toDate: "2026-10-30",
};
export const records: components["schemas"]["RevenuePageVO"] = {
  page: 1,
  pageSize: 20,
  total: 1,
  hasNext: false,
  items: [
    {
      revenueId: 3,
      resortId: 9,
      resortName: "测试雪场",
      reportDate: "2026-10-01",
      revenueAmount: "9999999999.99",
      source: "manual",
      note: null,
      createdBy: { userId: 1, nickname: "管理员" },
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
    },
  ],
};
export const summary: components["schemas"]["RevenueSummaryVO"] = {
  resortId: 9,
  resortName: "测试雪场",
  fromDate: filters.fromDate,
  toDate: filters.toDate,
  totalAmount: "9999999999.99",
  daily: [{ date: "2026-10-01", amount: "9999999999.99" }],
};
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
