import type { OutboxEvent, EventPage } from "@/features/events/event-api";
import type { EventOperator } from "@/features/events/event-model";
export const operator: EventOperator = {
  userId: 1,
  account: "admin",
  nickname: "系统管理员",
  roles: [{ roleKey: "system_admin", roleName: "系统管理员" }],
  permissionKeys: [
    "management:portal:enter",
    "system:event:list",
    "system:event:retry",
  ],
  merchant: null,
  menuTree: [],
  avatarUrl: null,
};
export const item: OutboxEvent = {
  eventId: "7a705486-7ee5-45c0-a3e6-afc0d6e29540",
  eventType: "resort.changed.v1",
  aggregateType: "resort",
  aggregateId: "42",
  status: "failed",
  attempts: 8,
  maxAttempts: 8,
  createdAt: "2026-11-01T00:00:00.123Z",
  occurredAt: "2026-11-01T00:00:00.123Z",
  availableAt: "2026-11-01T00:00:00.123Z",
  lockedAt: null,
  publishedAt: null,
};
export function eventPage(
  items: OutboxEvent[] = [item],
  page = 1,
  total = items.length,
): EventPage {
  return { items, page, pageSize: 100, total, hasNext: page * 100 < total };
}
export const receipt: OutboxEvent = {
  ...item,
  status: "pending",
  maxAttempts: 16,
};
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
