import type { components } from "@common/api-contracts/openapi";
import { ApiError, type ApiRequestOptions } from "@common/api-contracts/client";
import { apiRequest } from "@/platform/api";
import type { CurrentUser } from "@/platform/auth/session-model";
import {
  OperationLogIdentityError,
  operationLogOperator,
  parseOperationLogPage,
  verifyOperationLogOperator,
} from "@/features/operation-logs/operation-log-model";

export type OperationLog = components["schemas"]["OperationLogVO"];
export type OperationLogPage = components["schemas"]["OperationLogPageVO"];
export interface OperationLogFilters {
  actorUserId?: string;
  actionKey?: string;
  resourceKey?: string;
  result?: "success" | "failure";
  traceId?: string;
  fromTime?: string;
  toTime?: string;
}

export function operationLogQuery(
  filters: OperationLogFilters,
  page: number,
  pageSize: number,
) {
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100 ||
    (page - 1) * pageSize > 2147483647
  )
    throw new Error("页码无效");
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  const actor = filters.actorUserId?.trim();
  if (actor) {
    if (
      !/^[1-9]\d*$/.test(actor) ||
      !Number.isSafeInteger(Number(actor)) ||
      Number(actor) > 2147483647
    )
      throw new Error("操作者 ID 必须为有效的正整数");
    query.set("actorUserId", actor);
  }
  for (const [key, max] of [
    ["actionKey", 150],
    ["resourceKey", 100],
    ["traceId", 100],
  ] as const) {
    const value = filters[key]?.trim();
    if (value && value.length > max) throw new Error("筛选内容过长");
    if (value) query.set(key, value);
  }
  if (filters.result) {
    if (filters.result !== "success" && filters.result !== "failure")
      throw new Error("结果筛选无效");
    query.set("result", filters.result);
  }
  let from: Date | undefined;
  let to: Date | undefined;
  for (const key of ["fromTime", "toTime"] as const) {
    const value = filters[key];
    if (!value) continue;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new Error("请选择有效时间");
    query.set(key, date.toISOString());
    if (key === "fromTime") from = date;
    else to = date;
  }
  if (from && to && from > to) throw new Error("开始时间不能晚于结束时间");
  return query.toString();
}

export type OperationLogRequest = <T>(
  path: string,
  options?: ApiRequestOptions,
) => Promise<T>;
async function readPage(
  request: OperationLogRequest,
  query: string,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams(query);
  const page = Number(params.get("page")),
    pageSize = Number(params.get("pageSize"));
  // Validate the requested page before starting any network request.
  operationLogQuery({}, page, pageSize);
  signal?.throwIfAborted();
  const value = await request<unknown>(`/admin/operation-logs?${query}`, {
    signal,
    cache: "no-store",
  });
  signal?.throwIfAborted();
  return parseOperationLogPage(value, { page, pageSize });
}
export function getOperationLogs(query: string, signal?: AbortSignal) {
  return readPage(apiRequest, query, signal);
}
export async function readOperationLogPage(
  request: OperationLogRequest,
  operator: CurrentUser,
  query: string,
  signal: AbortSignal,
) {
  operationLogOperator(operator);
  async function verify() {
    signal.throwIfAborted();
    const current = await request<unknown>("/auth/me", {
      signal,
      cache: "no-store",
    });
    signal.throwIfAborted();
    verifyOperationLogOperator(current, operator);
  }
  await verify();
  const page = await readPage(request, query, signal);
  await verify();
  return page;
}

export function operationLogError(error: unknown) {
  const apiError = error instanceof ApiError ? error : null;
  return {
    title:
      error instanceof OperationLogIdentityError
        ? "身份或权限已变化，请重新读取身份"
        : apiError?.status === 401
          ? "登录状态已失效"
          : apiError?.status === 403
            ? "当前账号无权读取操作日志"
            : "操作日志暂时不可用",
    traceId: apiError?.traceId ?? null,
  };
}
