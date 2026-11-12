import { ApiError } from "@common/api-contracts/client";
import type { components } from "@common/api-contracts/openapi";
import { parseCurrentUser } from "@/platform/auth/session-model";

export type RevenueOperator = components["schemas"]["CurrentUserVO"];
export type MerchantRevenueFilters = {
  resortId: string;
  fromDate: string;
  toDate: string;
};
export class RevenueQueryError extends Error {}
function isInt4(value: number | undefined): value is number {
  return Number.isInteger(value) && value! > 0 && value! <= 2147483647;
}
export function canReadMerchantRevenue(value: unknown): boolean {
  try {
    const user = parseCurrentUser(value);
    return (
      isInt4(user.userId) &&
      isInt4(user.merchant?.merchantId) &&
      ["management:portal:enter", "revenue:merchant:list"].every((key) =>
        user.permissionKeys.includes(key),
      )
    );
  } catch {
    return false;
  }
}
export function revenueOperatorKey(user: RevenueOperator) {
  return JSON.stringify([
    user.userId,
    user.account,
    user.merchant?.merchantId ?? null,
    [...new Set(user.roles.map((role) => role.roleKey))].sort(),
    [...new Set(user.permissionKeys)].sort(),
  ]);
}
export function verifyRevenueOperator(
  current: unknown,
  expected: RevenueOperator,
) {
  if (
    !canReadMerchantRevenue(current) ||
    !canReadMerchantRevenue(expected) ||
    revenueOperatorKey(parseCurrentUser(current)) !==
      revenueOperatorKey(expected)
  )
    throw new RevenueQueryError(
      "身份、商家关联或收益权限已变化，请重新读取身份后继续",
    );
}
export function initialRevenueFilters(
  now = new Date(),
): MerchantRevenueFilters {
  const end = new Date(now.getTime() + 8 * 3600000);
  const start = new Date(end.getTime() - 29 * 86400000);
  return {
    resortId: "",
    fromDate: start.toISOString().slice(0, 10),
    toDate: end.toISOString().slice(0, 10),
  };
}
export function revenueQuery(
  input: MerchantRevenueFilters,
  page = 1,
  pageSize = 20,
) {
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 2147483647 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100 ||
    (page - 1) * pageSize > 2147483647
  )
    throw new RevenueQueryError("页码或每页数量无效");
  const resortId = input.resortId.trim();
  if (resortId && (!/^[1-9]\d*$/.test(resortId) || !isInt4(Number(resortId))))
    throw new RevenueQueryError("请填写有效的雪场 ID");
  const dates = [input.fromDate, input.toDate].map((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    )
      throw new RevenueQueryError("请填写完整、有效的开始和结束日期");
    return date.getTime();
  });
  if (dates[0]! > dates[1]!)
    throw new RevenueQueryError("开始日期不能晚于结束日期");
  if (dates[1]! - dates[0]! > 366 * 86400000)
    throw new RevenueQueryError("查询区间最多包含 367 天");
  return new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    fromDate: input.fromDate,
    toDate: input.toDate,
    ...(resortId ? { resortId } : {}),
  });
}
export function revenueReadError(cause: unknown) {
  const message =
    cause instanceof RevenueQueryError
      ? cause.message
      : cause instanceof ApiError
        ? cause.status === 401
          ? "登录状态已失效，请重新登录"
          : cause.status === 403
            ? "当前账号没有收益查询权限或有效商家资料"
            : cause.status === 404
              ? "雪场不存在或不在当前商家授权范围内"
              : "收益数据暂时不可用，请重试"
        : "收益数据暂时不可用，请重试";
  return cause instanceof ApiError && cause.traceId
    ? `${message}（traceId: ${cause.traceId}）`
    : message;
}
