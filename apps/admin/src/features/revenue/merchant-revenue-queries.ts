import { loadRevenue } from "@/features/revenue/revenue-model";
import {
  revenueQuery,
  verifyRevenueOperator,
  type RevenueOperator,
  type MerchantRevenueFilters,
} from "@/features/revenue/merchant-revenue-model";
import type { apiRequest } from "@/platform/api";
import { parseRevenueResult } from "@/features/revenue/revenue-response";
export async function readMerchantRevenue(
  request: typeof apiRequest,
  operator: RevenueOperator,
  filters: MerchantRevenueFilters,
  page: number,
  pageSize: number,
  signal: AbortSignal,
) {
  const query = revenueQuery(filters, page, pageSize);
  verifyRevenueOperator(operator, operator);
  async function verify() {
    signal.throwIfAborted();
    const current = await request<unknown>("/auth/me", {
      signal,
      cache: "no-store",
    });
    signal.throwIfAborted();
    verifyRevenueOperator(current, operator);
  }
  await verify();
  const result = await loadRevenue(query, signal, request);
  // These remain two independent API/database snapshots. A final identity check
  // rejects an observed account/merchant/grant change; it is not an authorization lease.
  await verify();
  return parseRevenueResult(result, filters, page, pageSize);
}
