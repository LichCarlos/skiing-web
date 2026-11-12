import type { ApiRequestOptions } from "@common/api-contracts/client";
import {
  eventQuery,
  retryEventBody,
  type EventFilters,
  type OutboxEvent,
} from "@/features/events/event-api";
import {
  EventInputError,
  EventConflictError,
  assertRetryableEvent,
  eventFingerprint,
  validateEventLocator,
  verifyEventOperator,
  type EventOperator,
  type EventLocator,
  type EventMutation,
} from "@/features/events/event-model";
import {
  parseEventPage,
  parseOutboxEvent,
} from "@/features/events/event-response";
export type EventRequest = <T>(
  path: string,
  options?: ApiRequestOptions,
) => Promise<T>;
export async function verifyEventReader(
  request: EventRequest,
  operator: EventOperator,
  signal: AbortSignal,
) {
  verifyEventOperator(operator, operator);
  signal.throwIfAborted();
  const current = await request<EventOperator>("/auth/me", {
    signal,
    cache: "no-store",
  });
  signal.throwIfAborted();
  verifyEventOperator(current, operator);
}
export async function readEventPage(
  request: EventRequest,
  operator: EventOperator,
  filters: EventFilters,
  page: number,
  pageSize: number,
  signal: AbortSignal,
) {
  const query = eventQuery(filters, page, pageSize);
  await verifyEventReader(request, operator, signal);
  const result = await request<unknown>(`/admin/events?${query}`, {
    signal,
    cache: "no-store",
  });
  signal.throwIfAborted();
  const data = parseEventPage(result, page, pageSize);
  await verifyEventReader(request, operator, signal);
  return data;
}
/** No detail endpoint is approved. Locate the exact ID using immutable metadata and pagination. */
export async function readEventTarget(
  request: EventRequest,
  operator: EventOperator,
  target: EventLocator,
  signal: AbortSignal,
) {
  validateEventLocator(target);
  const instant = new Date(target.createdAt).getTime();
  // PostgreSQL stores microseconds while the VO/JS Date has millisecond precision.
  // A one-millisecond window includes the original instant; ID matching remains authoritative.
  const filters: EventFilters = {
    eventType: target.eventType,
    aggregateType: target.aggregateType,
    aggregateId: target.aggregateId,
    fromTime: new Date(instant).toISOString(),
    toTime: new Date(instant + 1).toISOString(),
  };
  const seen = new Set<string>();
  let expectedTotal: number | undefined;
  for (let page = 1; ; page++) {
    const result = await readEventPage(
      request,
      operator,
      filters,
      page,
      100,
      signal,
    );
    if (
      result.page !== page ||
      result.pageSize !== 100 ||
      !Number.isSafeInteger(result.total) ||
      result.total < 0 ||
      (expectedTotal !== undefined && expectedTotal !== result.total) ||
      result.items.length > 100 ||
      result.hasNext !== page * 100 < result.total ||
      result.items.length !==
        Math.min(100, Math.max(0, result.total - (page - 1) * 100))
    )
      throw new EventInputError("事件目录已变化或不完整，请刷新后核对");
    expectedTotal = result.total;
    for (const item of result.items) {
      if (seen.has(item.eventId))
        throw new EventInputError("事件目录重复，请刷新后核对");
      seen.add(item.eventId);
    }
    const found = result.items.find((item) => item.eventId === target.eventId);
    if (found) {
      if (
        found.eventType !== target.eventType ||
        found.aggregateType !== target.aggregateType ||
        found.aggregateId !== target.aggregateId ||
        found.createdAt !== target.createdAt
      )
        throw new EventInputError("事件身份元数据不匹配，请刷新后核对");
      return found;
    }
    if (!result.hasNext)
      throw new EventInputError(
        "未定位原事件，不能判定重试结果，请刷新并核对完整列表",
      );
  }
}
export async function prepareEventRetry(
  request: EventRequest,
  operator: EventOperator,
  original: OutboxEvent,
  reason: string,
  signal: AbortSignal,
) {
  const body = retryEventBody(reason);
  assertRetryableEvent(original);
  const current = await readEventTarget(request, operator, original, signal);
  if (eventFingerprint(current) !== eventFingerprint(original))
    throw new EventConflictError(
      "事件已变化，请刷新后重新选择，不会自动增加重试次数",
    );
  assertRetryableEvent(current);
  return body;
}
export async function writeEventRetry(
  request: EventRequest,
  original: OutboxEvent,
  body: ReturnType<typeof retryEventBody>,
  signal: AbortSignal,
) {
  assertRetryableEvent(original);
  signal.throwIfAborted();
  const value = await request<unknown>(
    `/admin/events/${encodeURIComponent(original.eventId)}/retry`,
    { method: "POST", body: retryEventBody(body.reason), signal },
  );
  signal.throwIfAborted();
  const saved = parseOutboxEvent(value);
  if (
    saved.eventId !== original.eventId ||
    saved.eventType !== original.eventType ||
    saved.aggregateType !== original.aggregateType ||
    saved.aggregateId !== original.aggregateId ||
    saved.createdAt !== original.createdAt ||
    saved.status !== "pending" ||
    saved.maxAttempts !== original.maxAttempts + 8 ||
    saved.attempts !== original.attempts ||
    saved.lockedAt !== null ||
    saved.publishedAt !== null
  )
    throw new EventInputError("重试响应不匹配，请读取并核对实际结果");
  return saved;
}
export async function reviewEventRetries(
  request: EventRequest,
  operator: EventOperator,
  mutations: readonly EventMutation[],
  signal: AbortSignal,
) {
  const summaries: string[] = [];
  for (const mutation of mutations) {
    const item = await readEventTarget(
      request,
      operator,
      mutation.target,
      signal,
    );
    summaries.push(
      `${item.eventId}：当前 ${item.status}，次数 ${item.attempts} / ${item.maxAttempts}；提交前 ${mutation.attempts} / ${mutation.maxAttempts}。请人工核对，不自动判定重试成功。`,
    );
  }
  signal.throwIfAborted();
  return summaries;
}
