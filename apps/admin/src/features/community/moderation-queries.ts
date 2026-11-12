import { ApiError, type ApiRequestOptions } from "@common/api-contracts/client";
import {
  parseAdminDynamic,
  parseDynamicPage,
  parseCommentPage,
  parseModerationReceipt,
} from "@/features/community/moderation-responses";
import {
  verifyModerator,
  moderationId,
  moderationPage,
  dynamicListPath,
  dynamicFingerprint,
  commentFingerprint,
  dynamicActions,
  commentActions,
  moderationBody,
  ModerationInputError,
  type Moderator,
  type ModerationTarget,
  type ModerationMutation,
} from "@/features/community/moderation-model";
export type ModerationRequest = <T>(
  path: string,
  options?: ApiRequestOptions,
) => Promise<T>;
export async function verifyModerationReader(
  request: ModerationRequest,
  user: Moderator,
  signal: AbortSignal,
) {
  verifyModerator(user, user);
  signal.throwIfAborted();
  const current = await request<Moderator>("/auth/me", {
    signal,
    cache: "no-store",
  });
  signal.throwIfAborted();
  verifyModerator(current, user);
}
function assertId(id: number) {
  if (moderationId(String(id)) === null)
    throw new ModerationInputError("内容编号无效");
}
export async function readDynamic(
  request: ModerationRequest,
  user: Moderator,
  id: number,
  signal: AbortSignal,
) {
  assertId(id);
  await verifyModerationReader(request, user, signal);
  const response = await withMissingIdentity(request, user, signal, () =>
    request<unknown>(`/admin/dynamics/${id}`, {
      signal,
      cache: "no-store",
    }),
  );
  signal.throwIfAborted();
  const item = parseAdminDynamic(response, id);
  await verifyModerationReader(request, user, signal);
  return item;
}
export async function readDynamicPage(
  request: ModerationRequest,
  user: Moderator,
  query: Parameters<typeof dynamicListPath>[0],
  signal: AbortSignal,
) {
  const path = dynamicListPath(query);
  await verifyModerationReader(request, user, signal);
  const response = await request<unknown>(path, { signal, cache: "no-store" });
  signal.throwIfAborted();
  const data = parseDynamicPage(response, query.page, query.status);
  await verifyModerationReader(request, user, signal);
  return data;
}
export async function readCommentPage(
  request: ModerationRequest,
  user: Moderator,
  id: number,
  page: number,
  signal: AbortSignal,
) {
  assertId(id);
  const query = moderationPage(page);
  await verifyModerationReader(request, user, signal);
  const response = await withMissingIdentity(request, user, signal, () =>
    request<unknown>(`/admin/dynamics/${id}/comments?${query}`, {
      signal,
      cache: "no-store",
    }),
  );
  signal.throwIfAborted();
  const data = parseCommentPage(response, id, page);
  await verifyModerationReader(request, user, signal);
  return data;
}
export async function prepareModeration(
  request: ModerationRequest,
  user: Moderator,
  target: ModerationTarget,
  reason: string,
  signal: AbortSignal,
) {
  const body =
    target.action === "delete"
      ? undefined
      : moderationBody(target.action, reason);
  if (target.kind === "dynamic") {
    const latest = await readDynamic(
      request,
      user,
      target.item.dynamicId,
      signal,
    );
    if (
      dynamicFingerprint(latest) !== dynamicFingerprint(target.item) ||
      (target.action !== "delete" &&
        !dynamicActions(latest.status).includes(target.action))
    )
      throw new ModerationInputError("动态内容或状态已变化，请刷新后重新选择");
  } else {
    assertId(target.item.commentId);
    const page = await readCommentPage(
      request,
      user,
      target.item.dynamicId,
      target.page,
      signal,
    );
    const latest = page.items.find(
      (item) => item.commentId === target.item.commentId,
    );
    if (
      !latest ||
      commentFingerprint(latest) !== commentFingerprint(target.item) ||
      (target.action !== "delete" &&
        !commentActions(latest.status).includes(target.action))
    )
      throw new ModerationInputError(
        "评论内容、状态或所在分页已变化，请刷新后重新选择",
      );
  }
  return body;
}
export async function sendModeration(
  request: ModerationRequest,
  mutation: ModerationMutation,
  body: ReturnType<typeof moderationBody> | undefined,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  assertId(mutation.targetId);
  assertId(mutation.dynamicId);
  if (mutation.kind === "dynamic" && mutation.targetId !== mutation.dynamicId)
    throw new ModerationInputError("动态资料不匹配");
  const path = `/admin/${mutation.kind === "dynamic" ? "dynamics" : "comments"}/${mutation.targetId}`;
  if (mutation.action === "delete") {
    parseModerationReceipt(
      await request(path, { method: "DELETE", signal }),
      mutation,
    );
    return;
  }
  if (
    !body ||
    body.action !== mutation.action ||
    (mutation.kind === "comment" && mutation.action === "approve")
  )
    throw new ModerationInputError("审核动作不匹配");
  const result = await request<unknown>(`${path}/moderation`, {
    method: "PATCH",
    body,
    signal,
  });
  parseModerationReceipt(result, mutation);
}
export async function reviewModeration(
  request: ModerationRequest,
  user: Moderator,
  mutations: readonly ModerationMutation[],
  signal: AbortSignal,
) {
  const summaries: string[] = [];
  for (const item of mutations) {
    signal.throwIfAborted();
    try {
      if (item.kind === "dynamic") {
        const record = await readDynamic(request, user, item.dynamicId, signal);
        summaries.push(
          `动态 #${record.dynamicId} 当前为${record.status}，更新于${record.updatedAt}，请人工核对`,
        );
      } else {
        const page = await readCommentPage(
          request,
          user,
          item.dynamicId,
          item.page ?? 1,
          signal,
        );
        const record = page.items.find(
          (row) => row.commentId === item.targetId,
        );
        summaries.push(
          record
            ? `评论 #${record.commentId} 当前为${record.status}，请人工核对`
            : `评论 #${item.targetId}未出现在原分页，可能发生分页移动，不能据此认定已删除`,
        );
      }
    } catch (cause) {
      if (!(cause instanceof ApiError) || cause.status !== 404) throw cause;
      signal.throwIfAborted();
      summaries.push(
        `内容 #${item.targetId}不存在或无权读取，404不证明删除成功`,
      );
    }
  }
  return summaries;
}
async function withMissingIdentity<T>(
  request: ModerationRequest,
  user: Moderator,
  signal: AbortSignal,
  read: () => Promise<T>,
): Promise<T> {
  try {
    return await read();
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 404)
      await verifyModerationReader(request, user, signal);
    throw cause;
  }
}
