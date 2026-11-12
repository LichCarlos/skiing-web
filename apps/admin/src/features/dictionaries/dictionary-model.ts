import type { components } from "@common/api-contracts/openapi";
import { ApiError } from "@common/api-contracts/client";
import type { DictionaryWriteReceipt } from "@/features/dictionaries/dictionary-recovery";
import { parseCurrentUser } from "@/platform/auth/session-model";

export type Dictionary = components["schemas"]["DictionaryTypeVO"];
export type DictionaryPage = components["schemas"]["DictionaryTypePageVO"];
export type DictionaryUser = components["schemas"]["CurrentUserVO"];
export function dictionaryWorkspaceKey(user: DictionaryUser) {
  return JSON.stringify([
    user.userId,
    user.account,
    user.merchant?.merchantId ?? null,
    [...user.permissionKeys].sort(),
    user.roles.map((role) => role.roleKey).sort(),
  ]);
}
export function verifyDictionaryIdentity(
  current: DictionaryUser,
  expected: DictionaryUser,
) {
  current = parseCurrentUser(current);
  expected = parseCurrentUser(expected);
  if (
    dictionaryWorkspaceKey(current) !== dictionaryWorkspaceKey(expected) ||
    !["management:portal:enter", "system:dict:list"].every((key) =>
      current.permissionKeys.includes(key),
    )
  )
    throw new Error("登录账号或权限已变化，请重新打开字典页");
}
export type Item = components["schemas"]["DictionaryItemVO"];
export type ItemRow = Omit<Item, "children"> & { depth: number };
export type DictionaryTypeForm =
  components["schemas"]["CreateDictionaryTypeDto"] &
    Pick<components["schemas"]["UpdateDictionaryTypeDto"], "status">;
export type DictionaryItemForm = Omit<
  components["schemas"]["CreateDictionaryItemDto"],
  "color"
> & { color?: string } & Pick<
    components["schemas"]["UpdateDictionaryItemDto"],
    "status"
  >;

export function dictionaryRows(items: Item[], depth = 0): ItemRow[] {
  const result: ItemRow[] = [],
    pending = items.map((item) => ({ item, depth })).reverse(),
    seen = new Set<number>();
  while (pending.length) {
    const {
      item: { children, ...item },
      depth,
    } = pending.pop()!;
    if (seen.has(item.itemId)) throw new Error("字典项目重复");
    seen.add(item.itemId);
    result.push({ ...item, depth });
    for (let i = children.length - 1; i >= 0; i--)
      pending.push({ item: children[i]!, depth: depth + 1 });
  }
  return result;
}

export function dictionaryParents(items: Item[], editingId?: number) {
  const rows = dictionaryRows(items);
  const excluded = new Set<number>();
  const index = rows.findIndex((item) => item.itemId === editingId);
  if (index >= 0) {
    excluded.add(rows[index]!.itemId);
    for (
      let i = index + 1;
      i < rows.length && rows[i]!.depth > rows[index]!.depth;
      i++
    )
      excluded.add(rows[i]!.itemId);
  }
  return rows
    .filter((item) => !excluded.has(item.itemId))
    .map((item) => ({
      value: item.itemId,
      label: `${"　".repeat(Math.min(item.depth, 24))}${item.label} (${item.value})`,
    }));
}

export function dictionaryItemBody(
  input: DictionaryItemForm,
): components["schemas"]["CreateDictionaryItemDto"] &
  Pick<components["schemas"]["UpdateDictionaryItemDto"], "status"> {
  return {
    label: input.label,
    value: input.value,
    parentId: input.parentId ?? null,
    color: input.color?.trim() || null,
    sortOrder: input.sortOrder,
    isDefault: input.isDefault,
    ...(input.status === undefined ? {} : { status: input.status }),
  };
}

export function dictionaryReadError(cause: unknown) {
  if (cause instanceof ApiError && cause.status === 403)
    return "当前账号无权读取数据字典";
  if (cause instanceof ApiError && cause.status === 404)
    return "字典已不存在，请刷新列表";
  return "数据字典暂时不可用";
}

export { RequestLane as DictionaryReadLane } from "@/platform/api/request-lane";

export type WriteResult =
  | { status: "success" }
  | { status: "ignored" }
  | { status: "error"; uncertain: boolean; message: string };

/** Scoped to one mounted account and permission snapshot. No application retry. */
export class DictionaryWriteGate {
  private controller = new AbortController();
  private active = false;
  private busy = false;
  private blocked = false;
  constructor(
    private readonly userId: number,
    private readonly verify: (
      signal: AbortSignal,
    ) => Promise<components["schemas"]["CurrentUserVO"]>,
    private readonly onBusy: (busy: boolean) => void,
    private readonly recovery?: {
      user: DictionaryUser;
      has(): boolean;
      begin(dictType: string): DictionaryWriteReceipt | null;
    },
  ) {}
  activate() {
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
    if (this.active && !this.busy && !this.recovery?.has())
      this.blocked = false;
  }
  isLocked() {
    return this.busy || this.blocked || (this.recovery?.has() ?? false);
  }
  async run<T>(
    permission: string,
    prepare: () => Promise<T | null>,
    write: (value: T, signal: AbortSignal) => Promise<unknown>,
    committed: () => void,
    dictType?: string,
  ): Promise<WriteResult> {
    if (!this.isActive() || this.isLocked()) return { status: "ignored" };
    this.busy = true;
    this.onBusy(true);
    const controller = this.controller;
    const current = () =>
      this.active &&
      this.controller === controller &&
      !controller.signal.aborted;
    let attempted = false;
    let receipt: DictionaryWriteReceipt | undefined;
    try {
      if (this.recovery) {
        verifyDictionaryIdentity(this.recovery.user, this.recovery.user);
        if (!this.recovery.user.permissionKeys.includes(permission))
          throw new Error("Missing dictionary action permission");
      }
      const value = await prepare();
      if (!current() || value === null) return { status: "ignored" };
      const user = parseCurrentUser(await this.verify(controller.signal));
      if (!current()) return { status: "ignored" };
      if (this.recovery) verifyDictionaryIdentity(user, this.recovery.user);
      if (
        user.userId !== this.userId ||
        !["management:portal:enter", "system:dict:list", permission].every(
          (key) => user.permissionKeys.includes(key),
        )
      ) {
        return {
          status: "error",
          uncertain: false,
          message: "登录账号或权限已变化，请重新打开字典页",
        };
      }
      if (this.recovery) {
        const begun = dictType ? this.recovery.begin(dictType) : null;
        if (!begun) return { status: "ignored" };
        receipt = begun;
      }
      attempted = true;
      await write(value, controller.signal);
      attempted = false;
      receipt?.confirm();
      if (!current()) return { status: "ignored" };
      committed();
      return { status: "success" };
    } catch (cause) {
      const definitive =
        cause instanceof ApiError &&
        cause.status >= 400 &&
        cause.status < 500 &&
        cause.status !== 408;
      const uncertain = attempted && !definitive;
      if (attempted) {
        if (definitive) receipt?.confirm();
        else receipt?.uncertain();
      }
      if (!current()) return { status: "ignored" };
      if (uncertain && !this.recovery) this.blocked = true;
      return {
        status: "error",
        uncertain,
        message: uncertain
          ? "操作结果未确认，请先刷新核对，避免重复新增。"
          : "操作未完成，请核对权限、字典值和引用状态后重试。",
      };
    } finally {
      if (controller === this.controller) {
        this.busy = false;
        if (current()) this.onBusy(false);
      }
    }
  }
}
