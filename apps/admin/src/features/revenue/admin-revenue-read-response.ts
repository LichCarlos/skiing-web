import type { components } from "@common/api-contracts/openapi";

function invalid(): never {
  throw new Error("收益查询响应异常或筛选不匹配，请重新查询");
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) invalid();
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
function time(value: unknown): string {
  const result = text(value);
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(
      result,
    ) ||
    !Number.isFinite(Date.parse(result))
  )
    invalid();
  return result;
}
export function parseAdminRevenuePage(
  value: unknown,
  query: URLSearchParams,
): components["schemas"]["RevenuePageVO"] {
  const source = object(value),
    page = Number(query.get("page")),
    pageSize = Number(query.get("pageSize"));
  if (
    source.page !== page ||
    source.pageSize !== pageSize ||
    typeof source.total !== "number" ||
    !Number.isSafeInteger(source.total) ||
    source.total < 0 ||
    !Array.isArray(source.items) ||
    source.items.length !==
      Math.min(pageSize, Math.max(0, source.total - (page - 1) * pageSize)) ||
    source.hasNext !== page * pageSize < source.total
  )
    invalid();
  const items = source.items.map(
    (value): components["schemas"]["RevenueRecordVO"] => {
      const row = object(value),
        creator = object(row.createdBy),
        reportDate = text(row.reportDate),
        parsed = new Date(`${reportDate}T00:00:00Z`),
        resortId = id(row.resortId);
      if (
        !/^\d{4}-\d\d-\d\d$/.test(reportDate) ||
        !Number.isFinite(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== reportDate ||
        (query.has("resortId") && resortId !== Number(query.get("resortId"))) ||
        (query.has("fromDate") && reportDate < query.get("fromDate")!) ||
        (query.has("toDate") && reportDate > query.get("toDate")!) ||
        typeof row.revenueAmount !== "string" ||
        !/^\d{1,10}\.\d{2}$/.test(row.revenueAmount) ||
        (row.source !== "manual" && row.source !== "import") ||
        (row.note !== null && typeof row.note !== "string")
      )
        invalid();
      return {
        revenueId: id(row.revenueId),
        resortId,
        resortName: text(row.resortName),
        reportDate,
        revenueAmount: row.revenueAmount,
        source: row.source,
        note: row.note as string | null,
        createdBy: {
          userId: id(creator.userId),
          nickname: text(creator.nickname),
        },
        createdAt: time(row.createdAt),
        updatedAt: time(row.updatedAt),
      };
    },
  );
  if (new Set(items.map((item) => item.revenueId)).size !== items.length)
    invalid();
  return {
    items,
    total: source.total,
    page,
    pageSize,
    hasNext: source.hasNext as boolean,
  };
}
