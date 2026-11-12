import { ApiError } from "@common/api-contracts/client";
import type { components } from "@common/api-contracts/openapi";
import { apiRequest } from "@/platform/api";
import {
  loadRevenue,
  type RevenueView,
} from "@/features/revenue/revenue-model";
import { revenueQuery } from "@/features/revenue/merchant-revenue-model";
import {
  parseDashboardResorts,
  parseDashboardRevenue,
  type DashboardResortPage,
} from "@/features/merchant-dashboard/dashboard-response";

export type ResortPage = DashboardResortPage;
export type Lifecycle = components["schemas"]["MerchantResortVO"]["status"];
export type RevenueData = Extract<RevenueView, { status: "ready" }>;
export type Panel<T> =
  | { status: "loading" }
  | { status: "blocked"; message: string }
  | { status: "error"; message: string; traceId: string | null }
  | { status: "ready"; data: T };
export interface DashboardView {
  resorts: Panel<ResortPage>;
  revenue: Panel<RevenueData>;
}
export interface DashboardFilters {
  fromDate: string;
  toDate: string;
  resortId: string;
  status: "" | Lifecycle;
}
export const lifecycleLabels: Record<Lifecycle, string> = {
  draft: "草稿",
  pending_review: "审核中",
  published: "已发布",
  offline: "已下架",
};

export function initialDashboardFilters(now = new Date()): DashboardFilters {
  const end = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const start = new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
  return {
    fromDate: start.toISOString().slice(0, 10),
    toDate: end.toISOString().slice(0, 10),
    resortId: "",
    status: "",
  };
}

export function validateDashboardFilters(
  input: DashboardFilters,
): DashboardFilters {
  for (const date of [input.fromDate, input.toDate]) {
    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date
    )
      throw new Error("请填写有效的开始和结束日期");
  }
  if (input.fromDate > input.toDate)
    throw new Error("开始日期不能晚于结束日期");
  const resortId = input.resortId.trim();
  if (
    resortId &&
    (!/^[1-9]\d*$/.test(resortId) ||
      !Number.isSafeInteger(Number(resortId)) ||
      Number(resortId) > 2147483647)
  )
    throw new Error("请填写有效的收益雪场 ID");
  if (input.status && !Object.hasOwn(lifecycleLabels, input.status))
    throw new Error("请选择有效的雪场状态");
  revenueQuery({ ...input, resortId }, 1, 5);
  return { ...input, resortId };
}

export async function loadMerchantDashboard(
  filters: DashboardFilters,
  permissionKeys: readonly string[],
  signal: AbortSignal,
  request: typeof apiRequest = apiRequest,
): Promise<DashboardView> {
  signal.throwIfAborted();
  const has = (grant: string) => permissionKeys.includes(grant);
  if (!has("management:portal:enter") || !has("merchant:dashboard:read")) {
    const blocked = {
      status: "blocked" as const,
      message: "当前账号未获商家工作台授权",
    };
    return { resorts: blocked, revenue: blocked };
  }
  const query = validateDashboardFilters(filters);
  const resortQuery = new URLSearchParams({ page: "1", pageSize: "5" });
  if (query.status) resortQuery.set("status", query.status);
  const revenueQuery = new URLSearchParams({
    fromDate: query.fromDate,
    toDate: query.toDate,
    page: "1",
    pageSize: "5",
  });
  if (query.resortId) revenueQuery.set("resortId", query.resortId);
  const [resorts, revenue] = await Promise.all([
    has("resort:merchant:list")
      ? loadPanel(
          async () =>
            parseDashboardResorts(
              await request<unknown>(`/merchant/resorts?${resortQuery}`, {
                signal,
                cache: "no-store",
              }),
              query.status,
            ),
          signal,
          "雪场",
        )
      : Promise.resolve<Panel<ResortPage>>({
          status: "blocked",
          message: "尚未获雪场查询权限",
        }),
    has("revenue:merchant:list")
      ? loadPanel(
          async () =>
            parseDashboardRevenue(
              await loadRevenue(revenueQuery, signal, request),
              query,
            ),
          signal,
          "收益",
        )
      : Promise.resolve<Panel<RevenueData>>({
          status: "blocked",
          message: "尚未获收益查询权限",
        }),
  ]);
  signal.throwIfAborted();
  return { resorts, revenue };
}

async function loadPanel<T>(
  work: () => Promise<T>,
  signal: AbortSignal,
  label: string,
): Promise<Panel<T>> {
  try {
    const data = await work();
    signal.throwIfAborted();
    return { status: "ready", data };
  } catch (cause) {
    if (
      signal.aborted ||
      (cause instanceof DOMException && cause.name === "AbortError")
    )
      throw cause;
    const error = cause instanceof ApiError ? cause : null;
    return {
      status: "error",
      message:
        error?.status === 401
          ? "登录状态已失效，请重新登录"
          : error?.status === 403
            ? `${label}查询未获授权或数据范围不可用`
            : error?.status === 404
              ? "指定雪场不存在或不属于当前可见范围"
              : `${label}数据暂时不可用，请重试`,
      traceId: error?.traceId ?? null,
    };
  }
}
