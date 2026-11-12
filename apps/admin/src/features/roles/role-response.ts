import type { components } from "@common/api-contracts/openapi";
import {
  RoleInputError,
  type ManagedRole,
} from "@/features/roles/role-workflow";

function invalid(): never {
  throw new RoleInputError("角色或授权响应异常，请重新读取");
}
function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) invalid();
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
function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    invalid();
  return value;
}
export function roleId(value: unknown): number {
  const result = count(value);
  if (result < 1 || result > 2147483647) invalid();
  return result;
}
function status(value: unknown): "active" | "disabled" {
  if (value !== "active" && value !== "disabled") invalid();
  return value;
}
function scope(value: unknown): "self" | "merchant" | "all" | "selected" {
  if (!["self", "merchant", "all", "selected"].includes(String(value)))
    invalid();
  return value as "self" | "merchant" | "all" | "selected";
}
function unique<T>(values: T[], key: (value: T) => unknown): T[] {
  if (new Set(values.map(key)).size !== values.length) invalid();
  return values;
}
export function parseManagedRole(
  value: unknown,
  expectedId?: number,
): ManagedRole {
  const item = row(value),
    id = roleId(item.roleId),
    dataScope = scope(item.dataScope);
  if (
    (expectedId !== undefined && id !== expectedId) ||
    dataScope === "selected"
  )
    invalid();
  return {
    roleId: id,
    roleKey: text(item.roleKey),
    roleName: text(item.roleName),
    ...(item.description === undefined
      ? {}
      : { description: nullableText(item.description) }),
    status: status(item.status),
    dataScope,
    userCount: count(item.userCount),
    permissionCount: count(item.permissionCount),
    fieldPolicyCount: count(item.fieldPolicyCount),
    dataScopes: unique(
      list(item.dataScopes).map((value) => {
        const item = row(value);
        return {
          resourceKey: text(item.resourceKey),
          scopeType: scope(item.scopeType),
        };
      }),
      (item) => item.resourceKey,
    ),
  };
}
export function parseRolePage(
  value: unknown,
  page: number,
  expectedStatus?: string,
): components["schemas"]["ManagedRolePageVO"] {
  const result = row(value),
    items = unique(
      list(result.items).map((value) => {
        const item = parseManagedRole(value);
        if (expectedStatus !== undefined && item.status !== expectedStatus)
          invalid();
        return item;
      }),
      (item) => item.roleId,
    ),
    total = count(result.total);
  if (
    result.page !== page ||
    result.pageSize !== 20 ||
    items.length > 20 ||
    total < items.length ||
    (items.length > 0 && (page - 1) * 20 + items.length > total) ||
    result.hasNext !== page * 20 < total
  )
    invalid();
  return {
    items,
    total,
    page,
    pageSize: 20,
    hasNext: result.hasNext as boolean,
  };
}
export function parseRoleAuthorization(
  value: unknown,
  expectedId: number,
): components["schemas"]["RoleAuthorizationSnapshotVO"] {
  const item = row(value),
    id = roleId(item.roleId);
  if (id !== expectedId) invalid();
  return {
    roleId: id,
    roleKey: text(item.roleKey),
    roleName: text(item.roleName),
    status: status(item.status),
    permissionIds: unique(list(item.permissionIds).map(roleId), (id) => id),
    dataScopes: unique(
      list(item.dataScopes).map((value) => {
        const item = row(value),
          scopeType = scope(item.scopeType);
        const selectedIds =
          item.selectedIds === undefined
            ? undefined
            : unique(list(item.selectedIds).map(roleId), (id) => id);
        if (
          (scopeType === "selected" && !selectedIds?.length) ||
          (scopeType !== "selected" && selectedIds?.length)
        )
          invalid();
        return {
          resourceKey: text(item.resourceKey),
          scopeType,
          ...(selectedIds === undefined ? {} : { selectedIds }),
        };
      }),
      (item) => item.resourceKey,
    ),
    fieldPolicies: unique(
      list(item.fieldPolicies).map((value) => {
        const item = row(value),
          entityType = text(item.entityType),
          fieldKey = text(item.fieldKey);
        if (
          !["ski_resort", "article", "dynamic", "merchant_profile"].includes(
            entityType,
          ) ||
          !/^[a-z][a-z0-9_]{0,99}$/.test(fieldKey) ||
          typeof item.canRead !== "boolean" ||
          typeof item.canWrite !== "boolean"
        )
          invalid();
        return {
          entityType,
          fieldKey,
          canRead: item.canRead,
          canWrite: item.canWrite,
        };
      }),
      (item) => `${item.entityType}:${item.fieldKey}`,
    ),
  };
}
export function parseRoleResources(
  value: unknown,
): components["schemas"]["AuthorizationResourceVO"][] {
  return unique(
    list(value).map((value) => {
      const item = row(value);
      return { resourceKey: text(item.resourceKey), label: text(item.label) };
    }),
    (item) => item.resourceKey,
  );
}
export function parseRolePermissionTree(
  value: unknown,
): components["schemas"]["PermissionNodeVO"][] {
  const seen = new Set<number>();
  function node(
    value: unknown,
    depth: number,
  ): components["schemas"]["PermissionNodeVO"] {
    if (depth > 64) invalid();
    const item = row(value),
      id = roleId(item.permissionId),
      type = item.permissionType;
    if (
      seen.has(id) ||
      !["directory", "menu", "button", "api"].includes(String(type))
    )
      invalid();
    seen.add(id);
    return {
      permissionId: id,
      parentId: item.parentId === null ? null : roleId(item.parentId),
      permissionKey: text(item.permissionKey),
      permissionName: text(item.permissionName),
      permissionType:
        type as components["schemas"]["PermissionNodeVO"]["permissionType"],
      route: nullableText(item.route),
      icon: nullableText(item.icon),
      children: list(item.children).map((value) => node(value, depth + 1)),
    };
  }
  return list(value).map((value) => node(value, 0));
}
