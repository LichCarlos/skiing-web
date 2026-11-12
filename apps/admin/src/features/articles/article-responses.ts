import {
  ArticleInputError,
  type ManagedArticle,
  type ArticlePage,
} from "@/features/articles/article-model";
import type { ArticleFieldSchema } from "@/features/articles/article-field-model";

function invalid(): never {
  throw new ArticleInputError("文章资料不匹配，请刷新并重新核对");
}
function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function integer(value: unknown, min = 1): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > 2147483647
  )
    invalid();
  return value;
}
function text(value: unknown, max = Infinity): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    invalid();
  return value;
}
function key(value: unknown, field = false): string {
  const result = text(value, 100);
  if (
    !(field ? /^[a-z][a-z0-9_]{0,99}$/ : /^[a-z][a-z0-9_-]{0,99}$/).test(result)
  )
    invalid();
  return result;
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
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  )
    invalid();
  ancestors.add(value);
  try {
    return Array.isArray(value)
      ? Array.from(value, (item) => json(item, ancestors))
      : Object.fromEntries(
          Object.entries(value).map(([name, item]) => [
            name,
            json(item, ancestors),
          ]),
        );
  } finally {
    ancestors.delete(value);
  }
}
function objectJson(value: unknown): Record<string, Json> {
  row(value);
  return json(value) as Record<string, Json>;
}
function assetId(value: unknown): string | null {
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    !/^[1-9]\d{0,18}$/.test(value) ||
    BigInt(value) > 9223372036854775807n
  )
    invalid();
  return value;
}
function url(value: unknown): string | null {
  if (value === null) return null;
  const result = text(value);
  try {
    const parsed = new URL(result);
    if (
      !["https:", "http:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      invalid();
  } catch {
    invalid();
  }
  return result;
}
export function parseManagedArticle(
  value: unknown,
  expectedId?: number,
): ManagedArticle {
  const item = row(value),
    articleId = integer(item.articleId),
    category = row(item.category);
  if (expectedId !== undefined && articleId !== expectedId) invalid();
  if (
    item.status !== "draft" &&
    item.status !== "published" &&
    item.status !== "withdrawn"
  )
    invalid();
  const publishTime = item.publishTime === null ? null : time(item.publishTime),
    createTime = time(item.createTime),
    updateTime = time(item.updateTime);
  if (
    (item.status === "published" && publishTime === null) ||
    (item.status === "draft" && publishTime !== null) ||
    Date.parse(updateTime) < Date.parse(createTime)
  )
    invalid();
  if (item.authorName !== null && typeof item.authorName !== "string")
    invalid();
  return {
    articleId,
    title: text(item.title, 200),
    summary: text(item.summary, 1000),
    body: text(item.body, 100000),
    ...(item.contentFormat !== undefined
      ? { contentFormat: parseContentFormat(item.contentFormat) }
      : {}),
    ...(item.bodyAssets !== undefined
      ? { bodyAssets: parseBodyAssets(item.bodyAssets) }
      : {}),
    coverAssetId: assetId(item.coverAssetId),
    coverUrl: url(item.coverUrl),
    category: {
      value: text(category.value, 100),
      label: text(category.label, 100),
    },
    authorName: item.authorName,
    status: item.status,
    publishTime,
    version: integer(item.version),
    customFields: objectJson(item.customFields),
    createTime,
    updateTime,
  };
}
export function parseArticlePage(
  value: unknown,
  page: number,
  status?: ManagedArticle["status"],
): ArticlePage {
  const item = row(value);
  if (
    item.page !== page ||
    item.pageSize !== 20 ||
    typeof item.total !== "number" ||
    !Number.isSafeInteger(item.total) ||
    item.total < 0 ||
    !Array.isArray(item.items) ||
    item.items.length !==
      Math.min(20, Math.max(0, item.total - (page - 1) * 20))
  )
    invalid();
  const items = item.items.map((value) => parseManagedArticle(value)),
    ids = new Set<number>();
  for (const value of items) {
    if (
      ids.has(value.articleId) ||
      (status !== undefined && value.status !== status)
    )
      invalid();
    ids.add(value.articleId);
  }
  const hasNext = (page - 1) * 20 + items.length < item.total;
  if (item.hasNext !== undefined && item.hasNext !== hasNext) invalid();
  return {
    items,
    page,
    pageSize: 20,
    total: item.total,
    ...(item.hasNext === undefined ? {} : { hasNext }),
  };
}
export function parseArticleFieldSchema(
  value: unknown,
  expectedEntity = "article",
): ArticleFieldSchema {
  const source = row(value);
  if (source.entityType !== expectedEntity || !Array.isArray(source.groups))
    invalid();
  const groupKeys = new Set<string>(),
    fieldKeys = new Set<string>(),
    ids = new Set<number>();
  return {
    entityType: expectedEntity,
    groups: source.groups.map((value) => {
      const group = row(value),
        groupKey = key(group.groupKey);
      if (groupKeys.has(groupKey) || !Array.isArray(group.fields)) invalid();
      groupKeys.add(groupKey);
      return {
        groupKey,
        label: text(group.label, 100),
        sortOrder: integer(group.sortOrder, 0),
        fields: group.fields.map((value) => {
          const field = row(value),
            fieldKey = key(field.fieldKey, true),
            fieldDefinitionId = integer(field.fieldDefinitionId);
          if (
            field.groupKey !== groupKey ||
            fieldKeys.has(fieldKey) ||
            ids.has(fieldDefinitionId) ||
            typeof field.dataType !== "string" ||
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
            ].includes(field.dataType)
          )
            invalid();
          fieldKeys.add(fieldKey);
          ids.add(fieldDefinitionId);
          const canRead = flag(field.canRead),
            canWrite = flag(field.canWrite);
          if (!canRead && !canWrite) invalid();
          return {
            fieldDefinitionId,
            fieldKey,
            label: text(field.label, 100),
            groupKey,
            dataType:
              field.dataType as ArticleFieldSchema["groups"][number]["fields"][number]["dataType"],
            sortOrder: integer(field.sortOrder, 0),
            required: flag(field.required),
            defaultValue: json(field.defaultValue),
            optionsDictType:
              field.optionsDictType === null
                ? null
                : text(field.optionsDictType, 100),
            validation:
              field.validation === null ? null : objectJson(field.validation),
            schemaVersion: integer(field.schemaVersion),
            canRead,
            canWrite,
          };
        }),
      };
    }),
  };
}

function parseContentFormat(value: unknown): "plain_text" | "markdown_v1" {
  if (value !== "plain_text" && value !== "markdown_v1") invalid();
  return value;
}
function parseBodyAssets(value: unknown): { assetId: string; url: string }[] {
  if (!Array.isArray(value)) invalid();
  const items = value.map((value) => {
    const item = row(value),
      id = assetId(item.assetId),
      href = url(item.url);
    if (!id || !href) invalid();
    return { assetId: id, url: href };
  });
  if (new Set(items.map((i) => i.assetId)).size !== items.length) invalid();
  return items;
}
