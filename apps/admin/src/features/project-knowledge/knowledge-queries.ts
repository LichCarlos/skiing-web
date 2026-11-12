import { ApiError, type ApiRequestOptions } from "@common/api-contracts/client";
import {
  parseKnowledge,
  parseKnowledgePage,
} from "@/features/project-knowledge/knowledge-responses";
import {
  knowledgeId,
  knowledgePath,
  knowledgeInput,
  assertKnowledgeCommand,
  verifyKnowledgeOperator,
  KnowledgeInputError,
  type Knowledge,
  type KnowledgeOperator,
  type KnowledgeAction,
  type KnowledgeInput,
  type KnowledgeMutation,
  type KnowledgeCommand,
} from "@/features/project-knowledge/knowledge-model";
export type KnowledgeRequest = <T>(
  path: string,
  options?: ApiRequestOptions,
) => Promise<T>;

export async function verifyKnowledgeReader(
  request: KnowledgeRequest,
  user: KnowledgeOperator,
  signal: AbortSignal,
  action: KnowledgeAction = "list",
) {
  verifyKnowledgeOperator(user, user, action);
  signal.throwIfAborted();
  const current = await request<KnowledgeOperator>("/auth/me", {
    signal,
    cache: "no-store",
  });
  signal.throwIfAborted();
  verifyKnowledgeOperator(current, user, action);
}
export async function readKnowledge(
  request: KnowledgeRequest,
  user: KnowledgeOperator,
  id: number,
  signal: AbortSignal,
) {
  if (knowledgeId(String(id)) === null)
    throw new KnowledgeInputError("项目知识编号无效");
  await verifyKnowledgeReader(request, user, signal);
  let response: unknown;
  try {
    response = await request<unknown>(`/admin/project-knowledge/${id}`, {
      signal,
      cache: "no-store",
    });
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 404)
      await verifyKnowledgeReader(request, user, signal);
    throw cause;
  }
  signal.throwIfAborted();
  const item = parseKnowledge(response, id);
  await verifyKnowledgeReader(request, user, signal);
  return item;
}
export async function readKnowledgePage(
  request: KnowledgeRequest,
  user: KnowledgeOperator,
  query: Parameters<typeof knowledgePath>[0],
  signal: AbortSignal,
) {
  const path = knowledgePath(query);
  await verifyKnowledgeReader(request, user, signal);
  const response = await request<unknown>(path, {
    signal,
    cache: "no-store",
  });
  signal.throwIfAborted();
  const data = parseKnowledgePage(response, query.page, query.status);
  await verifyKnowledgeReader(request, user, signal);
  return data;
}
export async function prepareKnowledgeSave(
  request: KnowledgeRequest,
  user: KnowledgeOperator,
  values: KnowledgeInput,
  item: Knowledge | undefined,
  signal: AbortSignal,
) {
  const body = knowledgeInput(values, item?.version);
  if (item) {
    const latest = await readKnowledge(
      request,
      user,
      item.projectKnowledgeId,
      signal,
    );
    if (latest.version !== item.version)
      throw new KnowledgeInputError("内容已变化，请保留当前修改并刷新最新版本");
  } else await verifyKnowledgeReader(request, user, signal, "create");
  return body;
}
export async function saveKnowledge(
  request: KnowledgeRequest,
  id: number | undefined,
  body: ReturnType<typeof knowledgeInput>,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  if (id !== undefined && knowledgeId(String(id)) === null)
    throw new KnowledgeInputError("项目知识编号无效");
  const saved = await request<unknown>(
    id ? `/admin/project-knowledge/${id}` : "/admin/project-knowledge",
    { method: id ? "PATCH" : "POST", body, signal },
  );
  try {
    return parseKnowledge(saved, id);
  } catch {
    throw new Error("Unexpected project knowledge response");
  }
}
export async function prepareKnowledgeCommand(
  request: KnowledgeRequest,
  user: KnowledgeOperator,
  id: number,
  action: KnowledgeCommand,
  expectedVersion: number,
  signal: AbortSignal,
) {
  const latest = await readKnowledge(request, user, id, signal);
  assertKnowledgeCommand(latest, action);
  if (latest.version !== expectedVersion)
    throw new KnowledgeInputError("内容已变化，请刷新核对后操作");
  return latest.projectKnowledgeId;
}
export async function sendKnowledgeCommand(
  request: KnowledgeRequest,
  id: number,
  action: KnowledgeCommand,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  if (
    knowledgeId(String(id)) === null ||
    !["publish", "withdraw", "delete"].includes(action)
  )
    throw new KnowledgeInputError("项目知识编号无效");
  const response = await request<unknown>(
    `/admin/project-knowledge/${id}${action === "delete" ? "" : `/${action}`}`,
    { method: action === "delete" ? "DELETE" : "PATCH", signal },
  );
  if (action === "delete") {
    if (response !== undefined)
      throw new KnowledgeInputError("项目知识删除回执异常，请读取核对");
    return;
  }
  const result = parseKnowledge(response, id);
  if (result.status !== (action === "publish" ? "published" : "withdrawn"))
    throw new KnowledgeInputError("项目知识状态回执不匹配，请读取核对");
  return result;
}
export async function readKnowledgeReview(
  request: KnowledgeRequest,
  user: KnowledgeOperator,
  mutations: readonly KnowledgeMutation[],
  signal: AbortSignal,
) {
  const summaries: string[] = [];
  for (const mutation of mutations) {
    signal.throwIfAborted();
    if (mutation.action === "create") {
      const data = await readKnowledgePage(
        request,
        user,
        { page: 1, keyword: mutation.title.slice(0, 100) },
        signal,
      );
      summaries.push(
        `新建候选${data.total}条（最多前20条）：${data.items.map((item) => `#${item.projectKnowledgeId} ${item.title}`).join("；") || "无候选"}。请人工核对，搜索不证明创建成功。`,
      );
    } else {
      try {
        const item = await readKnowledge(
          request,
          user,
          mutation.projectKnowledgeId,
          signal,
        );
        summaries.push(
          `#${item.projectKnowledgeId} ${item.title}：${item.status}，版本${item.version}`,
        );
      } catch (cause) {
        if (!(cause instanceof ApiError) || cause.status !== 404) throw cause;
        signal.throwIfAborted();
        summaries.push(
          `#${mutation.projectKnowledgeId}不存在或无权读取，404不证明删除成功`,
        );
      }
    }
  }
  signal.throwIfAborted();
  return summaries;
}
