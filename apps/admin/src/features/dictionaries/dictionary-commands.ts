import type { components } from "@common/api-contracts/openapi";
import { isDictionaryType } from "@/features/dictionaries/routes";
import {
  dictionaryInteger,
  parseDictionary,
  parseDictionaryItem,
  type DictionaryRequest,
} from "@/features/dictionaries/dictionary-queries";

function path(key: string) {
  if (typeof key !== "string" || !isDictionaryType(key))
    throw new Error("字典类型键无效");
  return `/admin/dictionaries/${encodeURIComponent(key)}`;
}
export async function saveDictionaryType(
  request: DictionaryRequest,
  key: string,
  body:
    | components["schemas"]["CreateDictionaryTypeDto"]
    | components["schemas"]["UpdateDictionaryTypeDto"],
  editing: boolean,
  signal: AbortSignal,
) {
  const target = path(key);
  if (!editing && (!("dictType" in body) || body.dictType !== key))
    throw new Error("字典类型键与提交内容不匹配");
  signal.throwIfAborted();
  const result = parseDictionary(
    await request<unknown>(editing ? target : "/admin/dictionaries", {
      method: editing ? "PATCH" : "POST",
      body,
      signal,
    }),
  );
  if (result.dictType !== key)
    throw new Error("字典类型回执不匹配，请读取核对");
  return result;
}
export async function saveDictionaryItem(
  request: DictionaryRequest,
  key: string,
  itemId: number | undefined,
  body:
    | components["schemas"]["CreateDictionaryItemDto"]
    | components["schemas"]["UpdateDictionaryItemDto"],
  signal: AbortSignal,
) {
  const target = path(key);
  if (itemId !== undefined) dictionaryInteger(itemId);
  signal.throwIfAborted();
  const result = parseDictionaryItem(
    await request<unknown>(
      `${target}/items${itemId === undefined ? "" : `/${itemId}`}`,
      {
        method: itemId === undefined ? "POST" : "PATCH",
        body,
        signal,
      },
    ),
    itemId,
  );
  if (body.parentId !== undefined && result.parentId !== body.parentId)
    throw new Error("字典项父级回执不匹配，请读取核对");
  return result;
}
export async function disableDictionary(
  request: DictionaryRequest,
  key: string,
  itemId: number | undefined,
  signal: AbortSignal,
) {
  let target = path(key);
  if (itemId !== undefined) target += `/items/${dictionaryInteger(itemId)}`;
  signal.throwIfAborted();
  const response = await request<unknown>(target, { method: "DELETE", signal });
  if (response !== undefined) throw new Error("字典停用回执异常，请读取核对");
}
