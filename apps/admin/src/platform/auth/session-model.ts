import type { components } from "@common/api-contracts/openapi";
export type CurrentUser = components["schemas"]["CurrentUserVO"];
export type SessionState =
  | { status: "loading"; currentUser: null; errorMessage: null }
  | { status: "anonymous"; currentUser: null; errorMessage: null }
  | { status: "authenticated"; currentUser: CurrentUser; errorMessage: null }
  | {
      status: "unavailable";
      currentUser: null;
      errorMessage: string;
      canSignOut?: boolean;
    };
export const loadingSession: SessionState = {
  status: "loading",
  currentUser: null,
  errorMessage: null,
};
export class SessionInputError extends Error {}
/** A response/read failure after a dispatched write must not be called rejection. */
export class SessionOutcomeUnknown extends Error {}
export function loginInput(input: { account: string; password: string }) {
  if (typeof input.account !== "string" || typeof input.password !== "string")
    throw new SessionInputError("请输入账号和密码。");
  const account = input.account.trim().toLowerCase();
  const bytes = new TextEncoder().encode(input.password).length;
  if (!account || [...account].length > 50 || bytes === 0 || bytes > 72)
    throw new SessionInputError("账号为1–50字，登录密码为1–72个UTF-8字节。");
  return { account, password: input.password };
}
function invalid(): never {
  throw new SessionOutcomeUnknown("会话响应异常，请重新检查会话。");
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
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) invalid();
  return value;
}
function menu(
  value: unknown,
  depth = 0,
): components["schemas"]["PermissionNodeVO"] {
  if (depth > 64) invalid();
  const item = row(value);
  const type = item.permissionType;
  if (!["directory", "menu", "button", "api"].includes(String(type))) invalid();
  return {
    permissionId: id(item.permissionId),
    parentId: item.parentId === null ? null : id(item.parentId),
    permissionKey: text(item.permissionKey),
    permissionName: text(item.permissionName),
    permissionType:
      type as components["schemas"]["PermissionNodeVO"]["permissionType"],
    route: nullableText(item.route),
    icon: nullableText(item.icon),
    children: array(item.children).map((child) => menu(child, depth + 1)),
  };
}
export function parseCurrentUser(value: unknown): CurrentUser {
  const item = row(value);
  const merchant = item.merchant === null ? null : row(item.merchant);
  return {
    userId: id(item.userId),
    account: text(item.account),
    nickname: text(item.nickname),
    avatarUrl: nullableText(item.avatarUrl),
    roles: array(item.roles).map((value) => {
      const role = row(value);
      return { roleKey: text(role.roleKey), roleName: text(role.roleName) };
    }),
    permissionKeys: array(item.permissionKeys).map(text),
    menuTree: array(item.menuTree).map((value) => menu(value)),
    merchant:
      merchant === null
        ? null
        : {
            merchantId: id(merchant.merchantId),
            businessName: text(merchant.businessName),
          },
  };
}
export function validateSessionResponse(
  value: unknown,
  account?: string,
): void {
  const item = row(value);
  if (item.accessToken !== undefined || item.refreshToken !== undefined)
    invalid();
  const user = parseCurrentUser(item.currentUser);
  const access = Date.parse(text(item.accessTokenExpiresAt)),
    absolute = Date.parse(text(item.sessionExpiresAt));
  if (
    !Number.isFinite(access) ||
    !Number.isFinite(absolute) ||
    access > absolute ||
    (account !== undefined && user.account.trim().toLowerCase() !== account)
  )
    invalid();
}
export function validateLogout(value: unknown): void {
  if (row(value).loggedOut !== true) invalid();
}
