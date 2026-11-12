import type { components } from "@common/api-contracts/openapi";
export type QueryField = components["schemas"]["BusinessQueryFieldVO"];
export type QueryPage = components["schemas"]["BusinessQueryPageVO"];
export const entities = {
  ski_resort: "雪场",
  article: "知识文章",
  dynamic: "社区动态",
} as const;
export type Entity = keyof typeof entities;
export const operations = {
  eq: "等于",
  contains: "包含文字",
  gte: "不低于",
  lte: "不高于",
  has: "包含选项",
} as const;
export type Filter = {
  field: string;
  op: keyof typeof operations;
  text: string;
};
export function operators(field: QueryField): (keyof typeof operations)[] {
  return field.dataType === "multi_select"
    ? ["has"]
    : ([
        "eq",
        ...(["integer", "decimal", "date"].includes(field.dataType)
          ? (["gte", "lte"] as const)
          : []),
        ...(field.searchable &&
        ["text", "textarea", "url"].includes(field.dataType)
          ? (["contains"] as const)
          : []),
      ] as (keyof typeof operations)[]);
}
export function makeQuery(
  fields: QueryField[],
  filters: Filter[],
  page: number,
  sort: string,
  direction: "asc" | "desc",
) {
  return {
    page,
    pageSize: 20,
    filters: filters.map((filter) => {
      const field = fields.find((f) => f.key === filter.field && f.filterable);
      if (
        !field ||
        !operators(field).includes(filter.op) ||
        !filter.text.trim()
      )
        throw Error("请选择字段并填写有效条件");
      let value: string | number | boolean = filter.text.trim();
      if (["integer", "decimal"].includes(field.dataType)) {
        value = Number(value);
        if (
          !Number.isFinite(value) ||
          (field.dataType === "integer" && !Number.isSafeInteger(value))
        )
          throw Error(`${field.label}需要有效数值`);
      }
      if (field.dataType === "boolean") {
        if (!["true", "false"].includes(String(value)))
          throw Error("请选择是或否");
        value = value === "true";
      }
      return { field: filter.field, op: filter.op, value };
    }),
    ...(sort ? { sort: { field: sort, direction } } : {}),
  };
}
export function parseCatalogFields(value: unknown): QueryField[] {
  if (
    !Array.isArray(value) ||
    !value.every(
      (f) =>
        f &&
        typeof f.key === "string" &&
        typeof f.label === "string" &&
        typeof f.dataType === "string" &&
        [f.searchable, f.filterable, f.sortable].every(
          (v) => typeof v === "boolean",
        ) &&
        (f.options === undefined ||
          (Array.isArray(f.options) &&
            f.options.every(
              (o: { value: unknown; label: unknown }) =>
                o && typeof o.value === "string" && typeof o.label === "string",
            ))),
    ) ||
    new Set(value.map((f) => f.key)).size !== value.length
  )
    throw Error("字段目录响应异常");
  return value;
}
export function parseCatalogPage(value: unknown, page: number): QueryPage {
  const p = value as QueryPage;
  if (
    !p ||
    p.page !== page ||
    p.pageSize !== 20 ||
    !Number.isSafeInteger(p.total) ||
    p.total < 0 ||
    !Number.isFinite(Date.parse(p.asOf)) ||
    !Array.isArray(p.items) ||
    p.items.length > 20 ||
    !p.items.every(
      (r) =>
        Number.isSafeInteger(r.id) &&
        r.id > 0 &&
        typeof r.title === "string" &&
        r.fields &&
        typeof r.fields === "object" &&
        !Array.isArray(r.fields) &&
        r.customFields &&
        typeof r.customFields === "object" &&
        !Array.isArray(r.customFields),
    ) ||
    new Set(p.items.map((r) => r.id)).size !== p.items.length
  )
    throw Error("查询结果响应异常");
  return p;
}
