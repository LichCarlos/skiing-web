import { ApiError, type ApiRequestOptions } from "@common/api-contracts/client";
import {
  parseGlobalResort,
  parseGlobalResortPage,
} from "@/features/admin-resorts/global-resort-responses";
import {
  globalResortListPath,
  verifyGlobalOperator,
  globalResortFingerprint,
  mayRunGlobalCommand,
  resortId,
  GlobalResortError,
  resortStatuses,
  type GlobalResort,
  type GlobalResortOperator,
  type GlobalResortAction,
  type GlobalResortFilters,
  type GlobalResortMutation,
} from "@/features/admin-resorts/global-resort-model";
export type GlobalResortRequest = <T>(
  path: string,
  options?: ApiRequestOptions,
) => Promise<T>;
export async function verifyGlobalReader(
  request: GlobalResortRequest,
  operator: GlobalResortOperator,
  signal: AbortSignal,
  action: GlobalResortAction = "list",
) {
  verifyGlobalOperator(operator, operator, action);
  signal.throwIfAborted();
  const current = await request<GlobalResortOperator>("/auth/me", {
    signal,
    cache: "no-store",
  });
  signal.throwIfAborted();
  verifyGlobalOperator(current, operator, action);
  return current;
}
export async function readGlobalResort(
  request: GlobalResortRequest,
  operator: GlobalResortOperator,
  id: number,
  signal: AbortSignal,
) {
  if (resortId(String(id)) === null)
    throw new GlobalResortError("雪场编号无效");
  await verifyGlobalReader(request, operator, signal);
  let response: unknown;
  try {
    response = await request<unknown>(`/admin/resorts/${id}`, {
      signal,
      cache: "no-store",
    });
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 404)
      await verifyGlobalReader(request, operator, signal);
    throw cause;
  }
  signal.throwIfAborted();
  const item = parseGlobalResort(response, id);
  await verifyGlobalReader(request, operator, signal);
  return item;
}
export async function readGlobalResortPage(
  request: GlobalResortRequest,
  operator: GlobalResortOperator,
  filters: GlobalResortFilters,
  signal: AbortSignal,
) {
  const path = globalResortListPath(filters);
  await verifyGlobalReader(request, operator, signal);
  const response = await request<unknown>(path, {
    signal,
    cache: "no-store",
  });
  signal.throwIfAborted();
  const result = parseGlobalResortPage(response, filters);
  await verifyGlobalReader(request, operator, signal);
  return result;
}
export async function prepareGlobalCommand(
  request: GlobalResortRequest,
  operator: GlobalResortOperator,
  expected: GlobalResort,
  action: "publish" | "offline" | "delete",
  signal: AbortSignal,
) {
  const current = await readGlobalResort(
    request,
    operator,
    expected.resortId,
    signal,
  );
  if (globalResortFingerprint(current) !== globalResortFingerprint(expected))
    throw new GlobalResortError("雪场资料、归属或状态已变化，请刷新后重新确认");
  if (!mayRunGlobalCommand(current, action))
    throw new GlobalResortError("当前状态不允许此操作，请刷新后继续");
  return current;
}
export async function runGlobalCommand(
  request: GlobalResortRequest,
  id: number,
  action: "publish" | "offline" | "delete",
  signal: AbortSignal,
  reason?: string,
) {
  if (resortId(String(id)) === null)
    throw new GlobalResortError("雪场编号无效");
  if (
    reason !== undefined &&
    (!reason.trim() || Array.from(reason.trim()).length > 500)
  )
    throw new GlobalResortError("操作原因须为1–500字");
  signal.throwIfAborted();
  const response = await request<unknown>(
    `/admin/resorts/${id}${action === "delete" ? "" : `/${action}`}`,
    {
      method: action === "delete" ? "DELETE" : "PATCH",
      signal,
      ...(action === "delete"
        ? {}
        : { body: reason === undefined ? {} : { reason: reason.trim() } }),
    },
  );
  try {
    if (action === "delete") {
      if (response !== undefined) throw new Error();
      return undefined;
    }
    const result = parseGlobalResort(response, id);
    if (result.status !== (action === "publish" ? "published" : "offline"))
      throw new Error();
    return result;
  } catch {
    throw new GlobalResortError("操作响应异常，请人工核对结果");
  }
}
export async function reviewGlobalWrites(
  request: GlobalResortRequest,
  operator: GlobalResortOperator,
  mutations: readonly GlobalResortMutation[],
  signal: AbortSignal,
) {
  const summaries: string[] = [];
  for (const mutation of mutations) {
    if (mutation.action === "create") {
      const page = await readGlobalResortPage(
        request,
        operator,
        { page: 1 },
        signal,
      );
      summaries.push(
        `新建「${mutation.name}」：最新20条候选 ${page.items.map((item) => `#${item.resortId} ${item.name}`).join("；") || "无"}。未找到不证明创建失败。`,
      );
    } else {
      try {
        const item = await readGlobalResort(
          request,
          operator,
          mutation.resortId,
          signal,
        );
        summaries.push(
          `#${item.resortId} ${item.name}：${resortStatuses[item.status as keyof typeof resortStatuses]}，${item.updatedAt}`,
        );
      } catch (cause) {
        signal.throwIfAborted();
        if (!(cause instanceof ApiError) || cause.status !== 404) throw cause;
        summaries.push(
          `#${mutation.resortId} 不存在或不可见，404不能证明删除成功。`,
        );
      }
    }
  }
  return summaries;
}
