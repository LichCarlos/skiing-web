import type { components } from "@common/api-contracts/openapi";
import { parseRevenueResult } from "@/features/revenue/revenue-response";
import type {
  DashboardFilters,
  RevenueData,
} from "@/features/merchant-dashboard/dashboard-model";

type Resort = components["schemas"]["MerchantResortVO"];
export type DashboardResort = Pick<
  Resort,
  | "resortId"
  | "name"
  | "province"
  | "city"
  | "district"
  | "status"
  | "updatedAt"
>;
export type DashboardResortPage = Omit<
  components["schemas"]["MerchantResortPageVO"],
  "items"
> & { items: DashboardResort[] };
export class DashboardInputError extends Error {}
function invalid(): never {
  throw new DashboardInputError("经营概览响应异常，请重新查询");
}
function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) invalid();
  return value;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) invalid();
  return value;
}
function nullableText(value: unknown): string | null {
  if (value !== null && typeof value !== "string") invalid();
  return value;
}
function id(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 2147483647
  )
    invalid();
  return value;
}
function timestamp(value: unknown): string {
  const result = text(value);
  if (
    !/^\d{4}-\d{2}-\d{2}T/.test(result) ||
    !Number.isFinite(Date.parse(result))
  )
    invalid();
  return result;
}
function page(value: Record<string, unknown>) {
  const items = list(value.items);
  if (
    value.page !== 1 ||
    value.pageSize !== 5 ||
    typeof value.total !== "number" ||
    !Number.isSafeInteger(value.total) ||
    value.total < items.length ||
    items.length > 5 ||
    value.hasNext !== value.total > 5
  )
    invalid();
  return {
    items,
    page: 1,
    pageSize: 5,
    total: value.total,
    hasNext: value.hasNext as boolean,
  };
}
function unique<T>(items: T[], key: (value: T) => unknown): T[] {
  if (new Set(items.map(key)).size !== items.length) invalid();
  return items;
}
export function parseDashboardResorts(
  value: unknown,
  status: DashboardFilters["status"],
): DashboardResortPage {
  const data = page(row(value));
  const items = data.items.map((value): DashboardResort => {
    const item = row(value);
    if (
      !["draft", "pending_review", "published", "offline"].includes(
        String(item.status),
      ) ||
      (status && item.status !== status)
    )
      invalid();
    return {
      resortId: id(item.resortId),
      name: text(item.name),
      province: nullableText(item.province),
      city: nullableText(item.city),
      district: nullableText(item.district),
      status: item.status as Resort["status"],
      updatedAt: timestamp(item.updatedAt),
    };
  });
  return { ...data, items: unique(items, (item) => item.resortId) };
}
export function parseDashboardRevenue(
  value: unknown,
  filters: DashboardFilters,
): RevenueData {
  return parseRevenueResult(value, filters, 1, 5);
}
