import type { components, operations } from "@common/api-contracts/openapi";
import {
  initialResortInput,
  resortInput,
} from "@/features/merchant-resorts/resort-model";
import { flattenResortDictionary } from "@/features/merchant-resorts/resort-queries";
import { parseResortSchema } from "@/features/merchant-resorts/resort-responses";
import { parseDictionary } from "@/features/dictionaries/dictionary-queries";
import { parseGlobalResort } from "@/features/admin-resorts/global-resort-responses";
import type { GlobalResortRequest } from "@/features/admin-resorts/global-resort-api";
import {
  readGlobalResort,
  verifyGlobalReader,
} from "@/features/admin-resorts/global-resort-api";
import {
  GlobalResortError,
  globalResortFingerprint,
  resortId,
  type GlobalResort,
  type GlobalResortOperator,
} from "@/features/admin-resorts/global-resort-model";
export type GlobalResortInput = components["schemas"]["CreateAdminResortDto"];
export type GlobalResortSchema =
  operations["AdminResortsController_customFieldSchema"]["responses"][200]["content"]["application/json"];
export function initialGlobalResortInput(
  item: GlobalResort | undefined,
  schema: GlobalResortSchema,
): GlobalResortInput {
  return {
    ...initialResortInput(
      item
        ? {
            ...item,
            fitTags: item.fitTags.map((tag) => tag.value),
            customFields: Object.fromEntries(
              item.customFields.map((field) => [field.fieldKey, field.value]),
            ),
          }
        : undefined,
      schema,
    ),
    merchantId: item?.merchantId ?? null,
    rating: item?.rating == null ? null : Number(item.rating),
    ratingCount: item?.ratingCount ?? 0,
  };
}
export function globalResortInput(
  values: GlobalResortInput,
  schema: GlobalResortSchema,
  original?: GlobalResort,
): GlobalResortInput {
  const merchantId = values.merchantId ?? null,
    rating = values.rating ?? null,
    ratingCount = values.ratingCount ?? 0;
  if (
    (merchantId !== null && resortId(String(merchantId)) === null) ||
    (rating !== null &&
      (!Number.isFinite(rating) || rating < 0 || rating > 5)) ||
    !Number.isInteger(ratingCount) ||
    ratingCount < 0 ||
    ratingCount > 2147483647
  )
    throw new GlobalResortError("商家编号、评分或评分人数无效");
  return {
    ...resortInput(
      values,
      schema,
      Object.fromEntries(
        (original?.customFields ?? []).map((field) => [
          field.fieldKey,
          field.value,
        ]),
      ),
    ),
    merchantId,
    rating,
    ratingCount,
  };
}
export async function readGlobalResortForm(
  request: GlobalResortRequest,
  operator: GlobalResortOperator,
  id: number | undefined,
  signal: AbortSignal,
) {
  if (id !== undefined && resortId(String(id)) === null)
    throw new GlobalResortError("雪场编号无效");
  await verifyGlobalReader(
    request,
    operator,
    signal,
    id === undefined ? "create" : "update",
  );
  const [schemaValue, tagsValue, itemValue] = await Promise.all([
    request<unknown>("/admin/resorts/custom-fields", {
      signal,
      cache: "no-store",
    }),
    request<unknown>("/admin/dictionaries/resort.fit_tag", {
      signal,
      cache: "no-store",
    }),
    id === undefined
      ? undefined
      : request<unknown>(`/admin/resorts/${id}`, {
          signal,
          cache: "no-store",
        }),
  ]);
  signal.throwIfAborted();
  const schema = parseResortSchema(schemaValue),
    tags = readDictionary(tagsValue, "resort.fit_tag"),
    item = id === undefined ? undefined : parseGlobalResort(itemValue, id);
  const groups = schema.groups.map((group) => {
    if (!group.groupKey || !group.label)
      throw new GlobalResortError("字段分组响应异常");
    return { ...group, groupKey: group.groupKey, label: group.label };
  });
  const types = [
    ...new Set(
      schema.groups.flatMap((group) =>
        (group.fields ?? []).flatMap((field) =>
          field.canWrite &&
          ["single_select", "multi_select"].includes(field.dataType) &&
          field.optionsDictType
            ? [field.optionsDictType]
            : [],
        ),
      ),
    ),
  ];
  const dictionaries = await Promise.all(
    types.map(async (type) => {
      const dictionary =
        type === "resort.fit_tag"
          ? tags
          : readDictionary(
              await request<unknown>(
                `/admin/dictionaries/${encodeURIComponent(type)}`,
                {
                  signal,
                  cache: "no-store",
                },
              ),
              type,
            );
      return [type, flattenResortDictionary(dictionary.items)] as const;
    }),
  );
  signal.throwIfAborted();
  await verifyGlobalReader(
    request,
    operator,
    signal,
    id === undefined ? "create" : "update",
  );
  return {
    schema: { ...schema, groups },
    item,
    tags: flattenResortDictionary(tags.items),
    dictionaries: Object.fromEntries(dictionaries),
  };
}
export async function prepareGlobalResortSave(
  request: GlobalResortRequest,
  operator: GlobalResortOperator,
  input: {
    item?: GlobalResort;
    schema: GlobalResortSchema;
    values: GlobalResortInput;
  },
  signal: AbortSignal,
) {
  if (input.item) {
    const latest = await readGlobalResort(
      request,
      operator,
      input.item.resortId,
      signal,
    );
    if (globalResortFingerprint(latest) !== globalResortFingerprint(input.item))
      throw new GlobalResortError("雪场资料或归属已变化，请保留修改后刷新");
  } else await verifyGlobalReader(request, operator, signal, "create");
  const schema = parseResortSchema(
    await request<unknown>("/admin/resorts/custom-fields", {
      signal,
      cache: "no-store",
    }),
  );
  signal.throwIfAborted();
  if (
    JSON.stringify(schema) !== JSON.stringify(parseResortSchema(input.schema))
  )
    throw new GlobalResortError("字段定义或权限已变化，请保留修改后刷新");
  await verifyGlobalReader(
    request,
    operator,
    signal,
    input.item ? "update" : "create",
  );
  return globalResortInput(input.values, schema, input.item);
}
export async function saveGlobalResort(
  request: GlobalResortRequest,
  id: number | undefined,
  body: GlobalResortInput,
  signal: AbortSignal,
) {
  if (id !== undefined && resortId(String(id)) === null)
    throw new GlobalResortError("雪场编号无效");
  signal.throwIfAborted();
  const response = await request<unknown>(
    id === undefined ? "/admin/resorts" : `/admin/resorts/${id}`,
    { method: id === undefined ? "POST" : "PATCH", body, signal },
  );
  try {
    return parseGlobalResort(response, id);
  } catch {
    throw new GlobalResortError("保存响应异常，请人工核对结果");
  }
}
function readDictionary(value: unknown, expected: string) {
  const dictionary = parseDictionary(value);
  if (dictionary.dictType !== expected || dictionary.status !== "active")
    throw new GlobalResortError("雪场字典不匹配或已停用，请重新读取");
  return dictionary;
}
