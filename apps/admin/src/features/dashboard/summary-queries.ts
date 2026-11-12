import type { components } from "@common/api-contracts/openapi";
import type { apiRequest } from "@/platform/api";
import { parseCurrentUser } from "@/platform/auth/session-model";
import {
  parseSummary,
  SummaryInputError,
  type DashboardSummary,
} from "@/features/dashboard/summary-response";
export type SummaryOperator = components["schemas"]["CurrentUserVO"];
export function dashboardIdentity(user: SummaryOperator): string {
  return JSON.stringify([
    user.userId,
    user.account,
    user.merchant?.merchantId ?? null,
    [...new Set(user.roles.map((role) => role.roleKey))].sort(),
    [...new Set(user.permissionKeys)].sort(),
  ]);
}
export function canReadSummary(value: unknown): value is SummaryOperator {
  try {
    return parseCurrentUser(value).permissionKeys.includes(
      "management:portal:enter",
    );
  } catch {
    return false;
  }
}
function verify(current: unknown, expected: SummaryOperator) {
  if (
    !canReadSummary(current) ||
    !canReadSummary(expected) ||
    dashboardIdentity(parseCurrentUser(current)) !== dashboardIdentity(expected)
  )
    throw new SummaryInputError("工作台身份或权限已变化，请重新读取身份");
}
function verifyPanels(data: DashboardSummary, user: SummaryOperator) {
  const has = (key: string) => user.permissionKeys.includes(key);
  const admin = user.roles.some((role) => role.roleKey === "system_admin");
  const globalRevenue = admin && has("revenue:system:summary");
  const allowed = {
    users: has("system:user:list"),
    merchants: has("system:user:list"),
    resorts:
      has("content:resort:list-all") ||
      (!!user.merchant && has("resort:merchant:list")),
    articles: has("content:article:manage"),
    dynamics: has("content:dynamic:moderate"),
    rag: admin && has("ai:knowledge:list"),
    revenue: globalRevenue || (!!user.merchant && has("revenue:merchant:list")),
  };
  for (const key of Object.keys(allowed) as Array<keyof typeof allowed>)
    if (data[key] !== null && !allowed[key])
      throw new SummaryInputError("工作台面板授权不匹配，请重新读取身份");
  if (
    data.revenue &&
    data.revenue.scope !== (globalRevenue ? "all" : "merchant")
  )
    throw new SummaryInputError("工作台收益范围不匹配，请重新读取身份");
}
export async function readSummary(
  request: typeof apiRequest,
  expected: SummaryOperator,
  signal: AbortSignal,
) {
  verify(expected, expected);
  const identity = async () => {
    signal.throwIfAborted();
    const value = await request<unknown>("/auth/me", {
      signal,
      cache: "no-store",
    });
    signal.throwIfAborted();
    verify(value, expected);
  };
  await identity();
  const value = await request<unknown>("/admin/dashboard/summary", {
    signal,
    cache: "no-store",
  });
  signal.throwIfAborted();
  const data = parseSummary(value);
  verifyPanels(data, expected);
  await identity();
  signal.throwIfAborted();
  return data;
}
