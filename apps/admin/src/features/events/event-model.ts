import type { components } from "@common/api-contracts/openapi";
import type { OutboxEvent } from "@/features/events/event-api";
import { parseCurrentUser } from "@/platform/auth/session-model";

export type EventOperator = components["schemas"]["CurrentUserVO"];
export class EventInputError extends Error {}
export class EventConflictError extends EventInputError {}
export type EventLocator = Pick<
  OutboxEvent,
  "eventId" | "eventType" | "aggregateType" | "aggregateId" | "createdAt"
>;
export type EventMutation = {
  target: EventLocator;
  attempts: number;
  maxAttempts: number;
};
export function eventLocator(item: EventLocator): EventLocator {
  return {
    eventId: item.eventId,
    eventType: item.eventType,
    aggregateType: item.aggregateType,
    aggregateId: item.aggregateId,
    createdAt: item.createdAt,
  };
}
export function eventMutation(item: OutboxEvent): EventMutation {
  return {
    target: eventLocator(item),
    attempts: item.attempts,
    maxAttempts: item.maxAttempts,
  };
}
export function canManageEvents(user: EventOperator, retry = false) {
  try {
    user = parseCurrentUser(user);
  } catch {
    return false;
  }
  return (
    Number.isInteger(user.userId) &&
    user.userId > 0 &&
    user.userId <= 2147483647 &&
    user.roles.some((role) => role.roleKey === "system_admin") &&
    [
      "management:portal:enter",
      "system:event:list",
      ...(retry ? ["system:event:retry"] : []),
    ].every((key) => user.permissionKeys.includes(key))
  );
}
export function eventOperatorKey(user: EventOperator) {
  return JSON.stringify([
    user.userId,
    user.account,
    [...new Set(user.roles.map((role) => role.roleKey))].sort(),
    [...new Set(user.permissionKeys)].sort(),
  ]);
}
export function verifyEventOperator(
  current: EventOperator,
  expected: EventOperator,
  retry = false,
) {
  try {
    current = parseCurrentUser(current);
    expected = parseCurrentUser(expected);
  } catch {
    throw new EventInputError("身份或消息任务权限已变化，请重新读取身份后继续");
  }
  if (
    !canManageEvents(current, retry) ||
    eventOperatorKey(current) !== eventOperatorKey(expected)
  )
    throw new EventInputError("身份或消息任务权限已变化，请重新读取身份后继续");
}
export function validateEventLocator(target: EventLocator) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      target.eventId,
    ) ||
    !Number.isFinite(new Date(target.createdAt).getTime()) ||
    new Date(target.createdAt).getTime() >= 8640000000000000 ||
    [target.eventType, target.aggregateType, target.aggregateId].some(
      (value) => typeof value !== "string",
    )
  )
    throw new EventInputError("事件编号或创建时间无效");
}
export function eventFingerprint(item: OutboxEvent) {
  return JSON.stringify([
    item.eventId,
    item.eventType,
    item.aggregateType,
    item.aggregateId,
    item.createdAt,
    item.occurredAt,
    item.status,
    item.attempts,
    item.maxAttempts,
    item.availableAt,
    item.lockedAt,
    item.publishedAt,
  ]);
}
export function assertRetryableEvent(item: OutboxEvent) {
  validateEventLocator(item);
  if (
    item.status !== "failed" ||
    !Number.isInteger(item.attempts) ||
    item.attempts < 0 ||
    !Number.isInteger(item.maxAttempts) ||
    item.maxAttempts < 1 ||
    item.maxAttempts > 2147483639 ||
    item.attempts > 2147483647
  )
    throw new EventConflictError("事件状态或重试预算已变化，请刷新后重新选择");
}
