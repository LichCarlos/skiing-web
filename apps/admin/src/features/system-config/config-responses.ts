import type {
  ConfigItem,
  ConfigPage,
} from "@/features/system-config/config-api";
import {
  ConfigInputError,
  configLimits,
  isConfigKey,
} from "@/features/system-config/config-model";
function invalid(): never {
  throw new ConfigInputError("配置目录不完整或不匹配，请刷新核对");
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function integer(value: unknown, min = 0) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > 2147483647
  )
    invalid();
  return value;
}
function nullableText(value: unknown, max: number): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !value.trim() || [...value].length > max)
    invalid();
  return value;
}
export function parseConfigItem(value: unknown): ConfigItem {
  const source = record(value),
    key = source.configKey;
  if (
    typeof key !== "string" ||
    !isConfigKey(key) ||
    source.valueType !== "text" ||
    source.maxLength !== configLimits[key] ||
    typeof source.label !== "string" ||
    !source.label.trim()
  )
    invalid();
  let updatedAt: string | null = null;
  if (source.updatedAt !== null) {
    if (
      typeof source.updatedAt !== "string" ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(
        source.updatedAt,
      ) ||
      !Number.isFinite(Date.parse(source.updatedAt))
    )
      invalid();
    updatedAt = source.updatedAt;
  }
  return {
    configKey: key,
    label: source.label,
    valueType: "text",
    maxLength: configLimits[key],
    value: nullableText(source.value, configLimits[key]),
    defaultValue: nullableText(source.defaultValue, configLimits[key]),
    version: integer(source.version),
    updatedAt,
    updatedByUserId:
      source.updatedByUserId === null
        ? null
        : integer(source.updatedByUserId, 1),
  };
}
export function parseConfigPage(
  value: unknown,
  query: { keyword: string; page: number; pageSize: number },
): ConfigPage {
  const source = record(value),
    total = integer(source.total);
  if (
    total > Object.keys(configLimits).length ||
    source.page !== query.page ||
    source.pageSize !== query.pageSize ||
    !Array.isArray(source.items) ||
    source.items.length !==
      Math.min(
        query.pageSize,
        Math.max(0, total - (query.page - 1) * query.pageSize),
      ) ||
    source.hasNext !== query.page * query.pageSize < total
  )
    invalid();
  const items = source.items.map(parseConfigItem),
    keyword = query.keyword.trim().toLowerCase();
  if (
    new Set(items.map((item) => item.configKey)).size !== items.length ||
    items.some(
      (item) =>
        !`${item.configKey} ${item.label}`.toLowerCase().includes(keyword),
    )
  )
    invalid();
  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    hasNext: source.hasNext as boolean,
  };
}
