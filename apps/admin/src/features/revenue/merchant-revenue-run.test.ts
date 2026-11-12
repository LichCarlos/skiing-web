import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import type { apiRequest } from "@/platform/api";
import { createMerchantRevenueRun } from "@/features/revenue/merchant-revenue-run";
import { parseRevenueResult } from "@/features/revenue/revenue-response";
import type { RevenueView } from "@/features/revenue/revenue-model";
import {
  operator,
  filters,
  records,
  summary,
  deferred,
} from "@/features/revenue/merchant-revenue-fixtures.test-helper";
function setup() {
  return vi.fn(async (path: string): Promise<unknown> =>
    path === "/auth/me"
      ? operator
      : path.includes("/summary?")
        ? summary
        : records,
  );
}
describe("merchant revenue run", () => {
  it("clears hidden private data, rejects late completion and permits explicit recovery", async () => {
    const pending = deferred<unknown>(),
      request = setup(),
      views: RevenueView[] = [];
    request.mockImplementationOnce(() => pending.promise);
    const run = createMerchantRevenueRun(
      (view) => views.push(view),
      operator,
      request as typeof apiRequest,
    );
    const read = run.load(filters, 1, 20);
    run.clear();
    pending.resolve(operator);
    expect(await read).toBe(false);
    expect(views.every((view) => view.status === "loading")).toBe(true);
    expect(await run.load(filters, 1, 20)).toBe(true);
    expect(views.at(-1)).toEqual({ status: "ready", records, summary });
    run.clear();
    expect(views.at(-1)).toEqual({ status: "loading" });
  });
  it.each(["resolve", "reject"] as const)(
    "drops an old %s after replacement or dispose",
    async (mode) => {
      const pending = deferred<unknown>(),
        request = setup(),
        views: RevenueView[] = [];
      request.mockImplementationOnce(() => pending.promise);
      const run = createMerchantRevenueRun(
        (view) => views.push(view),
        operator,
        request as typeof apiRequest,
      );
      const old = run.load(filters, 1, 20);
      await run.load(filters, 1, 20);
      if (mode === "resolve") pending.resolve(operator);
      else pending.reject(new Error("private"));
      expect(await old).toBe(false);
      expect(views.filter((view) => view.status === "ready")).toHaveLength(1);
      run.dispose();
      const count = views.length;
      run.clear();
      expect(await run.load(filters, 1, 20)).toBe(false);
      expect(views).toHaveLength(count);
    },
  );
  it.each([401, 403, 404, 500])(
    "sanitizes read status %s and clears an earlier ready view",
    async (status) => {
      const request = setup(),
        views: RevenueView[] = [],
        run = createMerchantRevenueRun(
          (view) => views.push(view),
          operator,
          request as typeof apiRequest,
        );
      await run.load(filters, 1, 20);
      request.mockRejectedValueOnce(
        new ApiError("private credential", {
          status,
          code: status,
          traceId: "trace-id",
        }),
      );
      expect(await run.load(filters, 1, 20)).toBe(false);
      expect(views.at(-1)).toMatchObject({
        status: "error",
        message: expect.stringContaining("trace-id"),
      });
      expect(JSON.stringify(views.at(-1))).not.toContain("private");
    },
  );
  it("accepts later pages and exact large aggregate values without deriving totals from the current rows", () => {
    const data = parseRevenueResult(
      {
        records: { ...records, page: 2, pageSize: 1, total: 2 },
        summary: { ...summary, totalAmount: "9007199254740993.99" },
      },
      filters,
      2,
      1,
    );
    expect(data.records.page).toBe(2);
    expect(data.summary.totalAmount).toBe("9007199254740993.99");
    expect(
      parseRevenueResult(
        {
          records: { ...records, page: 2, pageSize: 1, total: 1, items: [] },
          summary,
        },
        filters,
        2,
        1,
      ).records.items,
    ).toEqual([]);
  });
  it("allows distinct owned resorts when no resort filter is applied and trims selected filters", () => {
    const value = {
      records: {
        ...records,
        total: 2,
        items: [
          records.items[0],
          { ...records.items[0], revenueId: 4, resortId: 10 },
        ],
      },
      summary: { ...summary, resortId: null, resortName: null },
    };
    expect(
      parseRevenueResult(value, { ...filters, resortId: "" }, 1, 20).records
        .items,
    ).toHaveLength(2);
    expect(
      parseRevenueResult(
        { records, summary },
        { ...filters, resortId: " 9 " },
        1,
        20,
      ).summary.resortId,
    ).toBe(9);
  });
  it("keeps zero values and projects an empty page without stale rows", () => {
    const value = parseRevenueResult(
      {
        records: { ...records, total: 0, items: [] },
        summary: { ...summary, totalAmount: "0.00", daily: [] },
      },
      filters,
      1,
      20,
    );
    expect(value).toMatchObject({
      records: { items: [], total: 0 },
      summary: { totalAmount: "0.00", daily: [] },
    });
  });
});
