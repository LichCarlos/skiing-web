import { ApiError } from "@common/api-contracts/client";
import { apiRequest } from "@/platform/api";
import {
  readSummary,
  type SummaryOperator,
} from "@/features/dashboard/summary-queries";
import {
  type DashboardSummary,
  SummaryInputError,
} from "@/features/dashboard/summary-response";
export { dashboardIdentity } from "@/features/dashboard/summary-queries";
export type { DashboardSummary } from "@/features/dashboard/summary-response";

export type SummaryState =
  | { status: "loading" }
  | { status: "ready"; data: DashboardSummary }
  | { status: "error"; message: string; traceId: string | null };

// Dispose on identity/authorization changes. Ignoring cancellation by a transport
// must never allow its late response to publish into the replacement view.
export function createSummaryRun(
  publish: (state: SummaryState) => void,
  operator: SummaryOperator,
  request: typeof apiRequest = apiRequest,
) {
  let current: AbortController | null = null;
  let disposed = false;
  return {
    async load(): Promise<void> {
      if (disposed) return;
      current?.abort();
      const controller = new AbortController();
      current = controller;
      publish({ status: "loading" });
      try {
        const data = await readSummary(request, operator, controller.signal);
        if (!disposed && !controller.signal.aborted)
          publish({ status: "ready", data });
      } catch (cause) {
        if (disposed || controller.signal.aborted) return;
        const error = cause instanceof ApiError ? cause : null;
        publish({
          status: "error",
          message:
            cause instanceof SummaryInputError
              ? cause.message
              : error?.status === 401
                ? "登录状态已失效，请重新登录"
                : error?.status === 403
                  ? "工作台未获授权或数据范围存在冲突，请联系管理员后重试"
                  : "工作台汇总暂时不可用，请重试",
          traceId: error?.traceId ?? null,
        });
      }
    },
    dispose() {
      disposed = true;
      current?.abort();
    },
    clear() {
      if (disposed) return;
      current?.abort();
      publish({ status: "loading" });
    },
  };
}
