import type { components } from "@common/api-contracts/openapi";
import { apiRequest } from "@/platform/api";

type Page = components["schemas"]["RevenuePageVO"];
type Summary = components["schemas"]["RevenueSummaryVO"];
type Upsert = components["schemas"]["UpsertRevenueDto"];
export type RevenueView =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; records: Page; summary: Summary };

export async function loadRevenue(
  query: URLSearchParams,
  signal: AbortSignal,
  request: typeof apiRequest = apiRequest,
): Promise<Extract<RevenueView, { status: "ready" }>> {
  signal.throwIfAborted();
  const [records, summary] = await Promise.all([
    request<Page>(`/merchant/revenue?${query}`, { signal, cache: "no-store" }),
    request<Summary>(`/merchant/revenue/summary?${query}`, {
      signal,
      cache: "no-store",
    }),
  ]);
  signal.throwIfAborted();
  return { status: "ready", records, summary };
}

export function buildRevenueInput(input: {
  resortId: number | null;
  reportDate: string;
  revenueAmount: string | null;
  note: string;
}): Upsert {
  const { resortId, reportDate, revenueAmount } = input;
  if (
    resortId === null ||
    !Number.isSafeInteger(resortId) ||
    resortId < 1 ||
    resortId > 2147483647
  )
    throw new Error("请填写有效的雪场 ID");
  const date = new Date(`${reportDate}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(reportDate) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== reportDate
  )
    throw new Error("请填写有效日期");
  if (revenueAmount === null || !/^\d{1,10}(\.\d{1,2})?$/.test(revenueAmount))
    throw new Error("金额须非负、最多十位整数和两位小数");
  const note = input.note.trim();
  if (note.length > 300) throw new Error("备注不能超过 300 字符");
  return { resortId, reportDate, revenueAmount, note: note || null };
}

export function formatRevenue(value: string): string {
  const [integer, fraction = "00"] = value.split(".");
  return `¥${BigInt(integer || "0").toLocaleString("zh-CN")}.${fraction.padEnd(2, "0")}`;
}
