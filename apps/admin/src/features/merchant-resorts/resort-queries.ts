import { ApiError, type ApiRequestOptions } from "@common/api-contracts/client";
import type { components } from "@common/api-contracts/openapi";
import { parseDictionary } from "@/features/dictionaries/dictionary-queries";
import {
  parseMerchantResort,
  parseMerchantResortPage,
  parseResortSchema,
} from "@/features/merchant-resorts/resort-responses";
import {
  resortId,
  resortListPath,
  verifyResortOperator,
  resortFingerprint,
  resortInput,
  assertResortCommand,
  ResortInputError,
  type ResortAction,
  type ResortOperator,
  type MerchantResort,
  type ResortInput,
  type ResortSchema,
  type ResortMutation,
} from "@/features/merchant-resorts/resort-model";
export type ResortRequest = <T>(
  path: string,
  options?: ApiRequestOptions,
) => Promise<T>;
export async function verifyResortReader(
  request: ResortRequest,
  user: ResortOperator,
  signal: AbortSignal,
  action: ResortAction = "list",
) {
  verifyResortOperator(user, user, action);
  signal.throwIfAborted();
  const current = await request<ResortOperator>("/auth/me", {
    signal,
    cache: "no-store",
  });
  signal.throwIfAborted();
  verifyResortOperator(current, user, action);
}
export async function readResort(
  request: ResortRequest,
  user: ResortOperator,
  id: number,
  signal: AbortSignal,
) {
  if (resortId(String(id)) === null) throw new ResortInputError("雪场编号无效");
  await verifyResortReader(request, user, signal);
  let response: unknown;
  try {
    response = await request<unknown>(`/merchant/resorts/${id}`, {
      signal,
      cache: "no-store",
    });
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 404)
      await verifyResortReader(request, user, signal);
    throw cause;
  }
  signal.throwIfAborted();
  const item = parseMerchantResort(response, id);
  await verifyResortReader(request, user, signal);
  return item;
}
export async function readResortPage(
  request: ResortRequest,
  user: ResortOperator,
  page: number,
  status: string | undefined,
  signal: AbortSignal,
) {
  const path = resortListPath(page, status);
  await verifyResortReader(request, user, signal);
  const response = await request<unknown>(path, { signal, cache: "no-store" });
  signal.throwIfAborted();
  const result = parseMerchantResortPage(response, page, status);
  await verifyResortReader(request, user, signal);
  return result;
}
export function flattenResortDictionary(
  items: components["schemas"]["DictionaryItemVO"][],
): Array<{ value: string; label: string }> {
  const result: Array<{ value: string; label: string }> = [],
    stack = [...items].reverse();
  while (stack.length) {
    const item = stack.pop()!;
    if (item.status === "active")
      result.push({ value: item.value, label: item.label });
    for (let i = item.children.length - 1; i >= 0; i--)
      stack.push(item.children[i]!);
  }
  return result;
}
export async function readResortForm(
  request: ResortRequest,
  user: ResortOperator,
  id: number | undefined,
  signal: AbortSignal,
) {
  if (id !== undefined && resortId(String(id)) === null)
    throw new ResortInputError("雪场编号无效");
  await verifyResortReader(
    request,
    user,
    signal,
    id === undefined ? "create" : "update",
  );
  const [schemaValue, tagsValue, itemValue] = await Promise.all([
    request<unknown>("/merchant/resorts/custom-fields", {
      signal,
      cache: "no-store",
    }),
    request<unknown>("/admin/dictionaries/resort.fit_tag", {
      signal,
      cache: "no-store",
    }),
    id === undefined
      ? undefined
      : request<unknown>(`/merchant/resorts/${id}`, {
          signal,
          cache: "no-store",
        }),
  ]);
  signal.throwIfAborted();
  const schema = parseResortSchema(schemaValue),
    tags = readDictionary(tagsValue, "resort.fit_tag"),
    item = id === undefined ? undefined : parseMerchantResort(itemValue, id);
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
      const data =
        type === "resort.fit_tag"
          ? tags
          : readDictionary(
              await request<unknown>(
                `/admin/dictionaries/${encodeURIComponent(type)}`,
                { signal, cache: "no-store" },
              ),
              type,
            );
      return [type, flattenResortDictionary(data.items)] as const;
    }),
  );
  signal.throwIfAborted();
  await verifyResortReader(
    request,
    user,
    signal,
    id === undefined ? "create" : "update",
  );
  return {
    schema,
    tags: flattenResortDictionary(tags.items),
    item,
    dictionaries: Object.fromEntries(dictionaries),
  };
}
export async function prepareResortSave(
  request: ResortRequest,
  user: ResortOperator,
  input: { item?: MerchantResort; schema: ResortSchema; values: ResortInput },
  signal: AbortSignal,
) {
  if (input.item) {
    const latest = await readResort(request, user, input.item.resortId, signal);
    if (resortFingerprint(latest) !== resortFingerprint(input.item))
      throw new ResortInputError("雪场已变化，请保留修改后刷新最新资料");
  } else await verifyResortReader(request, user, signal, "create");
  const schema = parseResortSchema(
    await request<unknown>("/merchant/resorts/custom-fields", {
      signal,
      cache: "no-store",
    }),
  );
  signal.throwIfAborted();
  if (
    JSON.stringify(schema) !== JSON.stringify(parseResortSchema(input.schema))
  )
    throw new ResortInputError("字段定义或权限已变化，请保留修改后刷新");
  await verifyResortReader(
    request,
    user,
    signal,
    input.item ? "update" : "create",
  );
  return resortInput(input.values, schema, input.item?.customFields);
}
export async function saveResort(
  request: ResortRequest,
  id: number | undefined,
  body: ResortInput,
  signal: AbortSignal,
) {
  if (id !== undefined && resortId(String(id)) === null)
    throw new ResortInputError("雪场编号无效");
  signal.throwIfAborted();
  const saved = parseMerchantResort(
    await request<unknown>(
      id === undefined ? "/merchant/resorts" : `/merchant/resorts/${id}`,
      { method: id === undefined ? "POST" : "PATCH", body, signal },
    ),
    id,
  );
  return saved;
}
export async function prepareResortCommand(
  request: ResortRequest,
  user: ResortOperator,
  item: MerchantResort,
  action: "delete" | "submit-review",
  signal: AbortSignal,
) {
  const current = await readResort(request, user, item.resortId, signal);
  if (resortFingerprint(current) !== resortFingerprint(item))
    throw new ResortInputError("雪场已变化，请刷新后重新选择");
  assertResortCommand(current, action);
  return current;
}
export async function runResortCommand(
  request: ResortRequest,
  id: number,
  action: "delete" | "submit-review",
  signal: AbortSignal,
) {
  if (resortId(String(id)) === null) throw new ResortInputError("雪场编号无效");
  signal.throwIfAborted();
  const response = await request<unknown>(
    `/merchant/resorts/${id}${action === "submit-review" ? "/submit-review" : ""}`,
    {
      method: action === "delete" ? "DELETE" : "PATCH",
      ...(action === "submit-review" ? { body: {} } : {}),
      signal,
    },
  );
  if (action === "submit-review") {
    const item = parseMerchantResort(response, id);
    if (item.status !== "pending_review")
      throw new ResortInputError("审核响应不匹配，请重新核对");
    return item;
  }
}

function readDictionary(value: unknown, expected: string) {
  const result = parseDictionary(value);
  if (result.dictType !== expected || result.status !== "active")
    throw new ResortInputError("雪场字典不匹配或已停用，请重新读取");
  return result;
}
export async function reviewResortWrites(
  request: ResortRequest,
  user: ResortOperator,
  mutations: readonly ResortMutation[],
  signal: AbortSignal,
) {
  const summaries: string[] = [];
  for (const mutation of mutations) {
    if (mutation.action === "create") {
      const page = await readResortPage(request, user, 1, undefined, signal);
      summaries.push(
        `新建「${mutation.name}」需人工核对：最新20条候选 ${page.items.map((item) => `#${item.resortId} ${item.name}`).join("；") || "无"}。列表可能遗漏，未找到不证明创建失败。`,
      );
    } else {
      try {
        const item = await readResort(request, user, mutation.resortId, signal);
        summaries.push(
          `#${item.resortId} ${item.name}：${item.status}，${item.updatedAt}`,
        );
      } catch (cause) {
        if (!(cause instanceof ApiError) || cause.status !== 404) throw cause;
        signal.throwIfAborted();
        summaries.push(
          `#${mutation.resortId} 不存在或不可见，404不能证明停用成功`,
        );
      }
    }
  }
  signal.throwIfAborted();
  return summaries;
}
