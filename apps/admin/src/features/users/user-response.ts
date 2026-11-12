import type { components } from "@common/api-contracts/openapi";
import {
  UserInputError,
  type ManagedAccount,
  type AccountRole,
} from "@/features/users/user-model";
function invalid(): never {
  throw new UserInputError("账号或角色响应异常，请重新读取");
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
function id(value: unknown): number {
  const n = count(value);
  if (n < 1 || n > 2147483647) invalid();
  return n;
}
function status(value: unknown): "active" | "disabled" {
  if (value !== "active" && value !== "disabled") invalid();
  return value;
}
function unique<T>(items: T[], key: (value: T) => unknown): T[] {
  if (new Set(items.map(key)).size !== items.length) invalid();
  return items;
}
export function parseManagedAccount(
  value: unknown,
  expectedId?: number,
): ManagedAccount {
  const item = row(value),
    userId = id(item.userId),
    createdAt = text(item.createdAt);
  if (
    (expectedId !== undefined && userId !== expectedId) ||
    !/^\d{4}-\d{2}-\d{2}T/.test(createdAt) ||
    !Number.isFinite(Date.parse(createdAt))
  )
    invalid();
  const merchant = item.merchant === null ? null : row(item.merchant);
  return {
    userId,
    account: text(item.account),
    nickname: text(item.nickname),
    status: status(item.status),
    createdAt,
    roles: unique(
      list(item.roles).map((value) => {
        const r = row(value);
        return {
          roleId: id(r.roleId),
          roleKey: text(r.roleKey),
          roleName: text(r.roleName),
          systemRoleCode: nullableText(r.systemRoleCode),
          status: status(r.status),
        };
      }),
      (r) => r.roleId,
    ),
    merchant:
      merchant === null
        ? null
        : {
            merchantId: id(merchant.merchantId),
            businessName: text(merchant.businessName),
            status: status(merchant.status),
          },
  };
}
function parsePage<T>(
  value: unknown,
  page: number,
  pageSize: number,
  parse: (value: unknown) => T,
  key: (value: T) => unknown,
) {
  const result = row(value),
    raw = list(result.items),
    total = count(result.total);
  if (
    result.page !== page ||
    result.pageSize !== pageSize ||
    raw.length > pageSize ||
    total < raw.length ||
    (raw.length > 0 && (page - 1) * pageSize + raw.length > total) ||
    result.hasNext !== page * pageSize < total
  )
    invalid();
  return {
    page,
    pageSize,
    total,
    hasNext: result.hasNext as boolean,
    items: unique(raw.map(parse), key),
  };
}
export function parseAccountPage(
  value: unknown,
  page: number,
  pageSize: number,
  expectedStatus?: string,
): components["schemas"]["ManagedUserPageVO"] {
  return parsePage(
    value,
    page,
    pageSize,
    (item) => {
      const result = parseManagedAccount(item);
      if (expectedStatus !== undefined && result.status !== expectedStatus)
        invalid();
      return result;
    },
    (item) => item.userId,
  );
}
export function parseAccountRolePage(
  value: unknown,
  page: number,
): components["schemas"]["ManagedRolePageVO"] {
  return parsePage(
    value,
    page,
    100,
    (value): AccountRole => {
      const r = row(value),
        scope = r.dataScope;
      if (
        !["self", "merchant", "all"].includes(String(scope)) ||
        status(r.status) !== "active"
      )
        invalid();
      const dataScopes = unique(
        list(r.dataScopes).map((value) => {
          const s = row(value),
            scopeType = text(s.scopeType);
          if (!["self", "merchant", "selected", "all"].includes(scopeType))
            invalid();
          return { resourceKey: text(s.resourceKey), scopeType };
        }),
        (s) => s.resourceKey,
      );
      return {
        roleId: id(r.roleId),
        roleKey: text(r.roleKey),
        roleName: text(r.roleName),
        ...(r.description === undefined
          ? {}
          : { description: nullableText(r.description) }),
        status: "active",
        dataScope: scope as AccountRole["dataScope"],
        userCount: count(r.userCount),
        permissionCount: count(r.permissionCount),
        fieldPolicyCount: count(r.fieldPolicyCount),
        dataScopes,
      };
    },
    (r) => r.roleId,
  );
}
