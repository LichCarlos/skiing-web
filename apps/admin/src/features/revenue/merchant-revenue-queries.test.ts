import { describe, it, expect, vi } from "vitest";
import { RequestLane } from "@/platform/api/request-lane";
import type { apiRequest } from "@/platform/api";
import { readMerchantRevenue } from "@/features/revenue/merchant-revenue-queries";
import {
  operator,
  filters,
  records,
  summary,
  deferred,
} from "@/features/revenue/merchant-revenue-fixtures.test-helper";
function setup() {
  const mock = vi.fn(async (path: string): Promise<unknown> =>
    path === "/auth/me"
      ? operator
      : path.startsWith("/merchant/revenue/summary?")
        ? summary
        : records,
  );
  return { mock, request: mock as typeof apiRequest };
}
const signal = () => new AbortController().signal;
describe("merchant revenue private query lifecycle", () => {
  it("checks identity before and after both no-store responses", async () => {
    const s = setup(),
      abort = signal();
    expect(
      await readMerchantRevenue(s.request, operator, filters, 1, 20, abort),
    ).toEqual({ status: "ready", records, summary });
    expect(s.mock.mock.calls.map(([path]) => path.split("?")[0])).toEqual([
      "/auth/me",
      "/merchant/revenue",
      "/merchant/revenue/summary",
      "/auth/me",
    ]);
    for (let index = 0; index < 4; index++)
      expect(s.mock).toHaveBeenNthCalledWith(index + 1, expect.any(String), {
        signal: abort,
        cache: "no-store",
      });
    for (const [path] of s.mock.mock.calls) {
      expect(path).not.toMatch(/userId|merchantId|scope|role/);
    }
  });
  it("validates drafts before any identity or data request", async () => {
    const s = setup();
    await expect(
      readMerchantRevenue(
        s.request,
        operator,
        { ...filters, fromDate: "" },
        1,
        20,
        signal(),
      ),
    ).rejects.toThrow();
    expect(s.mock).not.toHaveBeenCalled();
  });
  it("does not request revenue after initial merchant association changes", async () => {
    const s = setup();
    s.mock.mockResolvedValueOnce({ ...operator, merchant: null });
    await expect(
      readMerchantRevenue(s.request, operator, filters, 1, 20, signal()),
    ).rejects.toThrow("商家");
    expect(s.mock).toHaveBeenCalledTimes(1);
  });
  it("rejects a same-account merchant change observed after both responses", async () => {
    const s = setup();
    s.mock
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce(records)
      .mockResolvedValueOnce(summary)
      .mockResolvedValueOnce({ ...operator, merchant: { merchantId: 8 } });
    await expect(
      readMerchantRevenue(s.request, operator, filters, 1, 20, signal()),
    ).rejects.toThrow("变化");
  });
  it.each(["/merchant/revenue?", "/merchant/revenue/summary?"])(
    "never publishes a partial result when %s fails",
    async (failure) => {
      const s = setup(),
        publish = vi.fn();
      s.mock.mockImplementation(async (path: string) => {
        if (path.startsWith(failure)) throw new Error("failed endpoint");
        return path === "/auth/me"
          ? operator
          : path.includes("/summary?")
            ? summary
            : records;
      });
      const lane = new RequestLane(),
        fail = vi.fn();
      expect(
        await lane.run(
          (abort) =>
            readMerchantRevenue(s.request, operator, filters, 1, 20, abort),
          publish,
          fail,
          vi.fn(),
        ),
      ).toBe(false);
      expect(publish).not.toHaveBeenCalled();
      expect(fail).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    { ...summary, resortId: null },
    { ...summary, fromDate: "2026-10-02" },
    { ...summary, toDate: "2026-10-29" },
  ])("refuses mismatched periods or resort metadata %j", async (current) => {
    const s = setup();
    s.mock
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce(records)
      .mockResolvedValueOnce(current);
    await expect(
      readMerchantRevenue(s.request, operator, filters, 1, 20, signal()),
    ).rejects.toThrow("不匹配");
  });
  it("refuses a different response page", async () => {
    const s = setup();
    s.mock
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce({ ...records, page: 2 })
      .mockResolvedValueOnce(summary);
    await expect(
      readMerchantRevenue(s.request, operator, filters, 1, 20, signal()),
    ).rejects.toThrow("不匹配");
  });
  it("accepts an all-owned-resorts projection without inserting merchantId", async () => {
    const s = setup();
    s.mock
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce(records)
      .mockResolvedValueOnce({ ...summary, resortId: null });
    await expect(
      readMerchantRevenue(
        s.request,
        operator,
        { ...filters, resortId: "" },
        1,
        20,
        signal(),
      ),
    ).resolves.toMatchObject({ status: "ready" });
    expect(s.mock.mock.calls[1]![0]).not.toContain("resortId");
  });
  it("does not read data after cancellation during auth verification", async () => {
    const s = setup(),
      controller = new AbortController();
    s.mock.mockImplementationOnce(async () => {
      controller.abort();
      return operator;
    });
    await expect(
      readMerchantRevenue(
        s.request,
        operator,
        filters,
        1,
        20,
        controller.signal,
      ),
    ).rejects.toThrow();
    expect(s.mock).toHaveBeenCalledTimes(1);
  });
  it.each(["resolve", "reject"] as const)(
    "suppresses a late %s from the replaced query",
    async (mode) => {
      const s = setup(),
        delayed = deferred<typeof summary>(),
        lane = new RequestLane(),
        publish = vi.fn(),
        fail = vi.fn(),
        settle = vi.fn();
      s.mock
        .mockImplementationOnce(async () => operator)
        .mockImplementationOnce(async () => records)
        .mockImplementationOnce(() => delayed.promise);
      const old = lane.run(
        (abort) =>
          readMerchantRevenue(s.request, operator, filters, 1, 20, abort),
        publish,
        fail,
        settle,
      );
      await vi.waitFor(() => expect(s.mock).toHaveBeenCalledTimes(3));
      const next = await lane.run(
        (abort) =>
          readMerchantRevenue(s.request, operator, filters, 1, 20, abort),
        publish,
        fail,
        settle,
      );
      if (mode === "resolve") delayed.resolve(summary);
      else delayed.reject(new Error("late private error"));
      expect(await old).toBe(false);
      expect(next).toBe(true);
      expect(publish).toHaveBeenCalledTimes(1);
      expect(fail).not.toHaveBeenCalled();
      expect(settle).toHaveBeenCalledTimes(1);
    },
  );
  it("cancels both transports with the same signal without publishing either value", async () => {
    const s = setup(),
      delayed = deferred<typeof summary>(),
      controller = new AbortController();
    s.mock
      .mockImplementationOnce(async () => operator)
      .mockImplementationOnce(async () => records)
      .mockImplementationOnce(() => delayed.promise);
    const task = readMerchantRevenue(
      s.request,
      operator,
      filters,
      1,
      20,
      controller.signal,
    );
    await vi.waitFor(() => expect(s.mock).toHaveBeenCalledTimes(3));
    controller.abort();
    delayed.resolve(summary);
    await expect(task).rejects.toMatchObject({ name: "AbortError" });
    expect(s.mock).toHaveBeenCalledTimes(3);
  });
});
