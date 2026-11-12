import type { ApiRequestOptions } from "@common/api-contracts/client";
import { parseCurrentUser } from "@/platform/auth/session-model";
import {
  assertFieldEntity,
  fieldRecord,
  invalidFieldResponse as invalid,
  validFieldId as id,
  parseField as field,
  parseFieldGroup as group,
} from "@/features/custom-fields/field-responses";
import {
  FieldInputError,
  groupPath,
  verifyFieldIdentity,
  type EntityType,
  type FieldPage,
  type User,
} from "@/features/custom-fields/field-model";

export type FieldRequest = <T>(
  path: string,
  options?: ApiRequestOptions,
) => Promise<T>;
async function verified<T>(
  request: FieldRequest,
  user: User,
  permission: string,
  signal: AbortSignal,
  read: () => Promise<T>,
) {
  verifyFieldIdentity(user, user);
  const verify = async () => {
    signal.throwIfAborted();
    const current = parseCurrentUser(
      await request<unknown>("/auth/me", { signal, cache: "no-store" }),
    );
    signal.throwIfAborted();
    verifyFieldIdentity(current, user);
    if (!current.permissionKeys.includes(permission))
      throw new FieldInputError("字段或分组查询权限已变化，请重新读取身份");
  };
  await verify();
  const value = await read();
  signal.throwIfAborted();
  await verify();
  return value;
}
export function readFieldPage(
  request: FieldRequest,
  user: User,
  entityType: EntityType,
  page: number,
  status: string | undefined,
  signal: AbortSignal,
) {
  assertFieldEntity(entityType);
  if (
    !id(page) ||
    (page - 1) * 20 > 2147483647 ||
    (status !== undefined && !["active", "draft", "disabled"].includes(status))
  )
    invalid();
  const query = new URLSearchParams({
    entityType,
    page: String(page),
    pageSize: "20",
  });
  if (status) query.set("status", status);
  return verified(request, user, "system:field:list", signal, async () => {
    const value = fieldRecord(
      await request<unknown>(`/admin/custom-fields?${query}`, {
        signal,
        cache: "no-store",
      }),
    );
    if (
      !value ||
      value.page !== page ||
      value.pageSize !== 20 ||
      typeof value.total !== "number" ||
      !Number.isSafeInteger(value.total) ||
      value.total < 0 ||
      !Array.isArray(value.items) ||
      value.items.length > 20 ||
      value.items.length !==
        Math.min(20, Math.max(0, value.total - (page - 1) * 20))
    )
      invalid();
    const seen = new Set<number>();
    const items = value.items.map((item) => field(item, entityType));
    for (const item of items) {
      if (
        seen.has(item.fieldDefinitionId) ||
        (status !== undefined && item.status !== status)
      )
        invalid();
      seen.add(item.fieldDefinitionId);
    }
    return {
      page,
      pageSize: 20,
      total: value.total,
      items,
    } satisfies FieldPage;
  });
}
export function readFieldGroups(
  request: FieldRequest,
  user: User,
  entityType: EntityType,
  signal: AbortSignal,
) {
  assertFieldEntity(entityType);
  return verified(
    request,
    user,
    "system:field-group:list",
    signal,
    async () => {
      const value = await request<unknown>(
        `/admin/custom-field-groups?entityType=${entityType}`,
        { signal, cache: "no-store" },
      );
      if (!Array.isArray(value)) invalid();
      const items = value.map((item) => group(item, entityType));
      const seen = new Set<string>();
      for (const item of items) {
        if (seen.has(item.groupKey)) invalid();
        seen.add(item.groupKey);
      }
      return items;
    },
  );
}
export function readFieldDetail(
  request: FieldRequest,
  user: User,
  entityType: EntityType,
  fieldId: number,
  signal: AbortSignal,
) {
  assertFieldEntity(entityType);
  if (!id(fieldId)) invalid();
  return verified(request, user, "system:field:list", signal, async () => {
    const value = field(
      await request<unknown>(`/admin/custom-fields/${fieldId}`, {
        signal,
        cache: "no-store",
      }),
      entityType,
    );
    if (value.fieldDefinitionId !== fieldId) invalid();
    return value;
  });
}
export function readFieldGroupDetail(
  request: FieldRequest,
  user: User,
  entityType: EntityType,
  key: string,
  signal: AbortSignal,
) {
  assertFieldEntity(entityType);
  if (!/^[a-z][a-z0-9_-]{0,99}$/.test(key)) invalid();
  return verified(
    request,
    user,
    "system:field-group:list",
    signal,
    async () => {
      const value = group(
        await request<unknown>(groupPath(entityType, key), {
          signal,
          cache: "no-store",
        }),
        entityType,
      );
      if (value.groupKey !== key) invalid();
      return value;
    },
  );
}
