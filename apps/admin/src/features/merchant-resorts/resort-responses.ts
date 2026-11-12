import {
  ResortInputError,
  type MerchantResort,
  type ResortPage,
  type ResortSchema,
} from "@/features/merchant-resorts/resort-model";

function invalid(): never {
  throw new ResortInputError("雪场资料不匹配，请刷新并重新核对");
}
function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, max = Infinity, empty = false): string {
  if (
    typeof value !== "string" ||
    (!empty && !value.trim()) ||
    value.length > max
  )
    invalid();
  return value;
}
function nullableText(value: unknown, max = Infinity) {
  return value === null ? null : text(value, max, true);
}
function integer(value: unknown, min = 0): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > 2147483647
  )
    invalid();
  return value;
}
function flag(value: unknown): boolean {
  if (typeof value !== "boolean") invalid();
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
function url(value: unknown): string {
  const result = text(value);
  try {
    const parsed = new URL(result);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      invalid();
  } catch {
    invalid();
  }
  return result;
}
function assetId(value: unknown): string {
  const result = text(value);
  if (!/^[1-9]\d{0,18}$/.test(result) || BigInt(result) > 9223372036854775807n)
    invalid();
  return result;
}
function decimal(value: unknown, min: number, max: number): string | null {
  if (value === null) return null;
  const result = text(value);
  if (
    !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(result) ||
    !Number.isFinite(Number(result)) ||
    Number(result) < min ||
    Number(result) > max
  )
    invalid();
  return result;
}
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
function json(value: unknown, ancestors = new Set<object>()): Json {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (
    !value ||
    typeof value !== "object" ||
    ancestors.has(value) ||
    (!Array.isArray(value) &&
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
  )
    invalid();
  ancestors.add(value);
  try {
    return Array.isArray(value)
      ? Array.from(value, (v) => json(v, ancestors))
      : Object.fromEntries(
          Object.entries(value).map(([k, v]) => [k, json(v, ancestors)]),
        );
  } finally {
    ancestors.delete(value);
  }
}
function objectJson(value: unknown): Record<string, Json> {
  row(value);
  return json(value) as Record<string, Json>;
}
export function parseMerchantResort(
  value: unknown,
  expectedId?: number,
): MerchantResort {
  const item = row(value),
    resortId = integer(item.resortId, 1);
  if (
    (expectedId !== undefined && resortId !== expectedId) ||
    typeof item.status !== "string" ||
    !["draft", "pending_review", "published", "offline"].includes(
      item.status,
    ) ||
    typeof item.openStatus !== "string" ||
    !["open", "closed", "limited", "unknown"].includes(item.openStatus) ||
    !Array.isArray(item.gallery) ||
    !Array.isArray(item.fitTags)
  )
    invalid();
  const gallery = item.gallery.map((value) => {
    const image = row(value);
    return {
      assetId: assetId(image.assetId),
      sortOrder: integer(image.sortOrder),
      url: url(image.url),
    };
  });
  const fitTags = item.fitTags.map((value) => text(value, 100));
  if (
    new Set(gallery.map((image) => image.assetId)).size !== gallery.length ||
    new Set(fitTags).size !== fitTags.length
  )
    invalid();
  return {
    resortId,
    name: text(item.name, 100),
    province: nullableText(item.province, 50),
    city: nullableText(item.city, 50),
    district: nullableText(item.district, 50),
    address: nullableText(item.address, 300),
    longitude: decimal(item.longitude, -180, 180),
    latitude: decimal(item.latitude, -90, 90),
    coverAssetId:
      item.coverAssetId === null ? null : assetId(item.coverAssetId),
    coverUrl: item.coverUrl === null ? null : url(item.coverUrl),
    gallery,
    rating: decimal(item.rating, 0, 5),
    ratingCount: integer(item.ratingCount),
    fitTags,
    price: integer(item.price),
    openStatus: item.openStatus as MerchantResort["openStatus"],
    snowCondition: text(item.snowCondition, 50),
    snowConditionUpdatedAt:
      item.snowConditionUpdatedAt === null
        ? null
        : time(item.snowConditionUpdatedAt),
    openingHours: nullableText(item.openingHours, 200),
    trailSummary: nullableText(item.trailSummary, 10000),
    facilitySummary: nullableText(item.facilitySummary, 10000),
    officialUrl: item.officialUrl === null ? null : url(item.officialUrl),
    description: text(item.description, 1000),
    customFields: objectJson(item.customFields),
    status: item.status as MerchantResort["status"],
    updatedAt: time(item.updatedAt),
  };
}
export function parseMerchantResortPage(
  value: unknown,
  page: number,
  status?: string,
): ResortPage {
  const data = row(value);
  if (
    data.page !== page ||
    data.pageSize !== 20 ||
    typeof data.total !== "number" ||
    !Number.isSafeInteger(data.total) ||
    data.total < 0 ||
    !Array.isArray(data.items) ||
    data.items.length !==
      Math.min(20, Math.max(0, data.total - (page - 1) * 20))
  )
    invalid();
  const items = data.items.map((value) => parseMerchantResort(value));
  const hasNext = page * 20 < data.total;
  if (
    data.hasNext !== hasNext ||
    new Set(items.map((item) => item.resortId)).size !== items.length ||
    (status !== undefined && items.some((item) => item.status !== status))
  )
    invalid();
  return { items, page, pageSize: 20, total: data.total, hasNext };
}
export function parseResortSchema(value: unknown): ResortSchema {
  const source = row(value);
  if (source.entityType !== "ski_resort" || !Array.isArray(source.groups))
    invalid();
  const groupKeys = new Set<string>(),
    fieldKeys = new Set<string>(),
    ids = new Set<number>();
  const groups = source.groups.map((value) => {
    const sourceGroup = row(value),
      group: Record<string, unknown> = {};
    for (const name of ["entityType", "groupKey", "label"] as const)
      if (sourceGroup[name] !== undefined)
        group[name] = text(sourceGroup[name], 100);
    if (group.entityType !== undefined && group.entityType !== "ski_resort")
      invalid();
    if (group.groupKey !== undefined) {
      const key = String(group.groupKey);
      if (groupKeys.has(key)) invalid();
      groupKeys.add(key);
    }
    if (sourceGroup.sortOrder !== undefined)
      group.sortOrder = integer(sourceGroup.sortOrder);
    if (sourceGroup.status !== undefined) {
      if (sourceGroup.status !== "active") invalid();
      group.status = "active";
    }
    if (sourceGroup.fields !== undefined) {
      if (!Array.isArray(sourceGroup.fields)) invalid();
      group.fields = sourceGroup.fields.map((value) => {
        const field = row(value),
          fieldKey = text(field.fieldKey, 100),
          dataType = text(field.dataType);
        if (
          fieldKeys.has(fieldKey) ||
          ![
            "text",
            "textarea",
            "integer",
            "decimal",
            "boolean",
            "date",
            "single_select",
            "multi_select",
            "url",
          ].includes(dataType)
        )
          invalid();
        fieldKeys.add(fieldKey);
        const result: Record<string, unknown> = {
          fieldKey,
          label: text(field.label, 100),
          dataType,
          canRead: flag(field.canRead),
          canWrite: flag(field.canWrite),
        };
        if (!result.canRead && !result.canWrite) invalid();
        if (field.fieldDefinitionId !== undefined) {
          const id = integer(field.fieldDefinitionId, 1);
          if (ids.has(id)) invalid();
          ids.add(id);
          result.fieldDefinitionId = id;
        }
        if (field.groupKey !== undefined) {
          result.groupKey = text(field.groupKey, 100);
          if (
            group.groupKey !== undefined &&
            result.groupKey !== group.groupKey
          )
            invalid();
        }
        for (const name of ["sortOrder", "schemaVersion"] as const)
          if (field[name] !== undefined)
            result[name] = integer(
              field[name],
              name === "schemaVersion" ? 1 : 0,
            );
        for (const name of [
          "required",
          "searchable",
          "filterable",
          "sortable",
        ] as const)
          if (field[name] !== undefined) result[name] = flag(field[name]);
        if (Object.hasOwn(field, "defaultValue"))
          result.defaultValue = json(field.defaultValue);
        if (field.optionsDictType !== undefined)
          result.optionsDictType =
            field.optionsDictType === null
              ? null
              : text(field.optionsDictType, 100);
        if (field.validation !== undefined)
          result.validation =
            field.validation === null ? null : objectJson(field.validation);
        if (field.status !== undefined) {
          if (field.status !== "active") invalid();
          result.status = "active";
        }
        return result;
      });
    }
    return group;
  });
  return { entityType: "ski_resort", groups } as ResortSchema;
}
