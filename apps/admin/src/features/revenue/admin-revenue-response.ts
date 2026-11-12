import type { components } from "@common/api-contracts/openapi";
function invalid(): never {
  throw new Error("收益结果响应无效，请保留原请求并重新核对");
}
function row(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) invalid();
  return v as Record<string, unknown>;
}
function text(v: unknown): string {
  if (typeof v !== "string" || !v.trim()) invalid();
  return v;
}
function count(v: unknown, max = 5000): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0 || v > max)
    invalid();
  return v;
}
function id(v: unknown) {
  const n = count(v, 2147483647);
  if (n < 1) invalid();
  return n;
}
function time(v: unknown) {
  const s = text(v);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(s) || !Number.isFinite(Date.parse(s)))
    invalid();
  return s;
}
function uuid(v: unknown) {
  const s = text(v);
  if (
    !/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(
      s,
    )
  )
    invalid();
  return s;
}
export function parseRevenueRequest(
  value: unknown,
): components["schemas"]["RevenueRequestVO"] {
  const v = row(value),
    r = row(v.result),
    date = text(r.reportDate),
    parsed = new Date(`${date}T00:00:00Z`);
  if (
    v.status !== "completed" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date ||
    typeof r.revenueAmount !== "string" ||
    !/^\d{1,10}\.\d{2}$/.test(r.revenueAmount) ||
    (r.source !== "manual" && r.source !== "import")
  )
    invalid();
  return {
    requestId: uuid(v.requestId),
    status: "completed",
    createdAt: time(v.createdAt),
    completedAt: time(v.completedAt),
    result: {
      revenueId: id(r.revenueId),
      resortId: id(r.resortId),
      reportDate: date,
      revenueAmount: r.revenueAmount,
      source: r.source,
      createdAt: time(r.createdAt),
      updatedAt: time(r.updatedAt),
    },
  };
}
export function parseRevenueImportJob(
  value: unknown,
  expectedJobId?: string,
): components["schemas"]["RevenueImportJobVO"] {
  const v = row(value),
    jobId = uuid(v.jobId),
    status = v.status;
  if (expectedJobId !== undefined && jobId !== expectedJobId) invalid();
  if (
    status !== "pending" &&
    status !== "processing" &&
    status !== "completed" &&
    status !== "failed"
  )
    invalid();
  const totalRows = count(v.totalRows),
    processedRows = count(v.processedRows),
    succeededRows = count(v.succeededRows),
    failedRows = count(v.failedRows);
  if (processedRows > totalRows || processedRows !== succeededRows + failedRows)
    invalid();
  const terminal = status === "completed" || status === "failed";
  let result: components["schemas"]["RevenueImportResultVO"] | null = null;
  if (terminal) {
    const r = row(v.result);
    if (
      r.totalRows !== totalRows ||
      r.succeededRows !== succeededRows ||
      r.failedRows !== failedRows ||
      !Array.isArray(r.results) ||
      r.results.length !== totalRows ||
      (status === "completed" && processedRows !== totalRows)
    )
      invalid();
    const results = r.results.map((value) => {
      const item = row(value),
        rowNumber = count(item.rowNumber, 5001);
      if (
        rowNumber < 2 ||
        typeof item.success !== "boolean" ||
        (item.error !== null && typeof item.error !== "string")
      )
        invalid();
      const revenueId = item.revenueId === null ? null : id(item.revenueId),
        error = item.error as string | null;
      if (
        (item.success && (revenueId === null || error !== null)) ||
        (!item.success && revenueId !== null) ||
        (status === "completed" && !item.success && !error)
      )
        invalid();
      return { rowNumber, success: item.success, revenueId, error };
    });
    if (
      new Set(results.map((r) => r.rowNumber)).size !== results.length ||
      results.filter((r) => r.success).length !== succeededRows ||
      results.filter((r) => !r.success && r.error !== null).length !==
        failedRows
    )
      invalid();
    result = { totalRows, succeededRows, failedRows, results };
  } else if (v.result !== null) invalid();
  return {
    jobId,
    status,
    createdAt: time(v.createdAt),
    updatedAt: time(v.updatedAt),
    totalRows,
    processedRows,
    succeededRows,
    failedRows,
    result,
  };
}
