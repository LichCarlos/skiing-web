import { parseMerchantResort } from "@/features/merchant-resorts/resort-responses";
import {
  GlobalResortError,
  type GlobalResort,
  type GlobalResortPage,
  type GlobalResortFilters,
} from "@/features/admin-resorts/global-resort-model";
function invalid(): never {
  throw new GlobalResortError("雪场响应与目标不匹配，请刷新后核对");
}
function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 100)
    invalid();
  return value;
}
function customValue(
  value: unknown,
): GlobalResort["customFields"][number]["value"] {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  )
    return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "string"))
    return [...value];
  return invalid();
}
export function parseGlobalResort(
  value: unknown,
  expectedId?: number,
): GlobalResort {
  const source = row(value);
  if (expectedId !== undefined && source.resortId !== expectedId) invalid();
  if (
    !Array.isArray(source.fitTags) ||
    !Array.isArray(source.customFields) ||
    (source.merchantId !== null &&
      (typeof source.merchantId !== "number" ||
        !Number.isInteger(source.merchantId) ||
        source.merchantId < 1 ||
        source.merchantId > 2147483647)) ||
    (source.merchantName !== null && typeof source.merchantName !== "string")
  )
    invalid();
  const fitTags = source.fitTags.map((value) => {
    const tag = row(value);
    return { value: text(tag.value), label: text(tag.label) };
  });
  const customFields = source.customFields.map((value) => {
    const field = row(value);
    return {
      fieldKey: text(field.fieldKey),
      label: text(field.label),
      value: customValue(field.value),
    };
  });
  if (
    new Set(customFields.map((field) => field.fieldKey)).size !==
    customFields.length
  )
    invalid();
  const common = parseMerchantResort(
    {
      ...source,
      fitTags: fitTags.map((tag) => tag.value),
      customFields: Object.fromEntries(
        customFields.map((field) => [field.fieldKey, field.value]),
      ),
    },
    expectedId,
  );
  return {
    ...common,
    merchantId: source.merchantId as number | null,
    merchantName: source.merchantName as string | null,
    fitTags,
    customFields,
  };
}
export function parseGlobalResortPage(
  value: unknown,
  filters: GlobalResortFilters,
): GlobalResortPage {
  try {
    const data = row(value),
      { page } = filters;
    if (
      data.page !== page ||
      data.pageSize !== 20 ||
      typeof data.total !== "number" ||
      !Number.isSafeInteger(data.total) ||
      data.total < 0 ||
      !Array.isArray(data.items) ||
      data.items.length !==
        Math.min(20, Math.max(0, data.total - (page - 1) * 20)) ||
      data.hasNext !== page * 20 < data.total
    )
      invalid();
    const items = data.items.map((item) => parseGlobalResort(item));
    if (
      new Set(items.map((item) => item.resortId)).size !== items.length ||
      items.some(
        (item) =>
          (filters.status !== undefined && item.status !== filters.status) ||
          (filters.merchantId != null &&
            item.merchantId !== filters.merchantId),
      )
    )
      invalid();
    return {
      items,
      page,
      pageSize: 20,
      total: data.total,
      hasNext: data.hasNext as boolean,
    };
  } catch {
    throw new GlobalResortError("雪场分页响应异常，请重新读取");
  }
}
