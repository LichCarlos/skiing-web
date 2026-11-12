import type { ApiRequestOptions } from "@common/api-contracts/client";
import { parseCurrentUser } from "@/platform/auth/session-model";
import {
  AiOperationInputError,
  AiOperationIdentityError,
  auditReason,
  canUseAiOperations,
  operatorKey,
  pageQuery,
  type Operator,
} from "@/features/ai-operations/api";
import {
  parseAuditContent,
  parseAuditPage,
  parseAuditSummary,
} from "@/features/ai-operations/audit-model";
import { conversationAuditId } from "@/features/ai-operations/routes";
export type AuditRequest = (
  path: string,
  options?: ApiRequestOptions,
) => Promise<unknown>;
export type AuditFilters = {
  userId?: number;
  status?: string;
  fromTime?: string;
  toTime?: string;
};
function assertReader(operator: Operator, content = false) {
  const user = parseCurrentUser(operator);
  if (
    !canUseAiOperations(user, "audit") ||
    (content &&
      !user.permissionKeys.includes("system:ai-conversation:read-content"))
  )
    throw new AiOperationIdentityError("登录账号或授权已变化，请重新读取身份");
}
async function verify(
  request: AuditRequest,
  operator: Operator,
  signal: AbortSignal,
  content = false,
) {
  signal.throwIfAborted();
  const current = parseCurrentUser(
    await request("/auth/me", { signal, cache: "no-store" }),
  );
  signal.throwIfAborted();
  assertReader(current, content);
  if (operatorKey(current) !== operatorKey(operator))
    throw new AiOperationIdentityError("登录账号或授权已变化，请重新读取身份");
}
function target(id: string) {
  if (!conversationAuditId(id)) throw new AiOperationInputError("会话编号无效");
  return `/admin/ai/conversations/${encodeURIComponent(id)}`;
}
export function auditPageQuery(
  filters: AuditFilters,
  page: number,
  pageSize: number,
) {
  const query = pageQuery(page, pageSize);
  if (filters.userId !== undefined && filters.userId !== null) {
    if (
      !Number.isInteger(filters.userId) ||
      filters.userId < 1 ||
      filters.userId > 2147483647
    )
      throw new AiOperationInputError("用户 ID 无效");
    query.set("userId", String(filters.userId));
  }
  if (filters.status) {
    if (!["active", "deleted"].includes(filters.status))
      throw new AiOperationInputError("会话状态无效");
    query.set("status", filters.status);
  }
  let from: number | undefined, to: number | undefined;
  for (const key of ["fromTime", "toTime"] as const) {
    const value = filters[key];
    if (!value) continue;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime()))
      throw new AiOperationInputError("请选择有效时间");
    query.set(key, date.toISOString());
    if (key === "fromTime") from = date.getTime();
    else to = date.getTime();
  }
  if (from !== undefined && to !== undefined && from > to)
    throw new AiOperationInputError("开始时间不能晚于结束时间");
  return query;
}
export async function readAuditPage(
  request: AuditRequest,
  operator: Operator,
  filters: AuditFilters,
  page: number,
  pageSize: number,
  signal: AbortSignal,
) {
  const query = auditPageQuery(filters, page, pageSize);
  assertReader(operator);
  await verify(request, operator, signal);
  const value = await request(`/admin/ai/conversations?${query}`, {
    signal,
    cache: "no-store",
  });
  signal.throwIfAborted();
  const result = parseAuditPage(value, page, pageSize);
  if (
    result.items.some(
      (item) =>
        (filters.userId != null && item.userId !== filters.userId) ||
        (filters.status && item.status !== filters.status),
    )
  )
    throw new AiOperationInputError("会话筛选响应异常，请重新读取");
  await verify(request, operator, signal);
  return result;
}
export async function readAuditSummary(
  request: AuditRequest,
  operator: Operator,
  id: string,
  signal: AbortSignal,
) {
  const path = target(id);
  assertReader(operator);
  await verify(request, operator, signal);
  const value = await request(path, { signal, cache: "no-store" });
  signal.throwIfAborted();
  const result = parseAuditSummary(value, id);
  await verify(request, operator, signal);
  return result;
}
export async function readAuditContent(
  request: AuditRequest,
  operator: Operator,
  id: string,
  reason: string,
  signal: AbortSignal,
) {
  const path = target(id),
    explanation = auditReason(reason);
  assertReader(operator, true);
  await verify(request, operator, signal, true);
  const value = await request(`${path}/content-access`, {
    method: "POST",
    body: { reason: explanation },
    signal,
    cache: "no-store",
  });
  signal.throwIfAborted();
  const result = parseAuditContent(value);
  await verify(request, operator, signal, true);
  return result;
}
