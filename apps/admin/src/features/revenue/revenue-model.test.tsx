import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { components } from "@common/api-contracts/openapi";
import {
  buildRevenueInput,
  formatRevenue,
  loadRevenue,
} from "@/features/revenue/revenue-model";
import { RevenueSummary } from "@/features/revenue/revenue-summary";
import type { apiRequest } from "@/platform/api";

const page: components["schemas"]["RevenuePageVO"] = {
  items: [],
  page: 1,
  pageSize: 20,
  total: 0,
  hasNext: false,
};
const summary: components["schemas"]["RevenueSummaryVO"] = {
  resortId: 1,
  resortName: "Snow",
  fromDate: "2026-10-01",
  toDate: "2026-10-02",
  totalAmount: "0.30",
  daily: [
    { date: "2026-10-01", amount: "0.10" },
    { date: "2026-10-02", amount: "0.20" },
  ],
};
const input = {
  resortId: 1,
  reportDate: "2026-10-01",
  revenueAmount: "9999999999.99",
  note: " note ",
};

describe("revenue form and loading", () => {
  it("keeps decimal input as a string with no floating-point conversion", () => {
    expect(buildRevenueInput(input)).toEqual({ ...input, note: "note" });
    expect(
      buildRevenueInput({ ...input, revenueAmount: "0.10", note: " " }),
    ).toMatchObject({ revenueAmount: "0.10", note: null });
    expect(formatRevenue("9999999999.99")).toBe("¥9,999,999,999.99");
    expect(formatRevenue("0.10")).toBe("¥0.10");
  });
  it.each([
    { resortId: 2147483648 },
    { resortId: 1.1 },
    { reportDate: "2026-02-30" },
    { reportDate: "2026-99-99" },
    { revenueAmount: "1e6" },
    { revenueAmount: "-1" },
    { revenueAmount: "0.001" },
    { revenueAmount: "10000000000" },
    { note: "x".repeat(301) },
  ])("rejects invalid inputs before submission: %j", (patch) => {
    expect(() => buildRevenueInput({ ...input, ...patch })).toThrow();
  });
  it("loads rows and summary using the same filters and cancellation signal", async () => {
    const query = new URLSearchParams({
      resortId: "1",
      fromDate: "2026-10-01",
      toDate: "2026-10-02",
      page: "2",
      pageSize: "20",
    });
    const signal = new AbortController().signal;
    const request = vi
      .fn()
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce(summary);
    expect(
      await loadRevenue(query, signal, request as typeof apiRequest),
    ).toEqual({ status: "ready", records: page, summary });
    expect(request.mock.calls).toEqual([
      [`/merchant/revenue?${query}`, { signal, cache: "no-store" }],
      [`/merchant/revenue/summary?${query}`, { signal, cache: "no-store" }],
    ]);
  });
  it("never publishes a partial result when one endpoint fails", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(page)
      .mockRejectedValueOnce(new Error("summary unavailable"));
    await expect(
      loadRevenue(
        new URLSearchParams(),
        new AbortController().signal,
        request as typeof apiRequest,
      ),
    ).rejects.toThrow("summary unavailable");
  });
  it("ignores a cancelled request even if transport resolves after cancellation", async () => {
    const controller = new AbortController();
    let resolve!: (value: typeof summary) => void;
    const delayed = new Promise<typeof summary>((done) => {
      resolve = done;
    });
    const request = vi
      .fn()
      .mockResolvedValueOnce(page)
      .mockReturnValueOnce(delayed);
    const pending = loadRevenue(
      new URLSearchParams(),
      controller.signal,
      request as typeof apiRequest,
    );
    controller.abort();
    resolve(summary);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
  it("does not issue requests with an already cancelled signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const request = vi.fn();
    await expect(
      loadRevenue(
        new URLSearchParams(),
        controller.signal,
        request as typeof apiRequest,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(request).not.toHaveBeenCalled();
  });
  it("renders daily amounts and the filter period without leaking a previous result into loading/error states", () => {
    const markup = renderToStaticMarkup(
      <RevenueSummary view={{ status: "ready", records: page, summary }} />,
    );
    for (const value of [
      "收益汇总",
      "每日收益",
      "2026-10-01",
      "2026-10-02",
      "¥0.30",
      "¥0.10",
      "¥0.20",
    ])
      expect(markup).toContain(value);
    const loading = renderToStaticMarkup(
      <RevenueSummary view={{ status: "loading" }} />,
    );
    expect(loading).toContain('role="status"');
    expect(loading).not.toContain("¥");
    expect(
      renderToStaticMarkup(
        <RevenueSummary view={{ status: "error", message: "denied" }} />,
      ),
    ).toBe("");
  });
  it("renders an empty interval clearly", () => {
    const markup = renderToStaticMarkup(
      <RevenueSummary
        view={{
          status: "ready",
          records: page,
          summary: { ...summary, totalAmount: "0.00", daily: [] },
        }}
      />,
    );
    expect(markup).toContain("该区间暂无收益记录");
    expect(markup).toContain("¥0.00");
  });
  it("renders relative daily bars and handles an all-zero series", () => {
    const ready = { status: "ready" as const, records: page, summary };
    const markup = renderToStaticMarkup(<RevenueSummary view={ready} />);
    expect(markup).toContain('value="500"');
    expect(markup).toContain('value="1000"');
    const zero = renderToStaticMarkup(
      <RevenueSummary
        view={{
          ...ready,
          summary: {
            ...summary,
            totalAmount: "0.00",
            daily: [{ date: "2026-10-01", amount: "0.00" }],
          },
        }}
      />,
    );
    expect(zero).toContain('value="0"');
    expect(zero).not.toMatch(/NaN|Infinity/);
  });
});
