import { describe, it, expect, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import {
  eventPage,
  operator,
  item,
  receipt,
} from "@/features/events/event-fixtures.test-helper";
import {
  eventMutation,
  EventConflictError,
} from "@/features/events/event-model";
import {
  readEventPage,
  readEventTarget,
  prepareEventRetry,
  writeEventRetry,
  reviewEventRetries,
  type EventRequest,
} from "@/features/events/event-queries";
function setup() {
  const mock = vi.fn(async (path: string): Promise<unknown> =>
    path === "/auth/me" ? operator : eventPage(),
  );
  return { mock, request: mock as EventRequest };
}
const signal = () => new AbortController().signal;
describe("authorized event lookup and retry preparation", () => {
  it("verifies identity before and after private no-store list queries", async () => {
    const s = setup(),
      abort = signal();
    await readEventPage(
      s.request,
      operator,
      { status: "failed" },
      1,
      100,
      abort,
    );
    expect(s.mock.mock.calls[0]?.[0]).toBe("/auth/me");
    expect(s.mock.mock.calls.map(([path]) => path)).toEqual([
      "/auth/me",
      "/admin/events?page=1&pageSize=100&status=failed",
      "/auth/me",
    ]);
    for (const call of vi.mocked(s.request).mock.calls)
      expect(call[1]).toMatchObject({ cache: "no-store", signal: abort });
  });
  it.each(["management:portal:enter", "system:event:list"])(
    "does not read events after %s is revoked",
    async (grant) => {
      const s = setup();
      s.mock.mockResolvedValueOnce({
        ...operator,
        permissionKeys: operator.permissionKeys.filter((key) => key !== grant),
      });
      await expect(
        readEventTarget(s.request, operator, item, signal()),
      ).rejects.toThrow("身份");
      expect(s.mock).toHaveBeenCalledTimes(1);
    },
  );
  it("uses immutable filters and a millisecond window, not an unapproved detail or UUID-filter API", async () => {
    const s = setup();
    expect(await readEventTarget(s.request, operator, item, signal())).toEqual(
      item,
    );
    const path = s.mock.mock.calls[1]![0];
    expect(path.split("?")[0]).toBe("/admin/events");
    const params = Object.fromEntries(new URLSearchParams(path.split("?")[1]));
    expect(params).toEqual({
      page: "1",
      pageSize: "100",
      eventType: item.eventType,
      aggregateType: item.aggregateType,
      aggregateId: item.aggregateId,
      fromTime: "2026-11-01T00:00:00.123Z",
      toTime: "2026-11-01T00:00:00.124Z",
    });
  });
  it("continues across pages and verifies the exact ID", async () => {
    const s = setup();
    const first = Array.from({ length: 100 }, (_, index) => ({
      ...item,
      eventId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    }));
    s.mock
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce(eventPage(first, 1, 101))
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce(eventPage([item], 2, 101));
    expect(await readEventTarget(s.request, operator, item, signal())).toEqual(
      item,
    );
    expect(s.mock.mock.calls[4]![0]).toContain("page=2");
    expect(s.mock).toHaveBeenCalledTimes(6);
  });
  it.each([
    eventPage([]),
    eventPage([{ ...item, eventId: "00000000-0000-4000-8000-000000000000" }]),
    { ...eventPage(), hasNext: true },
    { ...eventPage(), page: 2 },
    { ...eventPage(), items: [], total: 1 },
    eventPage([item, item]),
    eventPage([{ ...item, aggregateId: "different" }]),
  ])(
    "refuses incomplete, missing, duplicate or changed lookup %j",
    async (page) => {
      const s = setup();
      s.mock.mockResolvedValueOnce(operator).mockResolvedValueOnce(page);
      await expect(
        readEventTarget(s.request, operator, item, signal()),
      ).rejects.toThrow();
      expect(
        s.mock.mock.calls.every(([path]) => !path.endsWith("/retry")),
      ).toBe(true);
    },
  );
  it("refuses total changes between pages", async () => {
    const s = setup(),
      first = Array.from({ length: 100 }, (_, index) => ({
        ...item,
        eventId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      }));
    s.mock
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce(eventPage(first, 1, 101))
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce(eventPage([item], 2, 102));
    await expect(
      readEventTarget(s.request, operator, item, signal()),
    ).rejects.toThrow("不完整");
  });
  it("does not issue a lookup for an invalid original ID", async () => {
    const s = setup();
    await expect(
      readEventTarget(
        s.request,
        operator,
        { ...item, eventId: "../retry" },
        signal(),
      ),
    ).rejects.toThrow();
    expect(s.mock).not.toHaveBeenCalled();
  });
  it("does not continue to private reads after cancellation", async () => {
    const s = setup(),
      controller = new AbortController();
    s.mock.mockImplementationOnce(async () => {
      controller.abort();
      return operator;
    });
    await expect(
      readEventTarget(s.request, operator, item, controller.signal),
    ).rejects.toThrow();
    expect(s.mock).toHaveBeenCalledTimes(1);
  });
  it.each([
    { ...item, status: "pending" as const },
    { ...item, attempts: 9 },
    { ...item, maxAttempts: 16 },
    { ...item, availableAt: "2026-11-01T00:00:01.123Z" },
  ])("refuses stale event metadata %j", async (current) => {
    const s = setup();
    s.mock
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce(eventPage([current]));
    await expect(
      prepareEventRetry(s.request, operator, item, "原因", signal()),
    ).rejects.toBeInstanceOf(EventConflictError);
  });
  it("prepares a reason-only DTO and validates the retry receipt", async () => {
    const s = setup(),
      abort = signal();
    const body = await prepareEventRetry(
      s.request,
      operator,
      item,
      " 排查后重试 ",
      abort,
    );
    expect(body).toEqual({ reason: "排查后重试" });
    s.mock.mockResolvedValueOnce(receipt);
    await expect(
      writeEventRetry(s.request, item, body, abort),
    ).resolves.toEqual(receipt);
    expect(s.mock).toHaveBeenLastCalledWith(
      `/admin/events/${item.eventId}/retry`,
      { method: "POST", body, signal: abort },
    );
  });
  it.each([
    { ...receipt, eventId: "wrong" },
    { ...receipt, maxAttempts: 24 },
    { ...receipt, attempts: 9 },
    { ...receipt, status: "failed" as const },
    { ...receipt, lockedAt: receipt.createdAt },
  ])("does not accept a mismatched receipt %j", async (saved) => {
    const s = setup();
    s.mock.mockResolvedValueOnce(saved);
    await expect(
      writeEventRetry(s.request, item, { reason: "reason" }, signal()),
    ).rejects.toThrow("不匹配");
  });
  it("propagates permission failures without manufacturing a missing target", async () => {
    const s = setup();
    s.mock
      .mockResolvedValueOnce(operator)
      .mockRejectedValueOnce(
        new ApiError("secret", { status: 403, code: 403, traceId: "trace" }),
      );
    await expect(
      readEventTarget(s.request, operator, item, signal()),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("reviews current counters without inferring a successful retry or replaying it", async () => {
    const s = setup();
    s.mock
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce(eventPage([receipt]));
    const summaries = await reviewEventRetries(
      s.request,
      operator,
      [eventMutation(item)],
      signal(),
    );
    expect(summaries[0]).toContain("8 / 16");
    expect(summaries[0]).toContain("提交前 8 / 8");
    expect(summaries[0]).toContain("不自动判定");
    expect(s.mock.mock.calls.every(([path]) => !path.endsWith("/retry"))).toBe(
      true,
    );
  });
});
