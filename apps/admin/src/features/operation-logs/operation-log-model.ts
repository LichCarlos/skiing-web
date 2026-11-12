import type {
  OperationLog,
  OperationLogPage,
} from "@/features/operation-logs/operation-log-api";
import {
  parseCurrentUser,
  type CurrentUser,
} from "@/platform/auth/session-model";

export class OperationLogIdentityError extends Error {}
export class OperationLogResponseError extends Error {}
export function operationLogOperator(value: unknown): CurrentUser {
  const user = parseCurrentUser(value);
  if (
    !user.roles.some((role) => role.roleKey === "system_admin") ||
    !["management:portal:enter", "system:operation-log:list"].every((key) =>
      user.permissionKeys.includes(key),
    )
  )
    throw new OperationLogIdentityError("操作日志读取权限已变化");
  return user;
}
export function operationLogOperatorKey(user: CurrentUser) {
  return JSON.stringify([
    user.userId,
    user.account,
    [...new Set(user.roles.map((role) => role.roleKey))].sort(),
    [...new Set(user.permissionKeys)].sort(),
  ]);
}
export function verifyOperationLogOperator(value: unknown, user: CurrentUser) {
  if (
    operationLogOperatorKey(operationLogOperator(value)) !==
    operationLogOperatorKey(user)
  )
    throw new OperationLogIdentityError("操作日志读取身份已变化");
}
function invalid(): never {
  throw new OperationLogResponseError("操作日志响应异常");
}
function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string") invalid();
  return value;
}
function log(value: unknown): OperationLog {
  const item = row(value);
  const operationLogId = text(item.operationLogId);
  if (
    !/^[1-9]\d{0,18}$/.test(operationLogId) ||
    BigInt(operationLogId) > 9223372036854775807n
  )
    invalid();
  const actorUserId = item.actorUserId;
  if (
    actorUserId !== null &&
    (typeof actorUserId !== "number" ||
      !Number.isInteger(actorUserId) ||
      actorUserId < 1 ||
      actorUserId > 2147483647)
  )
    invalid();
  if (item.result !== "success" && item.result !== "failure") invalid();
  const createdAt = text(item.createdAt);
  if (
    !Number.isFinite(Date.parse(createdAt)) ||
    new Date(createdAt).toISOString() !== createdAt
  )
    invalid();
  return {
    operationLogId,
    actorUserId,
    actorAccountSnapshot: text(item.actorAccountSnapshot),
    actionKey: text(item.actionKey),
    resourceKey: text(item.resourceKey),
    targetType: text(item.targetType),
    targetId: text(item.targetId),
    result: item.result,
    traceId: text(item.traceId),
    createdAt,
  };
}
/** Construct the approved projection; never keep arbitrary audit payloads in state. */
export function parseOperationLogPage(
  value: unknown,
  expected: { page: number; pageSize: number },
): OperationLogPage {
  const item = row(value);
  const total = item.total;
  const skip = (expected.page - 1) * expected.pageSize;
  if (
    !Number.isSafeInteger(expected.page) ||
    expected.page < 1 ||
    !Number.isInteger(expected.pageSize) ||
    expected.pageSize < 1 ||
    expected.pageSize > 100 ||
    skip > 2147483647 ||
    item.page !== expected.page ||
    item.pageSize !== expected.pageSize ||
    typeof total !== "number" ||
    !Number.isSafeInteger(total) ||
    total < 0 ||
    item.hasNext !== expected.page * expected.pageSize < total ||
    !Array.isArray(item.items) ||
    item.items.length !== Math.min(expected.pageSize, Math.max(0, total - skip))
  )
    invalid();
  const items = item.items.map(log);
  if (new Set(items.map((item) => item.operationLogId)).size !== items.length)
    invalid();
  return { items, total, ...expected, hasNext: item.hasNext as boolean };
}
