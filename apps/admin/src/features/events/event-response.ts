import type { EventPage, OutboxEvent } from "@/features/events/event-api";
import { EventInputError } from "@/features/events/event-model";

function invalid(): never {
  throw new EventInputError("事件响应不匹配或不完整，请重新读取并核对");
}
function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number): string {
  if (typeof value !== "string" || [...value].length > max) invalid();
  return value;
}
function integer(value: unknown, min = 0): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > 2147483647
  )
    invalid();
  return value;
}
function time(value: unknown): string {
  if (
    typeof value !== "string" ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    invalid();
  return value;
}
export function parseOutboxEvent(value: unknown): OutboxEvent {
  const item = row(value);
  if (
    typeof item.eventId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      item.eventId,
    )
  )
    invalid();
  if (
    typeof item.status !== "string" ||
    !["pending", "processing", "published", "failed"].includes(item.status)
  )
    invalid();
  return {
    eventId: item.eventId,
    eventType: text(item.eventType, 200),
    aggregateType: text(item.aggregateType, 100),
    aggregateId: text(item.aggregateId, 100),
    status: item.status as OutboxEvent["status"],
    attempts: integer(item.attempts),
    maxAttempts: integer(item.maxAttempts, 1),
    availableAt: time(item.availableAt),
    lockedAt: item.lockedAt === null ? null : time(item.lockedAt),
    occurredAt: time(item.occurredAt),
    publishedAt: item.publishedAt === null ? null : time(item.publishedAt),
    createdAt: time(item.createdAt),
  };
}
export function parseEventPage(
  value: unknown,
  page: number,
  pageSize: number,
): EventPage {
  const data = row(value),
    total = data.total;
  if (
    data.page !== page ||
    data.pageSize !== pageSize ||
    typeof total !== "number" ||
    !Number.isSafeInteger(total) ||
    total < 0 ||
    !Array.isArray(data.items) ||
    data.items.length !==
      Math.min(pageSize, Math.max(0, total - (page - 1) * pageSize)) ||
    data.hasNext !== page * pageSize < total
  )
    invalid();
  const items = data.items.map(parseOutboxEvent);
  if (new Set(items.map((item) => item.eventId)).size !== items.length)
    invalid();
  return { items, page, pageSize, total, hasNext: data.hasNext as boolean };
}
