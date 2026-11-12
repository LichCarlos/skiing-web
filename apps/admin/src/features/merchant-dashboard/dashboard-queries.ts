import type { apiRequest } from "@/platform/api";
import {
  parseCurrentUser,
  type CurrentUser,
} from "@/platform/auth/session-model";
import { dashboardIdentity } from "@/features/dashboard/summary-queries";
import { DashboardInputError } from "@/features/merchant-dashboard/dashboard-response";
import {
  loadMerchantDashboard,
  validateDashboardFilters,
  type DashboardFilters,
} from "@/features/merchant-dashboard/dashboard-model";

export { dashboardIdentity as merchantDashboardIdentity } from "@/features/dashboard/summary-queries";
export function canReadMerchantDashboard(value: unknown): value is CurrentUser {
  try {
    const user = parseCurrentUser(value);
    return (
      !!user.merchant &&
      ["management:portal:enter", "merchant:dashboard:read"].every((key) =>
        user.permissionKeys.includes(key),
      )
    );
  } catch {
    return false;
  }
}
export async function readMerchantDashboard(
  request: typeof apiRequest,
  operator: CurrentUser,
  filters: DashboardFilters,
  signal: AbortSignal,
) {
  if (!canReadMerchantDashboard(operator))
    throw new DashboardInputError(
      "当前账号未获商家工作台授权或未绑定有效商家资料",
    );
  async function verify() {
    signal.throwIfAborted();
    const value = await request<unknown>("/auth/me", {
      signal,
      cache: "no-store",
    });
    signal.throwIfAborted();
    if (
      !canReadMerchantDashboard(value) ||
      dashboardIdentity(parseCurrentUser(value)) !== dashboardIdentity(operator)
    )
      throw new DashboardInputError(
        "经营概览身份、商家关联或权限已变化，请重新读取身份",
      );
  }
  // Validate filters before sending even an identity request.
  const query = validateDashboardFilters(filters);
  await verify();
  const result = await loadMerchantDashboard(
    query,
    operator.permissionKeys,
    signal,
    request,
  );
  await verify();
  signal.throwIfAborted();
  return result;
}
