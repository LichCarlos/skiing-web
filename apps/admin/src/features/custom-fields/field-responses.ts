import {
  FieldInputError,
  type EntityType,
  type Field,
  type Group,
} from "@/features/custom-fields/field-model";

export function invalidFieldResponse(): never {
  throw new FieldInputError("字段数据不匹配，请刷新并重新核对");
}
export function fieldRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalidFieldResponse();
  return value as Record<string, unknown>;
}
export function validFieldId(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= 2147483647
  );
}
export function assertFieldEntity(value: unknown): asserts value is EntityType {
  if (
    !["ski_resort", "article", "dynamic", "merchant_profile"].includes(
      String(value),
    ) ||
    typeof value !== "string"
  )
    invalidFieldResponse();
}
function text(value: unknown, pattern?: RegExp): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 100 ||
    (pattern && !pattern.test(value))
  )
    invalidFieldResponse();
  return value;
}
function order(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 2147483647
  )
    invalidFieldResponse();
  return value;
}
function flag(value: unknown): boolean {
  if (typeof value !== "boolean") invalidFieldResponse();
  return value;
}
function time(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  )
    invalidFieldResponse();
  return value;
}
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
// Preserve false/zero/null while avoiding shared references and toJSON hooks.
function json(value: unknown, ancestors = new Set<object>()): Json {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (
    !value ||
    typeof value !== "object" ||
    ancestors.has(value) ||
    (!Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  )
    invalidFieldResponse();
  ancestors.add(value);
  try {
    if (Array.isArray(value))
      return Array.from(value, (item) => json(item, ancestors));
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, json(item, ancestors)]),
    );
  } finally {
    ancestors.delete(value);
  }
}
function objectJson(value: unknown): Record<string, Json> | null {
  if (value === null) return null;
  fieldRecord(value);
  return json(value) as Record<string, Json>;
}
export function parseField(value: unknown, entityType: EntityType): Field {
  assertFieldEntity(entityType);
  const item = fieldRecord(value);
  if (
    !validFieldId(item.fieldDefinitionId) ||
    !validFieldId(item.schemaVersion) ||
    item.entityType !== entityType ||
    !["draft", "active", "disabled"].includes(String(item.status)) ||
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
    ].includes(String(item.dataType))
  )
    invalidFieldResponse();
  const createTime = time(item.createTime),
    updateTime = time(item.updateTime);
  if (Date.parse(updateTime) < Date.parse(createTime)) invalidFieldResponse();
  return {
    fieldDefinitionId: item.fieldDefinitionId,
    entityType,
    fieldKey: text(item.fieldKey, /^[a-z][a-z0-9_]{0,99}$/),
    label: text(item.label),
    dataType: item.dataType as Field["dataType"],
    groupKey: text(item.groupKey, /^[a-z][a-z0-9_-]{0,99}$/),
    sortOrder: order(item.sortOrder),
    required: flag(item.required),
    defaultValue: json(item.defaultValue),
    optionsDictType:
      item.optionsDictType === null ? null : text(item.optionsDictType),
    validation: objectJson(item.validation),
    searchable: flag(item.searchable),
    filterable: flag(item.filterable),
    sortable: flag(item.sortable),
    isPublic: flag(item.isPublic),
    status: item.status as Field["status"],
    schemaVersion: item.schemaVersion,
    createTime,
    updateTime,
  };
}
export function parseFieldGroup(value: unknown, entityType: EntityType): Group {
  assertFieldEntity(entityType);
  const item = fieldRecord(value);
  if (
    item.entityType !== entityType ||
    !["active", "disabled"].includes(String(item.status))
  )
    invalidFieldResponse();
  const createTime = time(item.createTime),
    updateTime = time(item.updateTime);
  if (Date.parse(updateTime) < Date.parse(createTime)) invalidFieldResponse();
  return {
    entityType,
    groupKey: text(item.groupKey, /^[a-z][a-z0-9_-]{0,99}$/),
    label: text(item.label),
    sortOrder: order(item.sortOrder),
    visibilityRule: objectJson(item.visibilityRule),
    status: item.status as Group["status"],
    createTime,
    updateTime,
  };
}

export function parseFieldReceipt(
  value: unknown,
  entityType: EntityType,
  expected: {
    fieldDefinitionId?: number;
    fieldKey?: string;
    schemaVersion?: number;
    status?: Field["status"];
  },
): Field {
  const field = parseField(value, entityType);
  for (const key of [
    "fieldDefinitionId",
    "fieldKey",
    "schemaVersion",
    "status",
  ] as const)
    if (expected[key] !== undefined && field[key] !== expected[key])
      invalidFieldResponse();
  return field;
}
export function parseGroupReceipt(
  value: unknown,
  entityType: EntityType,
  groupKey: string,
): Group {
  const group = parseFieldGroup(value, entityType);
  if (group.groupKey !== groupKey) invalidFieldResponse();
  return group;
}
