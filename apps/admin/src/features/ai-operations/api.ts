import { ApiError } from "@common/api-contracts/client";
import type { components } from "@common/api-contracts/openapi";
import { apiRequest } from "@/platform/api";
import { parseCurrentUser } from "@/platform/auth/session-model";
import { AuditResponseError } from "@/features/ai-operations/audit-model";
import { RagResponseError } from "@/features/ai-operations/rag-model";
export type Operator = components["schemas"]["CurrentUserVO"];
export type RagSource = components["schemas"]["RagSourceVOClass"];
export type RagSourcePage = components["schemas"]["RagSourcePageVO"];
export type AuditSummary =
  components["schemas"]["AiConversationAuditSummaryVO"];
export type AuditPage = components["schemas"]["AiConversationAuditPageVO"];
export type AuditContent =
  components["schemas"]["AiConversationContentAccessVO"];
export class AiOperationInputError extends Error {}
export class AiOperationIdentityError extends Error {}
export function operatorKey(user: Operator) {
  return JSON.stringify([
    user.userId,
    user.account,
    [...new Set(user.permissionKeys)].sort(),
    [...new Set(user.roles.map((role) => role.roleKey))].sort(),
  ]);
}
export function canUseAiOperations(user: Operator, kind: "rag" | "audit") {
  return (
    user.permissionKeys.includes("management:portal:enter") &&
    (kind === "rag"
      ? user.roles.some((role) => role.roleKey === "system_admin") &&
        user.permissionKeys.includes("ai:knowledge:list")
      : user.permissionKeys.includes("system:ai-conversation:list"))
  );
}
export async function verifyOperator(operator: Operator, signal: AbortSignal) {
  signal.throwIfAborted();
  const current = parseCurrentUser(
    await apiRequest<unknown>("/auth/me", {
      signal,
      cache: "no-store",
    }),
  );
  signal.throwIfAborted();
  if (operatorKey(current) !== operatorKey(operator))
    throw new AiOperationIdentityError("登录账号或授权已变化，请重新读取身份");
}
export function pageQuery(page: number, pageSize: number) {
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 2147483647 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100 ||
    (page - 1) * pageSize > 2147483647
  )
    throw new AiOperationInputError("分页参数无效");
  return new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
}
export function auditReason(reason: string) {
  if (typeof reason !== "string")
    throw new AiOperationInputError("操作原因须为 1–500 字");
  const value = reason.trim();
  if (!value || [...value].length > 500)
    throw new AiOperationInputError("操作原因须为 1–500 字");
  return value;
}
export function operationError(error: unknown) {
  if (error instanceof ApiError) {
    const title =
      error.status === 409
        ? "版本或状态已变化，请重新加载后核对；未自动重试"
        : error.status === 403
          ? "授权已变化或没有权限，请重新读取身份"
          : error.status === 404
            ? "记录不存在或不在授权范围内"
            : error.status === 401
              ? "登录已失效"
              : "操作失败；如已提交命令，请先重新加载核对结果";
    return error.traceId ? `${title}（traceId: ${error.traceId}）` : title;
  }
  return error instanceof AiOperationInputError ||
    error instanceof AiOperationIdentityError ||
    error instanceof AuditResponseError ||
    error instanceof RagResponseError
    ? error.message
    : "请求暂时不可用；如已提交命令，请先核对结果，不会自动重试";
}
