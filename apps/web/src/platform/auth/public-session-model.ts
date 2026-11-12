import type { components } from "@common/api-contracts/openapi";

export type PublicUser = components["schemas"]["CurrentUserVO"];
export type PublicSessionState = {
  pathname: string | null;
  user: PublicUser | null;
  ready: boolean;
  revision: number;
  error: string | null;
  reading: boolean;
  busy: boolean;
  uncertain: boolean;
};
export const initialPublicSession: PublicSessionState = {
  pathname: null,
  user: null,
  ready: false,
  revision: 0,
  error: null,
  reading: true,
  busy: false,
  uncertain: false,
};
export function visiblePublicSession(
  state: PublicSessionState,
  pathname: string | null,
) {
  return state.pathname === pathname
    ? state
    : { ...initialPublicSession, pathname, revision: state.revision };
}
export class PublicSessionError extends Error {}
function invalid(): never {
  throw new PublicSessionError("会话响应异常，请重新检查当前会话。");
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) invalid();
  return value;
}
function nullableText(value: unknown): string | null {
  if (value !== null && typeof value !== "string") invalid();
  return value;
}
function id(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value <= 0 ||
    value > 2147483647
  )
    invalid();
  return value;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) invalid();
  return value;
}
function menu(
  value: unknown,
  depth = 0,
): components["schemas"]["PermissionNodeVO"] {
  if (depth > 64) invalid();
  const row = record(value);
  const permissionType = row.permissionType;
  if (!["directory", "menu", "button", "api"].includes(String(permissionType)))
    invalid();
  return {
    permissionId: id(row.permissionId),
    parentId: row.parentId === null ? null : id(row.parentId),
    permissionKey: text(row.permissionKey),
    permissionName: text(row.permissionName),
    permissionType:
      permissionType as components["schemas"]["PermissionNodeVO"]["permissionType"],
    route: nullableText(row.route),
    icon: nullableText(row.icon),
    children: list(row.children).map((child) => menu(child, depth + 1)),
  };
}
export function parsePublicUser(value: unknown): PublicUser {
  const row = record(value);
  const merchant = row.merchant === null ? null : record(row.merchant);
  return {
    userId: id(row.userId),
    account: text(row.account),
    nickname: text(row.nickname),
    avatarUrl: nullableText(row.avatarUrl),
    roles: list(row.roles).map((value) => {
      const role = record(value);
      return { roleKey: text(role.roleKey), roleName: text(role.roleName) };
    }),
    permissionKeys: list(row.permissionKeys).map(text),
    menuTree: list(row.menuTree).map((value) => menu(value)),
    merchant:
      merchant === null
        ? null
        : {
            merchantId: id(merchant.merchantId),
            businessName: text(merchant.businessName),
          },
  };
}
export function loginInput(
  account: unknown,
  password: unknown,
): components["schemas"]["LoginUserDto"] {
  if (typeof account !== "string" || typeof password !== "string")
    throw new PublicSessionError("请填写账号和密码。");
  const normalizedAccount = account.trim().toLowerCase();
  const size = new TextEncoder().encode(password).length;
  if (
    !normalizedAccount ||
    [...normalizedAccount].length > 50 ||
    size === 0 ||
    size > 72
  )
    throw new PublicSessionError("账号为1–50字，登录密码为1–72个UTF-8字节。");
  return { account: normalizedAccount, password };
}
export function validateBrowserLogin(value: unknown, account: string): void {
  const row = record(value);
  if (row.accessToken !== undefined || row.refreshToken !== undefined)
    invalid();
  const user = parsePublicUser(row.currentUser);
  const expiry = Date.parse(text(row.accessTokenExpiresAt));
  const absolute = Date.parse(text(row.sessionExpiresAt));
  if (
    !Number.isFinite(expiry) ||
    !Number.isFinite(absolute) ||
    expiry > absolute ||
    user.account.trim().toLowerCase() !== account
  )
    invalid();
}
export function validateBrowserLogout(value: unknown): void {
  if (record(value).loggedOut !== true) invalid();
}
