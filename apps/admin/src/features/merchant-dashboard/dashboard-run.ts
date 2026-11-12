import { ApiError } from "@common/api-contracts/client";
import { apiRequest } from "@/platform/api";
import type { CurrentUser } from "@/platform/auth/session-model";
import { DashboardInputError } from "@/features/merchant-dashboard/dashboard-response";
import { readMerchantDashboard } from "@/features/merchant-dashboard/dashboard-queries";
import type {
  DashboardFilters,
  DashboardView,
} from "@/features/merchant-dashboard/dashboard-model";
export function loadingDashboard(): DashboardView {
  return { resorts: { status: "loading" }, revenue: { status: "loading" } };
}
export function createMerchantDashboardRun(
  publish: (view: DashboardView) => void,
  user: CurrentUser,
  request: typeof apiRequest = apiRequest,
) {
  let current: AbortController | null = null,
    disposed = false;
  return {
    async load(filters: DashboardFilters) {
      if (disposed) return;
      current?.abort();
      const controller = new AbortController();
      current = controller;
      publish(loadingDashboard());
      try {
        const view = await readMerchantDashboard(
          request,
          user,
          filters,
          controller.signal,
        );
        if (!disposed && !controller.signal.aborted) publish(view);
      } catch (cause) {
        if (disposed || controller.signal.aborted) return;
        const error = cause instanceof ApiError ? cause : null;
        const panel = {
          status: "error" as const,
          message:
            cause instanceof DashboardInputError
              ? cause.message
              : error?.status === 401
                ? "登录状态已失效，请重新登录"
                : error?.status === 403
                  ? "经营概览未获授权，请重新读取身份"
                  : "经营概览暂时不可用，请重试",
          traceId: error?.traceId ?? null,
        };
        publish({ resorts: panel, revenue: panel });
      }
    },
    clear() {
      if (disposed) return;
      current?.abort();
      publish(loadingDashboard());
    },
    dispose() {
      disposed = true;
      current?.abort();
    },
  };
}
