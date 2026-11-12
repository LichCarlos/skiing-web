import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import { apiRequest } from "@/platform/api";
import {
  eventError,
  eventQuery,
  getEvents,
  retryEvent,
  retryEventBody,
  type EventPage,
} from "@/features/events/event-api";
import { EventResults, type EventState } from "@/features/events/event-results";
import { canAccessManagementRoute } from "@/platform/auth/access";

vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
afterEach(() => vi.clearAllMocks());
const data: EventPage = {
  page: 1,
  pageSize: 20,
  total: 2,
  hasNext: false,
  items: ["failed", "published"].map((status, index) => ({
    eventId: `7a705486-7ee5-45c0-a3e6-afc0d6e2954${index}`,
    eventType: "<script>event</script>",
    aggregateType: "resort",
    aggregateId: "42",
    status: status as "failed" | "published",
    attempts: 8,
    maxAttempts: 16,
    availableAt: "2026-10-30T00:00:00Z",
    lockedAt: null,
    occurredAt: "2026-10-30T00:00:00Z",
    publishedAt: status === "published" ? "2026-10-30T00:00:00Z" : null,
    createdAt: "2026-10-30T00:00:00Z",
  })),
};
const render = (state: EventState, canRetry = true, busy = false) =>
  renderToStaticMarkup(
    createElement(EventResults, {
      state,
      canRetry,
      busy,
      onReload: () => undefined,
      onPage: () => undefined,
      onRetry: () => undefined,
    }),
  );

describe("Outbox management UI boundaries", () => {
  it("encodes exact metadata filters, paging and inclusive UTC times", () => {
    expect(
      Object.fromEntries(
        new URLSearchParams(
          eventQuery(
            {
              status: "failed",
              eventType: " type &? ",
              aggregateType: "resort",
              aggregateId: "42",
              fromTime: "2026-10-30T08:00:00+08:00",
              toTime: "2026-10-30T00:00:00Z",
            },
            2,
            50,
          ),
        ),
      ),
    ).toEqual({
      page: "2",
      pageSize: "50",
      status: "failed",
      eventType: "type &?",
      aggregateType: "resort",
      aggregateId: "42",
      fromTime: "2026-10-30T00:00:00.000Z",
      toTime: "2026-10-30T00:00:00.000Z",
    });
    expect(eventQuery({ eventType: " " })).toBe("page=1&pageSize=20");
  });
  it.each([
    { eventType: "x".repeat(201) },
    { aggregateId: "x".repeat(101) },
    { fromTime: "invalid" },
    { fromTime: "2026-10-31T00:00:00Z", toTime: "2026-10-30T00:00:00Z" },
  ])("rejects invalid filters %j", (filters) => {
    expect(() => eventQuery(filters)).toThrow();
  });
  it("rejects overflowing page offset and invalid reasons", () => {
    expect(() => eventQuery({}, Number.MAX_SAFE_INTEGER, 100)).toThrow();
    for (const reason of ["", "  ", "x".repeat(501)])
      expect(() => retryEventBody(reason)).toThrow();
    expect(retryEventBody(" reason ")).toEqual({ reason: "reason" });
  });
  it("passes abort signals, uses the command route and sends only a trimmed reason", async () => {
    const controller = new AbortController();
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(data)
      .mockResolvedValueOnce(data.items[0]);
    await getEvents("page=1&pageSize=20", controller.signal);
    expect(apiRequest).toHaveBeenNthCalledWith(
      1,
      "/admin/events?page=1&pageSize=20",
      { signal: controller.signal, cache: "no-store" },
    );
    await retryEvent(data.items[0]!.eventId, " reason ", controller.signal);
    expect(apiRequest).toHaveBeenNthCalledWith(
      2,
      `/admin/events/${data.items[0]!.eventId}/retry`,
      { method: "POST", body: { reason: "reason" }, signal: controller.signal },
    );
  });
  it("renders escaped metadata and offers one action only for failed rows with permission", () => {
    const html = render({ status: "ready", data });
    expect(html).toContain("&lt;script&gt;event&lt;/script&gt;");
    expect(html).not.toContain("<script>event</script>");
    expect(html.match(/重试事件/g)).toHaveLength(1);
    expect(render({ status: "ready", data }, false)).not.toContain("重试事件");
    expect(render({ status: "ready", data }, true, true)).toMatch(/disabled/);
    for (const secret of ["payload", "lastError", "lockToken"])
      expect(html).not.toContain(secret);
  });
  it("renders loading, empty and failure states without displaying old rows", () => {
    expect(render({ status: "loading" })).toContain("正在加载消息任务");
    expect(
      render({ status: "ready", data: { ...data, items: [], total: 0 } }),
    ).toContain("没有符合条件的消息任务");
    const failed = render({
      status: "error",
      title: "无权访问",
      traceId: "trace-events",
    });
    expect(failed).toContain("trace-events");
    expect(failed).not.toContain("7a705486");
  });
  it.each([401, 403, 404, 409, 500])(
    "maps HTTP %i without echoing backend error text",
    (status) => {
      const error = eventError(
        new ApiError("sensitive-provider-error", {
          status,
          code: status,
          traceId: "trace-events",
        }),
      );
      expect(error.traceId).toBe("trace-events");
      expect(error.title).not.toContain("sensitive");
      if (status === 409) expect(error.title).toContain("刷新");
    },
  );
  it("requires portal, list grant and technical admin for navigation and direct route", () => {
    const user = {
      roles: [{ roleKey: "system_admin", roleName: "管理员" }],
      permissionKeys: ["management:portal:enter", "system:event:list"],
    };
    expect(canAccessManagementRoute(user, "/admin/system/events")).toBe(true);
    expect(
      canAccessManagementRoute(
        { ...user, roles: [{ roleKey: "custom", roleName: "运营" }] },
        "/admin/system/events",
      ),
    ).toBe(false);
    for (const grant of user.permissionKeys)
      expect(
        canAccessManagementRoute(
          { ...user, permissionKeys: [grant] },
          "/admin/system/events",
        ),
      ).toBe(false);
    expect(canAccessManagementRoute(user, "/admin/system/events/7")).toBe(
      false,
    );
  });
});
