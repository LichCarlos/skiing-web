import type { components } from "@common/api-contracts/openapi";
import { ApiError } from "@common/api-contracts/client";
import { parseCurrentUser } from "@/platform/auth/session-model";
import type { FieldWriteReceipt } from "@/features/custom-fields/field-recovery";

export type User = components["schemas"]["CurrentUserVO"];
export type Field = components["schemas"]["CustomFieldDefinitionVO"];
export type Group = components["schemas"]["CustomFieldGroupVO"];
export type FieldPage = components["schemas"]["CustomFieldDefinitionPageVO"];
export type EntityType =
  components["schemas"]["CreateCustomFieldDto"]["entityType"];
export type FieldForm = Omit<
  components["schemas"]["CreateCustomFieldDto"],
  "entityType" | "fieldKey" | "defaultValue" | "validation" | "optionsDictType"
> & {
  fieldKey?: string;
  defaultValueText?: string;
  validationText?: string;
  optionsDictType?: string;
};
export type GroupForm = Omit<
  components["schemas"]["CreateCustomFieldGroupDto"],
  "entityType" | "groupKey"
> & { groupKey?: string };
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export class FieldInputError extends Error {}

function json(text: string | undefined, label: string): Json {
  if (!text?.trim()) return null;
  try {
    return JSON.parse(text, (_key, value: unknown) => {
      if (typeof value === "number" && !Number.isFinite(value))
        throw new FieldInputError(`${label}包含超出范围的数字`);
      return value;
    }) as Json;
  } catch {
    throw new FieldInputError(`${label}不是有效 JSON`);
  }
}
export function fieldBody(
  values: FieldForm,
  isSystemAdmin: boolean,
): Omit<
  components["schemas"]["UpdateCustomFieldDto"],
  "expectedSchemaVersion"
> {
  const validation = json(values.validationText, "校验规则");
  if (
    validation !== null &&
    (typeof validation !== "object" || Array.isArray(validation))
  )
    throw new FieldInputError("校验规则必须是 JSON 对象或 null");
  return {
    label: values.label.trim(),
    groupKey: values.groupKey,
    sortOrder: values.sortOrder,
    required: values.required,
    defaultValue: json(values.defaultValueText, "默认值"),
    validation,
    optionsDictType: values.optionsDictType?.trim() || null,
    searchable: values.searchable,
    filterable: values.filterable,
    sortable: values.sortable,
    ...(isSystemAdmin ? { isPublic: values.isPublic ?? false } : {}),
  };
}
export function createFieldBody(
  values: FieldForm,
  entityType: EntityType,
  isSystemAdmin: boolean,
): components["schemas"]["CreateCustomFieldDto"] {
  return {
    ...fieldBody(values, isSystemAdmin),
    entityType,
    fieldKey: values.fieldKey?.trim() ?? "",
    dataType: values.dataType,
    label: values.label.trim(),
    groupKey: values.groupKey,
    sortOrder: values.sortOrder,
    required: values.required,
    searchable: values.searchable,
    filterable: values.filterable,
    sortable: values.sortable,
    isPublic: isSystemAdmin ? (values.isPublic ?? false) : false,
  };
}
export function groupBody(
  values: GroupForm,
): components["schemas"]["UpdateCustomFieldGroupDto"] {
  return { label: values.label.trim(), sortOrder: values.sortOrder };
}
export function groupPath(entityType: EntityType, groupKey: string) {
  return `/admin/custom-field-groups/${entityType}/${encodeURIComponent(groupKey)}`;
}
export function fieldReadError(cause: unknown, group = false) {
  const label = group ? "字段分组" : "字段配置";
  if (cause instanceof ApiError && cause.status === 403)
    return `当前账号无权读取${label}`;
  if (cause instanceof ApiError && cause.status === 404)
    return `${label}已不存在，请刷新核对`;
  return `${label}暂时不可用`;
}
export function workspaceKey(user: User, entityType: EntityType) {
  return JSON.stringify([
    user.userId,
    user.account,
    user.merchant?.merchantId ?? null,
    [...user.permissionKeys].sort(),
    user.roles.map((r) => r.roleKey).sort(),
    entityType,
  ]);
}
export function canReadFields(user: User) {
  return ["management:portal:enter", "system:field:list"].every((key) =>
    user.permissionKeys.includes(key),
  );
}
export function verifyFieldIdentity(value: unknown, snapshot: unknown) {
  let current: User, expected: User;
  try {
    current = parseCurrentUser(value);
    expected = parseCurrentUser(snapshot);
  } catch {
    throw new FieldInputError("登录账号或权限已变化，请重新打开字段页");
  }
  if (
    !canReadFields(current) ||
    workspaceKey(current, "ski_resort") !== workspaceKey(expected, "ski_resort")
  )
    throw new FieldInputError("登录账号或权限已变化，请重新打开字段页");
}

/** A single mounted account/entity owns this gate. Never retries a mutation. */
export class FieldWriteGate {
  private controller = new AbortController();
  private active = false;
  private busy = false;
  private blocked = false;
  constructor(
    private user: User,
    private verify: (signal: AbortSignal) => Promise<User>,
    private onBusy: (busy: boolean) => void,
    private recovery?: {
      has(): boolean;
      begin(permission: string): FieldWriteReceipt | null;
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
    let attempted = false;
    let receipt: FieldWriteReceipt | undefined;
    try {
      verifyFieldIdentity(this.user, this.user);
      if (!this.user.permissionKeys.includes(permission))
        throw new FieldInputError("登录账号或权限已变化，请重新打开字段页");
      const value = await prepare();
      if (!current() || value === null) return { status: "ignored" as const };
      const user = await this.verify(controller.signal);
      if (!current()) return { status: "ignored" as const };
      verifyFieldIdentity(user, this.user);
      if (!user.permissionKeys.includes(permission))
        throw new FieldInputError("登录账号或权限已变化，请重新打开字段页");
      if (this.recovery) {
        const begun = this.recovery.begin(permission);
        if (!begun) return { status: "ignored" as const };
        receipt = begun;
      }
      attempted = true;
      await write(value, controller.signal);
      attempted = false;
      receipt?.confirm();
      if (!current()) return { status: "ignored" as const };
      committed();
      return { status: "success" as const };
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
      if (!current()) return { status: "ignored" as const };
      if (uncertain && !this.recovery) this.blocked = true;
      return {
        status: "error" as const,
        uncertain,
        message: uncertain
          ? "操作结果未确认，请先刷新核对，避免重复提交"
          : cause instanceof FieldInputError
            ? cause.message
            : "操作未完成，请核对权限、版本、字段值和引用后重试",
      };
    } finally {
      if (controller === this.controller) {
        this.busy = false;
        if (current()) this.onBusy(false);
      }
    }
  }
}
