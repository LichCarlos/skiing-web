import { ApiError, type ApiRequestOptions } from "@common/api-contracts/client";
import { parseCurrentUser } from "@/platform/auth/session-model";
import { isDictionaryType } from "@/features/dictionaries/routes";
import {
  verifyDictionaryIdentity,
  type Dictionary,
  type DictionaryPage,
  type DictionaryUser,
  type Item,
} from "@/features/dictionaries/dictionary-model";
export type DictionaryRequest = <T>(
  path: string,
  options?: ApiRequestOptions,
) => Promise<T>;
function invalid(): never {
  throw new Error("字典数据不匹配，请刷新并重新核对");
}
function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
export function dictionaryInteger(value: unknown, min = 1) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > 2147483647
  )
    invalid();
  return value;
}
const integer = dictionaryInteger;
function text(value: unknown) {
  if (typeof value !== "string" || !value.length || value.length > 100)
    invalid();
  return value;
}
function key(value: unknown) {
  const result = text(value);
  if (!isDictionaryType(result)) invalid();
  return result;
}
function bool(value: unknown) {
  if (typeof value !== "boolean") invalid();
  return value;
}
function status(value: unknown): "active" | "disabled" {
  if (value !== "active" && value !== "disabled") invalid();
  return value;
}
function items(value: unknown, rootParent: number | null = null): Item[] {
  if (!Array.isArray(value)) invalid();
  const result: Item[] = [],
    seen = new Set<number>(rootParent === null ? [] : [rootParent]);
  const stack = value
    .map((node) => ({ node, into: result, parentId: rootParent }))
    .reverse();
  while (stack.length) {
    const current = stack.pop()!,
      source = row(current.node),
      itemId = integer(source.itemId);
    if (
      seen.has(itemId) ||
      source.parentId !== current.parentId ||
      !Array.isArray(source.children)
    )
      invalid();
    seen.add(itemId);
    if (
      source.color !== null &&
      (typeof source.color !== "string" || source.color.length > 20)
    )
      invalid();
    const item: Item = {
      itemId,
      parentId: current.parentId,
      label: text(source.label),
      value: text(source.value),
      color: source.color as string | null,
      sortOrder: integer(source.sortOrder, -2147483648),
      isDefault: bool(source.isDefault),
      status: status(source.status),
      children: [],
    };
    current.into.push(item);
    for (let i = source.children.length - 1; i >= 0; i--)
      stack.push({
        node: source.children[i],
        into: item.children,
        parentId: itemId,
      });
  }
  return result;
}
export function parseDictionaryItem(value: unknown, expectedId?: number): Item {
  const source = row(value);
  const parentId = source.parentId === null ? null : integer(source.parentId);
  const result = items([value], parentId)[0]!;
  if (expectedId !== undefined && result.itemId !== expectedId) invalid();
  return result;
}
export function parseDictionary(value: unknown): Dictionary {
  const source = row(value);
  return {
    dictType: key(source.dictType),
    dictName: text(source.dictName),
    groupKey: key(source.groupKey),
    status: status(source.status),
    publiclyReadable: bool(source.publiclyReadable),
    items: items(source.items),
  };
}
async function verified<T>(
  request: DictionaryRequest,
  user: DictionaryUser,
  signal: AbortSignal,
  read: () => Promise<T>,
) {
  verifyDictionaryIdentity(user, user);
  const verify = async () => {
    signal.throwIfAborted();
    const current = parseCurrentUser(
      await request<unknown>("/auth/me", { signal, cache: "no-store" }),
    );
    signal.throwIfAborted();
    verifyDictionaryIdentity(current, user);
  };
  await verify();
  let value: T;
  try {
    value = await read();
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) await verify();
    throw error;
  }
  signal.throwIfAborted();
  await verify();
  return value;
}
export function readDictionaryPage(
  request: DictionaryRequest,
  user: DictionaryUser,
  page: number,
  groupKey: string | undefined,
  filterStatus: "active" | "disabled" | undefined,
  signal: AbortSignal,
): Promise<DictionaryPage> {
  integer(page);
  if (!Number.isSafeInteger((page - 1) * 20)) invalid();
  if (groupKey !== undefined) key(groupKey);
  if (filterStatus !== undefined) status(filterStatus);
  const query = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (groupKey) query.set("groupKey", groupKey);
  if (filterStatus) query.set("status", filterStatus);
  return verified(request, user, signal, async () => {
    const source = row(
      await request<unknown>(`/admin/dictionaries?${query}`, {
        signal,
        cache: "no-store",
      }),
    );
    if (
      source.page !== page ||
      source.pageSize !== 20 ||
      typeof source.total !== "number" ||
      !Number.isSafeInteger(source.total) ||
      source.total < 0 ||
      !Array.isArray(source.items) ||
      source.items.length !==
        Math.min(20, Math.max(0, source.total - (page - 1) * 20)) ||
      source.hasNext !== page < Math.ceil(source.total / 20)
    )
      invalid();
    const values = source.items.map(parseDictionary),
      seen = new Set<string>();
    for (const item of values) {
      if (
        seen.has(item.dictType) ||
        (groupKey !== undefined && item.groupKey !== groupKey) ||
        (filterStatus !== undefined && item.status !== filterStatus)
      )
        invalid();
      seen.add(item.dictType);
    }
    return {
      page,
      pageSize: 20,
      total: source.total,
      hasNext: source.hasNext as boolean,
      items: values,
    };
  });
}
export function readDictionaryDetail(
  request: DictionaryRequest,
  user: DictionaryUser,
  dictType: string,
  signal: AbortSignal,
) {
  key(dictType);
  return verified(request, user, signal, async () => {
    const value = parseDictionary(
      await request<unknown>(
        `/admin/dictionaries/${encodeURIComponent(dictType)}`,
        { signal, cache: "no-store" },
      ),
    );
    if (value.dictType !== dictType) invalid();
    return value;
  });
}

/** Resolve choices across every page; never publish a partial or drifting catalog. */
export async function readAllDictionaries(
  request: DictionaryRequest,
  user: DictionaryUser,
  signal: AbortSignal,
  filterStatus?: "active" | "disabled",
) {
  const result: Dictionary[] = [];
  const seen = new Set<string>();
  let total: number | undefined;
  for (let page = 1; ; page++) {
    signal.throwIfAborted();
    const value = await readDictionaryPage(
      request,
      user,
      page,
      undefined,
      filterStatus,
      signal,
    );
    if (total !== undefined && value.total !== total) invalid();
    total = value.total;
    for (const item of value.items) {
      if (seen.has(item.dictType)) invalid();
      seen.add(item.dictType);
      result.push(item);
    }
    if (!value.hasNext) break;
  }
  signal.throwIfAborted();
  if (result.length !== total) invalid();
  return result;
}
