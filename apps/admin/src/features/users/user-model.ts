import type { components } from "@common/api-contracts/openapi";
import { ApiError } from "@common/api-contracts/client";
import { parseCurrentUser } from "@/platform/auth/session-model";
export type Operator = components["schemas"]["CurrentUserVO"];
export type ManagedAccount = components["schemas"]["ManagedUserVO"];
export type AccountRole = components["schemas"]["ManagedRoleVO"];
export class UserInputError extends Error {}
export const isAccountAdministrator = (user: Operator) =>
  user.roles.some((role) => role.roleKey === "system_admin");
export function canReadAccounts(value: unknown): boolean {
  try {
    const user = parseCurrentUser(value);
    return ["management:portal:enter", "system:user:list"].every((key) =>
      user.permissionKeys.includes(key),
    );
  } catch {
    return false;
  }
}
export const accountWorkspaceKey = (user: Operator) =>
  JSON.stringify([
    user.userId,
    user.account,
    [...user.permissionKeys].sort(),
    user.roles.map((role) => role.roleKey).sort(),
    user.merchant,
  ]);
export function verifyAccountReader(current: unknown, expected: Operator) {
  if (
    !canReadAccounts(current) ||
    !canReadAccounts(expected) ||
    accountWorkspaceKey(parseCurrentUser(current)) !==
      accountWorkspaceKey(expected)
  )
    throw new UserInputError("账号或权限已变化，请重新读取身份");
}
export function accountError(cause: unknown) {
  if (cause instanceof UserInputError) return cause.message;
  const error = cause instanceof ApiError ? cause : null;
  const message =
    error?.status === 401
      ? "请先登录"
      : error?.status === 403
        ? "无权访问账号数据，请重新读取身份"
        : error?.status === 404
          ? "账号不存在或不可见"
          : "账号数据暂时不可用，请重试";
  return error?.traceId ? `${message}（traceId: ${error.traceId}）` : message;
}
export function accountListQuery(
  page: number,
  keyword: string,
  status?: string,
) {
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    (page - 1) * 20 > 2147483647 ||
    keyword.trim().length > 100 ||
    (status !== undefined && status !== "active" && status !== "disabled")
  )
    throw new UserInputError("页码或筛选条件无效");
  const query = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (keyword.trim()) query.set("keyword", keyword.trim());
  if (status) query.set("status", status);
  return query;
}
export function validateAccountRoleIds(ids: readonly number[]) {
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => !Number.isSafeInteger(id) || id < 1 || id > 2147483647)
  )
    throw new UserInputError("角色编号无效或重复");
}
export function replaceAccountRoles(
  ids: readonly number[],
  catalog: readonly AccountRole[],
  operator: Operator,
) {
  validateAccountRoleIds(ids);
  const selected = ids.map((id) => catalog.find((role) => role.roleId === id));
  if (selected.some((role) => !role || role.status !== "active"))
    throw new UserInputError(
      "所选角色不可用，请刷新角色目录或移除原有无效角色",
    );
  if (
    selected.some((role) => role!.roleKey === "system_admin") &&
    (!isAccountAdministrator(operator) || ids.length !== 1)
  )
    throw new UserInputError("系统管理员身份仅可由系统管理员独立授予");
  return { roleIds: [...ids].sort((a, b) => a - b) };
}
export interface AccountCreateValues {
  account: string;
  nickname: string;
  password: string;
  roleIds?: number[];
}
export function createAccountBody(
  values: AccountCreateValues,
  catalog: readonly AccountRole[],
  operator: Operator,
): components["schemas"]["CreateManagedUserDto"] {
  const account = values.account.trim().toLowerCase(),
    nickname = values.nickname.trim();
  const bytes = new TextEncoder().encode(values.password).length;
  if (
    !account ||
    Array.from(account).length > 50 ||
    !nickname ||
    Array.from(nickname).length > 50
  )
    throw new UserInputError("账号或昵称无效");
  if (bytes < 8 || bytes > 72)
    throw new UserInputError("密码必须为 8–72 UTF-8 字节");
  return {
    account,
    nickname,
    password: values.password,
    ...replaceAccountRoles(values.roleIds ?? [], catalog, operator),
  };
}
