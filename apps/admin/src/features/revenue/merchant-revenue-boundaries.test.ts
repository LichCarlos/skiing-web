import { describe, expect, it, vi } from "vitest";
import type { apiRequest } from "@/platform/api";
import { readMerchantRevenue } from "@/features/revenue/merchant-revenue-queries";
import {
  operator,
  filters,
  records,
  summary,
} from "@/features/revenue/merchant-revenue-fixtures.test-helper";
const signal = () => new AbortController().signal;
function transport(page: unknown = records, aggregate: unknown = summary) {
  return vi.fn(async (path: string) =>
    path === "/auth/me"
      ? operator
      : path.includes("/summary?")
        ? aggregate
        : page,
  );
}
describe("merchant revenue runtime boundary", () => {
  it("projects every record/creator/day instead of preserving extra response fields", async () => {
    const record = records.items[0]!;
    const request = transport(
      {
        ...records,
        secret: true,
        items: [
          {
            ...record,
            password: "private",
            createdBy: { ...record.createdBy, token: "private" },
          },
        ],
      },
      {
        ...summary,
        owner: "private",
        daily: [{ ...summary.daily[0], secret: true }],
      },
    );
    expect(
      await readMerchantRevenue(
        request as typeof apiRequest,
        operator,
        filters,
        1,
        20,
        signal(),
      ),
    ).toEqual({ status: "ready", records, summary });
  });
  it.each([
    null,
    [],
    {},
    { ...records, total: -1 },
    { ...records, hasNext: true },
    { ...records, items: null },
    { ...records, total: 2, items: [records.items[0], records.items[0]] },
  ])("rejects malformed page %j", async (value) => {
    await expect(
      readMerchantRevenue(
        transport(value) as typeof apiRequest,
        operator,
        filters,
        1,
        20,
        signal(),
      ),
    ).rejects.toThrow();
  });
  it.each([
    { revenueAmount: "-1.00" },
    { revenueAmount: 12.34 },
    { revenueAmount: "NaN" },
    { revenueAmount: "1e2" },
    { revenueAmount: "1.001" },
    { revenueId: 0 },
    { resortId: 10 },
    { reportDate: "2026-11-01" },
    { reportDate: "2026-02-30" },
    { source: "unknown" },
    { createdBy: null },
    { note: {} },
    { updatedAt: "invalid" },
  ])("rejects invalid row %j", async (patch) => {
    await expect(
      readMerchantRevenue(
        transport({
          ...records,
          items: [{ ...records.items[0], ...patch }],
        }) as typeof apiRequest,
        operator,
        filters,
        1,
        20,
        signal(),
      ),
    ).rejects.toThrow();
  });
  it.each([
    { totalAmount: "private" },
    { totalAmount: "1.001" },
    { totalAmount: -1 },
    { daily: null },
    { daily: [{ date: "2026-11-01", amount: "1.00" }] },
    { daily: [{ date: "2026-10-01", amount: "-1.00" }] },
    { daily: [summary.daily[0], summary.daily[0]] },
  ])("rejects malformed aggregate %j", async (patch) => {
    await expect(
      readMerchantRevenue(
        transport(records, { ...summary, ...patch }) as typeof apiRequest,
        operator,
        filters,
        1,
        20,
        signal(),
      ),
    ).rejects.toThrow();
  });
  it("denies invalid local identity before making even an auth request", async () => {
    const request = transport();
    await expect(
      readMerchantRevenue(
        request as typeof apiRequest,
        { ...operator, permissionKeys: [] },
        filters,
        1,
        20,
        signal(),
      ),
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it("rejects an account name change in the final identity", async () => {
    const request = transport();
    request
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce(records)
      .mockResolvedValueOnce(summary)
      .mockResolvedValueOnce({ ...operator, account: "other" });
    await expect(
      readMerchantRevenue(
        request as typeof apiRequest,
        operator,
        filters,
        1,
        20,
        signal(),
      ),
    ).rejects.toThrow("变化");
  });
  it.each([
    null,
    {},
    { ...operator, roles: null },
    { ...operator, permissionKeys: null },
  ])("sanitizes invalid auth payload %j", async (current) => {
    const request = transport();
    request.mockResolvedValueOnce(current as never);
    await expect(
      readMerchantRevenue(
        request as typeof apiRequest,
        operator,
        filters,
        1,
        20,
        signal(),
      ),
    ).rejects.toThrow("变化");
    expect(request).toHaveBeenCalledTimes(1);
  });
});
