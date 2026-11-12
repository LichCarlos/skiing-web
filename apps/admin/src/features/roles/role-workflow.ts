import type { components } from "@common/api-contracts/openapi";
import { ApiError } from "@common/api-contracts/client";
import { parseCurrentUser } from "@/platform/auth/session-model";
export type RoleUser = components["schemas"]["CurrentUserVO"];
export type ManagedRole = components["schemas"]["ManagedRoleVO"];
export type RoleAction = "create" | "update" | "delete" | "authorize";
export class RoleInputError extends Error {}
export const isRoleAdministrator = (user: RoleUser) =>
  user.roles.some((r) => r.roleKey === "system_admin");
export const canReadRoles = (user: RoleUser) =>
  ["management:portal:enter", "system:role:list"].every((key) =>
    user.permissionKeys.includes(key),
  );
export function roleWorkspaceKey(user: RoleUser) {
  user = parseCurrentUser(user);
  return JSON.stringify([
    user.userId,
    user.account,
    user.merchant,
    [...user.permissionKeys].sort(),
    user.roles.map((r) => r.roleKey).sort(),
  ]);
}
export function verifyRoleReader(current: unknown, expected: RoleUser) {
  let user: RoleUser;
  try {
    user = parseCurrentUser(current);
    expected = parseCurrentUser(expected);
  } catch {
    throw new RoleInputError("身份响应异常，请重新读取身份");
  }
  if (
    !canReadRoles(user) ||
    roleWorkspaceKey(user) !== roleWorkspaceKey(expected)
  )
    throw new RoleInputError("账号或权限已变化，请重新读取身份");
}
export function roleError(cause: unknown) {
  if (cause instanceof RoleInputError) return cause.message;
  const error = cause instanceof ApiError ? cause : null;
  const message =
    error?.status === 401
      ? "请先登录"
      : error?.status === 403
        ? "无权读取角色，请重新读取身份"
        : error?.status === 404
          ? "角色不存在或不可见"
          : "角色数据暂时不可用，请重试";
  return error?.traceId ? `${message}（traceId: ${error.traceId}）` : message;
}
export class RoleWriteGate {
  private controller = new AbortController();
  private active = false;
  private busy = false;
  private blocked: boolean;
  constructor(
    private user: RoleUser,
    private verify: (signal: AbortSignal) => Promise<RoleUser>,
    private onBusy: (busy: boolean) => void,
    private begin: () => () => void,
    pending = false,
  ) {
    this.blocked = pending;
  }
  activate(pending?: boolean) {
    if (pending !== undefined) this.blocked = pending;
    this.active = true;
    if (this.controller.signal.aborted) {
      this.controller = new AbortController();
      this.busy = false;
    }
  }
  dispose() {
    this.active = false;
    this.controller.abort();
    this.busy = false;
  }
  isActive() {
    return this.active && !this.controller.signal.aborted;
  }
  isLocked() {
    return this.busy || this.blocked;
  }
  isRunning() {
    return this.busy;
  }
  acknowledge() {
    if (this.isActive() && !this.busy) this.blocked = false;
  }
  async run<T>(
    action: RoleAction,
    prepare: (signal: AbortSignal) => Promise<T | null>,
    write: (body: T, signal: AbortSignal) => Promise<unknown>,
    committed: () => void,
    requiresAdmin = false,
  ) {
    if (!this.isActive() || this.isLocked())
      return { status: "ignored" as const };
    this.busy = true;
    this.onBusy(true);
    const controller = this.controller;
    const current = () =>
      this.active &&
      this.controller === controller &&
      !controller.signal.aborted;
    let attempted = false,
      finish: (() => void) | undefined;
    try {
      verifyRoleReader(this.user, this.user);
      const body = await prepare(controller.signal);
      if (!current() || body === null) return { status: "ignored" as const };
      const user = await this.verify(controller.signal);
      if (!current()) return { status: "ignored" as const };
      verifyRoleReader(user, this.user);
      const permissions =
        action === "authorize"
          ? ["system:role:update", "system:permission:assign"]
          : [`system:role:${action}`];
      if (
        !permissions.every((key) => user.permissionKeys.includes(key)) ||
        ((requiresAdmin || action === "authorize") &&
          !isRoleAdministrator(user))
      )
        throw new RoleInputError("当前身份无权执行此操作，请重新读取身份");
      finish = this.begin();
      attempted = true;
      await write(body, controller.signal);
      attempted = false;
      finish();
      if (!current()) return { status: "ignored" as const };
      committed();
      return { status: "success" as const };
    } catch (cause) {
      const definitive =
        cause instanceof ApiError &&
        cause.status >= 400 &&
        cause.status < 500 &&
        cause.status !== 408;
      if (attempted && definitive) finish?.();
      if (!current()) return { status: "ignored" as const };
      const uncertain = attempted && !definitive;
      if (uncertain) this.blocked = true;
      const message = uncertain
        ? "操作结果未确认，请刷新角色数据并核对后继续"
        : cause instanceof RoleInputError
          ? cause.message
          : definitive
            ? "操作被拒绝，请核对权限、范围、角色键和保护规则后重试"
            : "操作未完成，请稍后重试";
      return {
        status: "error" as const,
        uncertain,
        message,
        traceId: cause instanceof ApiError ? cause.traceId : null,
      };
    } finally {
      if (this.controller === controller) {
        this.busy = false;
        if (current()) this.onBusy(false);
      }
    }
  }
}
