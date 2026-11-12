import { apiRequest } from "@/platform/api";
import { RequestLane } from "@/platform/api/request-lane";
import { readMerchantRevenue } from "@/features/revenue/merchant-revenue-queries";
import {
  revenueReadError,
  type MerchantRevenueFilters,
  type RevenueOperator,
} from "@/features/revenue/merchant-revenue-model";
import type { RevenueView } from "@/features/revenue/revenue-model";
export function createMerchantRevenueRun(
  publish: (view: RevenueView) => void,
  operator: RevenueOperator,
  request: typeof apiRequest = apiRequest,
) {
  const lane = new RequestLane();
  let disposed = false;
  return {
    async load(
      filters: MerchantRevenueFilters,
      page: number,
      pageSize: number,
    ) {
      if (disposed) return false;
      publish({ status: "loading" });
      const snapshot = { ...filters };
      return lane.run(
        (signal) =>
          readMerchantRevenue(
            request,
            operator,
            snapshot,
            page,
            pageSize,
            signal,
          ),
        publish,
        (cause) =>
          publish({ status: "error", message: revenueReadError(cause) }),
        () => {},
      );
    },
    clear() {
      if (disposed) return;
      lane.cancel();
      publish({ status: "loading" });
    },
    dispose() {
      disposed = true;
      lane.cancel();
    },
  };
}
