import type { components } from "@common/api-contracts/openapi";
import { ApiError } from "@common/api-contracts/client";
import { parseCurrentUser } from "@/platform/auth/session-model";

export type CatalogNode = components["schemas"]["PermissionCatalogVO"];
export type CatalogUser = components["schemas"]["CurrentUserVO"];
export type CatalogType =
  components["schemas"]["CreatePermissionCatalogDto"]["permissionType"];
export type CatalogForm =
  components["schemas"]["CreatePermissionCatalogDto"] & {
    status?: "active" | "disabled";
  };
export type CatalogRow = Omit<CatalogNode, "children"> & {
  depth: number;
  childCount: number;
};
export class CatalogInputError extends Error {}

export function flattenCatalog(nodes: readonly CatalogNode[]): CatalogRow[] {
  const rows: CatalogRow[] = [],
    seen = new Set<number>();
  const stack = nodes.map((node) => ({ node, depth: 0 })).reverse();
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    if (seen.has(node.permissionId))
      throw new CatalogInputError("权限目录结构异常，请刷新");
    seen.add(node.permissionId);
    const { children, ...row } = node;
    rows.push({ ...row, depth, childCount: children.length });
    for (let index = children.length - 1; index >= 0; index--)
      stack.push({ node: children[index]!, depth: depth + 1 });
  }
  return rows;
}
export function parentCandidates(
  nodes: readonly CatalogNode[],
  type: CatalogType,
  editing?: CatalogNode | null,
) {
  if (type === "directory") return [];
  const excluded = new Set(
    editing ? flattenCatalog([editing]).map((n) => n.permissionId) : [],
  );
  return flattenCatalog(nodes)
    .filter(
      (row) =>
        row.status === "active" &&
        row.permissionType === (type === "menu" ? "directory" : "menu") &&
        !excluded.has(row.permissionId),
    )
    .map((row) => ({
      value: row.permissionId,
      label: `${"　".repeat(row.depth)}${row.permissionName}`,
    }));
}
export function canReadCatalog(user: CatalogUser) {
  return ["management:portal:enter", "system:permission:list"].every((key) =>
    user.permissionKeys.includes(key),
  );
}
export function isCatalogAdmin(user: CatalogUser) {
  return user.roles.some((role) => role.roleKey === "system_admin");
}
export function catalogWorkspaceKey(user: CatalogUser) {
  user = parseCurrentUser(user);
  return JSON.stringify([
    user.userId,
    user.account,
    user.merchant,
    [...user.permissionKeys].sort(),
    user.roles.map((r) => r.roleKey).sort(),
  ]);
}
export function verifyCatalogIdentity(value: unknown, expected: CatalogUser) {
  let current: CatalogUser;
  try {
    current = parseCurrentUser(value);
    expected = parseCurrentUser(expected);
  } catch {
    throw new CatalogInputError("身份响应异常，请重新读取身份");
  }
  if (
    !canReadCatalog(current) ||
    catalogWorkspaceKey(current) !== catalogWorkspaceKey(expected)
  )
    throw new CatalogInputError("账号或权限已变化，请重新读取身份");
  return current;
}
export function canDisableCatalogNode(
  node: Pick<CatalogNode, "source" | "permissionType" | "status">,
) {
  return (
    node.source === "custom" &&
    node.status === "active" &&
    (node.permissionType === "menu" || node.permissionType === "button")
  );
}
function text(value: unknown, max: number, required = false): string | null {
  if (typeof value !== "string" && value !== null && value !== undefined)
    throw new CatalogInputError("请输入有效文本");
  const result = value?.trim() || null;
  if ((required && !result) || (result && result.length > max))
    throw new CatalogInputError("文本为空或超过长度限制");
  return result;
}
function mutableBody(
  values: CatalogForm,
  type: CatalogType,
  candidates: readonly { value: number }[],
) {
  const parentId = type === "directory" ? null : values.parentId;
  if (
    type !== "directory" &&
    (!Number.isInteger(parentId) ||
      !candidates.some((p) => p.value === parentId))
  )
    throw new CatalogInputError("请选择有效的活动父级");
  const route = text(values.route, 200);
  if (type === "menu" && route && !route.startsWith("/"))
    throw new CatalogInputError("菜单路由必须以 / 开头");
  if (
    !Number.isInteger(values.sortOrder) ||
    values.sortOrder < -100000 ||
    values.sortOrder > 100000 ||
    typeof values.visible !== "boolean"
  )
    throw new CatalogInputError("排序或可见设置无效");
  return {
    parentId,
    permissionName: text(values.permissionName, 100, true)!,
    route,
    icon: text(values.icon, 100),
    sortOrder: values.sortOrder,
    visible: values.visible,
  };
}
export function createCatalogBody(
  values: CatalogForm,
  candidates: readonly { value: number }[],
): components["schemas"]["CreatePermissionCatalogDto"] {
  if (!["directory", "menu", "button"].includes(values.permissionType))
    throw new CatalogInputError("节点类型无效");
  if (!/^custom:[a-z0-9][a-z0-9._:-]{0,92}$/.test(values.permissionKey))
    throw new CatalogInputError("唯一键必须使用有效的 custom: 前缀");
  return {
    ...mutableBody(values, values.permissionType, candidates),
    permissionKey: values.permissionKey,
    permissionType: values.permissionType,
  };
}
export function updateCatalogBody(
  values: CatalogForm,
  editing: CatalogNode,
  candidates: readonly { value: number }[],
): components["schemas"]["UpdatePermissionCatalogDto"] {
  if (editing.permissionType === "api")
    throw new CatalogInputError("API 权限请通过注册表同步维护");
  const body: components["schemas"]["UpdatePermissionCatalogDto"] = mutableBody(
    values,
    editing.permissionType,
    candidates,
  );
  if (editing.source === "custom" && editing.permissionType !== "directory") {
    if (values.status !== "active" && values.status !== "disabled")
      throw new CatalogInputError("状态无效");
    body.status = values.status;
  }
  return body;
}
export function catalogReadError(cause: unknown) {
  if (cause instanceof CatalogInputError) return cause.message;
  const error = cause instanceof ApiError ? cause : null;
  const message =
    error?.status === 401
      ? "请先登录"
      : error?.status === 403
        ? "无权读取权限目录，请重新读取身份"
        : error?.status === 404
          ? "目录节点已不存在，请刷新"
          : "权限目录暂时不可用，请重试";
  return error?.traceId ? `${message}（traceId: ${error.traceId}）` : message;
}

/** One mounted account owns the gate; validation and identity reads are locked. */
export class CatalogWriteGate {
  private controller = new AbortController();
  private active = false;
  private busy = false;
  private blocked = false;
  constructor(
    private user: CatalogUser,
    private verify: (signal: AbortSignal) => Promise<CatalogUser>,
    private onBusy: (value: boolean) => void,
    initiallyBlocked = false,
    private beginWrite?: () => () => void,
  ) {
    this.blocked = initiallyBlocked;
  }
  activate(blocked?: boolean) {
    if (blocked !== undefined) this.blocked = blocked;
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
  acknowledgeReview() {
    if (this.active && !this.busy) this.blocked = false;
  }
  isLocked() {
    return this.busy || this.blocked;
  }
  isRunning() {
    return this.busy;
  }
  async run<T>(
    action: "create" | "update" | "delete" | "sync",
    prepare: (signal: AbortSignal) => Promise<T | null>,
    write: (value: T, signal: AbortSignal) => Promise<unknown>,
    committed: () => void,
  ) {
    if (!this.active || this.busy || this.blocked)
      return { status: "ignored" as const };
    this.busy = true;
    this.onBusy(true);
    const controller = this.controller;
    const current = () =>
      this.active &&
      this.controller === controller &&
      !controller.signal.aborted;
    let attempted = false;
    let finishWrite: (() => void) | undefined;
    try {
      verifyCatalogIdentity(this.user, this.user);
      const value = await prepare(controller.signal);
      if (!current() || value === null) return { status: "ignored" as const };
      const response = await this.verify(controller.signal);
      if (!current()) return { status: "ignored" as const };
      const user = verifyCatalogIdentity(response, this.user);
      const permission = `system:permission:${action === "sync" ? "update" : action}`;
      if (
        user.userId !== this.user.userId ||
        !canReadCatalog(user) ||
        !user.permissionKeys.includes(permission) ||
        (action === "sync" && !isCatalogAdmin(user))
      )
        throw new CatalogInputError("账号或权限已变化，请重新读取身份");
      attempted = true;
      finishWrite = this.beginWrite?.();
      await write(value, controller.signal);
      attempted = false;
      finishWrite?.();
      if (!current()) return { status: "ignored" as const };
      committed();
      return { status: "success" as const };
    } catch (cause) {
      const definitive =
        cause instanceof ApiError &&
        cause.status >= 400 &&
        cause.status < 500 &&
        cause.status !== 408;
      if (attempted && definitive) finishWrite?.();
      if (!current()) return { status: "ignored" as const };
      const uncertain = attempted && !definitive;
      if (uncertain) this.blocked = true;
      const message = uncertain
        ? "操作结果未确认，请刷新目录并核对后继续，避免重复提交"
        : cause instanceof CatalogInputError
          ? cause.message
          : definitive
            ? "操作被拒绝，请核对权限、父级、唯一键及角色引用后重试"
            : "操作未完成，请稍后重试";
      return {
        status: "error" as const,
        uncertain,
        message,
        traceId: cause instanceof ApiError ? cause.traceId : null,
      };
    } finally {
      if (controller === this.controller) {
        this.busy = false;
        if (current()) this.onBusy(false);
      }
    }
  }
}
