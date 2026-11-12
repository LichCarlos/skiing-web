import type { components } from "@common/api-contracts/openapi";
import {
  revenueQuery,
  RevenueQueryError,
  type MerchantRevenueFilters,
} from "@/features/revenue/merchant-revenue-model";
import type { RevenueView } from "@/features/revenue/revenue-model";
function invalid(): never {
  throw new RevenueQueryError("收益响应异常或与当前筛选不匹配，请重新查询");
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
function date(value: unknown): string {
  const result = text(value),
    parsed = new Date(`${result}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(result) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== result
  )
    invalid();
  return result;
}
function amount(value: unknown): string {
  if (typeof value !== "string" || !/^\d+\.\d{2}$/.test(value)) invalid();
  return value;
}
function unique<T>(items: T[], key: (item: T) => unknown): T[] {
  if (new Set(items.map(key)).size !== items.length) invalid();
  return items;
}
export function parseRevenueResult(
  value: unknown,
  filters: MerchantRevenueFilters,
  page: number,
  pageSize: number,
): Extract<RevenueView, { status: "ready" }> {
  const query = revenueQuery(filters, page, pageSize),
    selected = query.has("resortId") ? Number(query.get("resortId")) : null;
  const data = row(value),
    records = row(data.records),
    summary = row(data.summary),
    rawItems = list(records.items);
  if (
    records.page !== page ||
    records.pageSize !== pageSize ||
    typeof records.total !== "number" ||
    !Number.isSafeInteger(records.total) ||
    records.total < rawItems.length ||
    rawItems.length > pageSize ||
    records.hasNext !== page * pageSize < records.total
  )
    invalid();
  if (
    summary.resortId !== selected ||
    summary.fromDate !== filters.fromDate ||
    summary.toDate !== filters.toDate
  )
    invalid();
  const within = (value: unknown) => {
    const result = date(value);
    if (result < filters.fromDate || result > filters.toDate) invalid();
    return result;
  };
  const items = rawItems.map(
    (value): components["schemas"]["RevenueRecordVO"] => {
      const item = row(value),
        creator = row(item.createdBy),
        resortId = id(item.resortId);
      if (
        (selected !== null && resortId !== selected) ||
        (item.source !== "manual" && item.source !== "import")
      )
        invalid();
      return {
        revenueId: id(item.revenueId),
        resortId,
        resortName: text(item.resortName),
        reportDate: within(item.reportDate),
        revenueAmount: amount(item.revenueAmount),
        source: item.source,
        note: nullableText(item.note),
        createdBy: {
          userId: id(creator.userId),
          nickname: text(creator.nickname),
        },
        createdAt: timestamp(item.createdAt),
        updatedAt: timestamp(item.updatedAt),
      };
    },
  );
  const daily = list(summary.daily).map((value) => {
    const item = row(value);
    return { date: within(item.date), amount: amount(item.amount) };
  });
  return {
    status: "ready",
    records: {
      page,
      pageSize,
      total: records.total,
      hasNext: records.hasNext as boolean,
      items: unique(items, (item) => item.revenueId),
    },
    summary: {
      resortId: selected,
      resortName: nullableText(summary.resortName),
      fromDate: date(summary.fromDate),
      toDate: date(summary.toDate),
      totalAmount: amount(summary.totalAmount),
      daily: unique(daily, (item) => item.date),
    },
  };
}
