import type { components } from "@common/api-contracts/openapi";
import { ApiError } from "@common/api-contracts/client";
import { apiRequest } from "@/platform/api";
import { EventInputError } from "@/features/events/event-model";

export type OutboxEvent = components["schemas"]["OutboxEventVO"];
export type EventPage = components["schemas"]["OutboxEventPageVO"];
export type EventFilters = {
  status?: OutboxEvent["status"];
  eventType?: string;
  aggregateType?: string;
  aggregateId?: string;
  fromTime?: string;
  toTime?: string;
};
export function eventQuery(filters: EventFilters, page = 1, pageSize = 20) {
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100 ||
    (page - 1) * pageSize > 2147483647
  )
    throw new EventInputError("页码无效");
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  for (const [key, max] of [
    ["eventType", 200],
    ["aggregateType", 100],
    ["aggregateId", 100],
  ] as const) {
    const value = filters[key]?.trim();
    if (value && [...value].length > max)
      throw new EventInputError("筛选内容过长");
    if (value) query.set(key, value);
  }
  if (filters.status) {
    if (
      !["pending", "processing", "published", "failed"].includes(filters.status)
    )
      throw new EventInputError("事件状态无效");
    query.set("status", filters.status);
  }
  let from: Date | undefined;
  let to: Date | undefined;
  for (const key of ["fromTime", "toTime"] as const) {
    const value = filters[key];
    if (!value) continue;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime()))
      throw new EventInputError("请选择有效时间");
    query.set(key, date.toISOString());
    if (key === "fromTime") from = date;
    else to = date;
  }
  if (from && to && from > to)
    throw new EventInputError("开始时间不能晚于结束时间");
  return query.toString();
}
export function retryEventBody(
  reason: string,
): components["schemas"]["RetryOutboxEventDto"] {
  const value = reason.trim();
  if (!value || [...value].length > 500)
    throw new EventInputError("重试原因须为 1–500 字");
  return { reason: value };
}
export function getEvents(query: string, signal?: AbortSignal) {
  return apiRequest<EventPage>(`/admin/events?${query}`, {
    signal,
    cache: "no-store",
  });
}
export function retryEvent(
  eventId: string,
  reason: string,
  signal?: AbortSignal,
) {
  return apiRequest<OutboxEvent>(
    `/admin/events/${encodeURIComponent(eventId)}/retry`,
    { method: "POST", body: retryEventBody(reason), signal },
  );
}
export function eventError(error: unknown) {
  if (error instanceof ApiError)
    return {
      title:
        error.status === 409
          ? "事件状态已变化或重试预算已满，请刷新后确认"
          : error.status === 401
            ? "登录状态已失效"
            : error.status === 403
              ? "当前账号无权操作消息任务"
              : error.status === 404
                ? "事件已不存在，请刷新列表"
                : "消息任务暂时不可用",
      traceId: error.traceId,
    };
  return {
    title:
      error instanceof EventInputError ? error.message : "消息任务暂时不可用",
    traceId: null,
  };
}
export function eventMessage(error: unknown) {
  const detail = eventError(error);
  return detail.traceId
    ? `${detail.title}（traceId: ${detail.traceId}）`
    : detail.title;
}
