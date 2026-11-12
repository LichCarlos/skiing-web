import { apiRequest } from "@/platform/api";
import {
  CatalogInputError,
  verifyCatalogIdentity,
  type CatalogNode,
  type CatalogUser,
} from "@/features/permissions/catalog-model";

function invalid(): never {
  throw new CatalogInputError("权限目录响应异常，请刷新目录");
}
function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function id(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 2147483647
  )
    invalid();
  return value;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) invalid();
  return value;
}
function nullableText(value: unknown): string | null {
  if (value !== null && typeof value !== "string") invalid();
  return value;
}
function tree(value: unknown, subtree: boolean): CatalogNode[] {
  if (!Array.isArray(value)) invalid();
  const result: CatalogNode[] = [],
    seen = new Set<number>(),
    keys = new Set<string>();
  const stack = value
    .map((value) => ({
      value,
      into: result,
      parentId: undefined as number | undefined,
    }))
    .reverse();
  while (stack.length) {
    const current = stack.pop()!,
      item = row(current.value),
      permissionId = id(item.permissionId),
      permissionKey = text(item.permissionKey);
    const parentId = item.parentId === null ? null : id(item.parentId),
      type = item.permissionType,
      source = item.source,
      status = item.status;
    if (
      seen.has(permissionId) ||
      keys.has(permissionKey) ||
      (current.parentId !== undefined
        ? parentId !== current.parentId
        : !subtree && parentId !== null) ||
      !["directory", "menu", "button", "api"].includes(String(type)) ||
      (source !== "code" && source !== "custom") ||
      (status !== "active" && status !== "disabled") ||
      typeof item.visible !== "boolean" ||
      typeof item.sortOrder !== "number" ||
      !Number.isInteger(item.sortOrder) ||
      item.sortOrder < -2147483648 ||
      item.sortOrder > 2147483647 ||
      !Array.isArray(item.children)
    )
      invalid();
    seen.add(permissionId);
    keys.add(permissionKey);
    const node: CatalogNode = {
      permissionId,
      parentId,
      permissionKey,
      permissionName: text(item.permissionName),
      permissionType: type as CatalogNode["permissionType"],
      source,
      status,
      route: nullableText(item.route),
      icon: nullableText(item.icon),
      sortOrder: item.sortOrder,
      visible: item.visible,
      children: [],
    };
    current.into.push(node);
    for (let i = item.children.length - 1; i >= 0; i--)
      stack.push({
        value: item.children[i],
        into: node.children,
        parentId: permissionId,
      });
  }
  return result;
}
export function parseCatalog(value: unknown): CatalogNode[] {
  return tree(value, false);
}
export function parseCatalogNode(
  value: unknown,
  expectedId?: number,
): CatalogNode {
  const result = tree([value], true)[0]!;
  if (expectedId !== undefined && result.permissionId !== expectedId) invalid();
  return result;
}
export function parseCatalogSync(value: unknown) {
  const item = row(value);
  function count(value: unknown): number {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
      invalid();
    return value;
  }
  return {
    created: count(item.created),
    updated: count(item.updated),
    disabled: count(item.disabled),
  };
}
export async function verifyCatalogReader(
  user: CatalogUser,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  verifyCatalogIdentity(user, user);
  const current = await apiRequest<unknown>("/auth/me", {
    signal,
    cache: "no-store",
  });
  signal.throwIfAborted();
  verifyCatalogIdentity(current, user);
}
export async function readCatalog(user: CatalogUser, signal: AbortSignal) {
  await verifyCatalogReader(user, signal);
  const value = await apiRequest<unknown>("/admin/permissions", {
    signal,
    cache: "no-store",
  });
  signal.throwIfAborted();
  const result = parseCatalog(value);
  await verifyCatalogReader(user, signal);
  return result;
}
export async function readCatalogTarget(
  permissionId: number,
  signal: AbortSignal,
) {
  id(permissionId);
  signal.throwIfAborted();
  const value = await apiRequest<unknown>(
    `/admin/permissions/${permissionId}`,
    { signal, cache: "no-store" },
  );
  signal.throwIfAborted();
  return parseCatalogNode(value, permissionId);
}
export async function readCatalogDetail(
  user: CatalogUser,
  permissionId: number,
  signal: AbortSignal,
) {
  id(permissionId);
  await verifyCatalogReader(user, signal);
  const result = await readCatalogTarget(permissionId, signal);
  await verifyCatalogReader(user, signal);
  return result;
}
