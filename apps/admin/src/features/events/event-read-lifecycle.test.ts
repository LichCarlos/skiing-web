import { describe, expect, it, vi } from "vitest";
import {
  readEventPage,
  writeEventRetry,
  type EventRequest,
} from "@/features/events/event-queries";
import {
  item,
  operator,
  receipt,
  eventPage,
  deferred,
} from "@/features/events/event-fixtures.test-helper";
const signal = () => new AbortController().signal;

describe("event read authorization and cancellation", () => {
  it.each([
    { ...operator, userId: 2 },
    { ...operator, account: "different" },
    { ...operator, roles: [{ roleKey: "custom", roleName: "自定义" }] },
    {
      ...operator,
      permissionKeys: operator.permissionKeys.filter(
        (k) => k !== "system:event:list",
      ),
    },
    { ...operator, permissionKeys: [...operator.permissionKeys, "new:grant"] },
    { ...operator, roles: null },
  ])(
    "never publishes data if the final identity changed or was malformed %j",
    async (current) => {
      const mock = vi
        .fn()
        .mockResolvedValueOnce(operator)
        .mockResolvedValueOnce(eventPage())
        .mockResolvedValueOnce(current);
      await expect(
        readEventPage(mock as EventRequest, operator, {}, 1, 100, signal()),
      ).rejects.toThrow("身份");
      expect(mock).toHaveBeenCalledTimes(3);
    },
  );
  it("rejects a locally unauthorized identity before querying the server", async () => {
    const mock = vi.fn();
    await expect(
      readEventPage(
        mock as EventRequest,
        { ...operator, roles: [] },
        {},
        1,
        20,
        signal(),
      ),
    ).rejects.toThrow();
    expect(mock).not.toHaveBeenCalled();
  });
  it("rejects malformed response without starting a final identity request", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce({ ...eventPage(), items: "private" });
    await expect(
      readEventPage(mock as EventRequest, operator, {}, 1, 100, signal()),
    ).rejects.toThrow("响应");
    expect(mock).toHaveBeenCalledTimes(2);
  });
  it.each(["data", "identity"])(
    "cancels a late %s response without returning private metadata",
    async (phase) => {
      const pending = deferred<unknown>(),
        controller = new AbortController();
      const mock = vi.fn().mockResolvedValueOnce(operator);
      if (phase === "data") mock.mockImplementationOnce(() => pending.promise);
      else
        mock
          .mockResolvedValueOnce(eventPage())
          .mockImplementationOnce(() => pending.promise);
      const task = readEventPage(
        mock as EventRequest,
        operator,
        {},
        1,
        100,
        controller.signal,
      );
      await vi.waitFor(() =>
        expect(mock).toHaveBeenCalledTimes(phase === "data" ? 2 : 3),
      );
      controller.abort();
      pending.resolve(phase === "data" ? eventPage() : operator);
      await expect(task).rejects.toMatchObject({ name: "AbortError" });
    },
  );
  it("strips private fields from a validated retry receipt and honors late cancellation", async () => {
    const mock = vi.fn(async (): Promise<unknown> => ({
      ...receipt,
      payload: "private",
      lastError: "private",
      lockToken: "private",
    }));
    expect(
      await writeEventRetry(
        mock as EventRequest,
        item,
        { reason: "reason" },
        signal(),
      ),
    ).toEqual(receipt);
    const controller = new AbortController();
    mock.mockImplementationOnce(async () => {
      controller.abort();
      return receipt;
    });
    await expect(
      writeEventRetry(
        mock as EventRequest,
        item,
        { reason: "reason" },
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
