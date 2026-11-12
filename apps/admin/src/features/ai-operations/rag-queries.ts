import type { ApiRequestOptions } from "@common/api-contracts/client";
import { parseCurrentUser } from "@/platform/auth/session-model";
import {
  AiOperationIdentityError,
  AiOperationInputError,
  auditReason,
  canUseAiOperations,
  operatorKey,
  pageQuery,
  type Operator,
  type RagSource,
} from "@/features/ai-operations/api";
import {
  parseRagCommand,
  parseRagPage,
  parseRagSource,
  ragStatuses,
  ragTypes,
  sameRagTarget,
  type RagAction,
} from "@/features/ai-operations/rag-model";
export type RagRequest = (
  path: string,
  options?: ApiRequestOptions,
) => Promise<unknown>;
export type RagFilters = {
  keyword?: string;
  sourceType?: string;
  status?: string;
  manualDisabled?: string;
};
function assertOperator(operator: Operator, action?: RagAction) {
  const user = parseCurrentUser(operator);
  if (
    !canUseAiOperations(user, "rag") ||
    (action &&
      !user.permissionKeys.includes(
        action === "reindex" ? "ai:knowledge:reindex" : "ai:knowledge:disable",
      ))
  )
    throw new AiOperationIdentityError("登录账号或授权已变化，请重新读取身份");
}
export async function verifyRagOperator(
  request: RagRequest,
  operator: Operator,
  signal: AbortSignal,
  action?: RagAction,
) {
  assertOperator(operator, action);
  signal.throwIfAborted();
  const current = parseCurrentUser(
    await request("/auth/me", { signal, cache: "no-store" }),
  );
  signal.throwIfAborted();
  assertOperator(current, action);
  if (operatorKey(current) !== operatorKey(operator))
    throw new AiOperationIdentityError("登录账号或授权已变化，请重新读取身份");
}
function target(id: number) {
  if (!Number.isInteger(id) || id < 1 || id > 2147483647)
    throw new AiOperationInputError("来源编号无效");
  return `/admin/ai/sources/${id}`;
}
export function ragPageQuery(
  filters: RagFilters,
  page: number,
  pageSize: number,
) {
  const query = pageQuery(page, pageSize);
  for (const [key, values] of [
    ["sourceType", ragTypes],
    ["status", ragStatuses],
    ["manualDisabled", ["true", "false"]],
  ] as const) {
    const value = filters[key];
    if (value === undefined || value === "") continue;
    if (!(values as readonly string[]).includes(value))
      throw new AiOperationInputError("来源筛选参数无效");
    query.set(key, value);
  }
  if (filters.keyword !== undefined) {
    if (typeof filters.keyword !== "string")
      throw new AiOperationInputError("来源关键词无效");
    const keyword = filters.keyword.trim();
    if ([...keyword].length > 100)
      throw new AiOperationInputError("来源关键词最多100字");
    if (keyword) query.set("keyword", keyword);
  }
  return query;
}
export async function readRagPage(
  request: RagRequest,
  operator: Operator,
  filters: RagFilters,
  page: number,
  pageSize: number,
  signal: AbortSignal,
) {
  const query = ragPageQuery(filters, page, pageSize);
  await verifyRagOperator(request, operator, signal);
  const value = await request(`/admin/ai/sources?${query}`, {
    signal,
    cache: "no-store",
  });
  signal.throwIfAborted();
  const result = parseRagPage(value, page, pageSize);
  if (
    result.items.some(
      (item) =>
        (query.has("sourceType") &&
          item.sourceType !== query.get("sourceType")) ||
        (query.has("status") && item.status !== query.get("status")) ||
        (query.has("manualDisabled") &&
          String(item.manualDisabled) !== query.get("manualDisabled")),
    )
  )
    throw new AiOperationInputError("来源筛选响应异常，请重新读取");
  await verifyRagOperator(request, operator, signal);
  return result;
}
export async function readRagSource(
  request: RagRequest,
  operator: Operator,
  id: number,
  signal: AbortSignal,
) {
  const path = target(id);
  await verifyRagOperator(request, operator, signal);
  const value = await request(path, { signal, cache: "no-store" });
  signal.throwIfAborted();
  const result = parseRagSource(value, id);
  await verifyRagOperator(request, operator, signal);
  return result;
}
export async function writeRagCommand(
  request: RagRequest,
  operator: Operator,
  before: RagSource,
  action: RagAction,
  reason: string,
  signal: AbortSignal,
  dispatched: () => void,
) {
  if (!["reindex", "enable", "disable"].includes(action))
    throw new AiOperationInputError("来源操作无效");
  const snapshot = parseRagSource(before),
    path = target(snapshot.ragDocumentId),
    explanation = auditReason(reason);
  if (action === "reindex" && snapshot.manualDisabled)
    throw new AiOperationInputError("人工停用的来源不能重建");
  const current = await readRagSource(
    request,
    operator,
    snapshot.ragDocumentId,
    signal,
  );
  if (!sameRagTarget(current, snapshot))
    throw new AiOperationInputError("来源版本或目标已变化，请重新加载后核对");
  await verifyRagOperator(request, operator, signal, action);
  dispatched();
  const value = await request(
    `${path}/${action === "reindex" ? "reindex" : "status"}`,
    {
      method: action === "reindex" ? "POST" : "PATCH",
      signal,
      cache: "no-store",
      body: {
        expectedVersion: snapshot.controlVersion,
        reason: explanation,
        ...(action === "reindex" ? {} : { enabled: action === "enable" }),
      },
    },
  );
  signal.throwIfAborted();
  const result = parseRagCommand(value, snapshot, action);
  await verifyRagOperator(request, operator, signal, action);
  return result;
}
