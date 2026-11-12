import type { components } from "@common/api-contracts/openapi";
import { ApiError } from "@common/api-contracts/client";
import { parseCurrentUser } from "@/platform/auth/session-model";

export type Moderator = components["schemas"]["CurrentUserVO"];
export type AdminDynamic = components["schemas"]["AdminDynamicVO"];
export type AdminComment = components["schemas"]["AdminCommentVO"];
export type DynamicPage = components["schemas"]["AdminDynamicPageVO"];
export type CommentPage = components["schemas"]["AdminCommentPageVO"];
export type DynamicAction =
  components["schemas"]["DynamicModerationDto"]["action"];
export type CommentAction =
  components["schemas"]["CommentModerationDto"]["action"];
export type ModerationTarget =
  | { kind: "dynamic"; item: AdminDynamic; action: DynamicAction | "delete" }
  | {
      kind: "comment";
      item: AdminComment;
      action: CommentAction | "delete";
      page: number;
    };
export type ModerationMutation = {
  kind: "dynamic" | "comment";
  dynamicId: number;
  targetId: number;
  action: DynamicAction | "delete";
  page?: number;
};
export class ModerationInputError extends Error {}
export function moderationId(value: string) {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isInteger(id) && id <= 2_147_483_647 ? id : null;
}
export function canModerate(user: Moderator) {
  return (
    moderationId(String(user.userId)) !== null &&
    user.permissionKeys.includes("management:portal:enter") &&
    user.permissionKeys.includes("content:dynamic:moderate")
  );
}
export function moderatorKey(user: Moderator) {
  return JSON.stringify([
    user.userId,
    user.account,
    user.merchant?.merchantId ?? null,
    [...new Set(user.permissionKeys)].sort(),
    user.roles.map((role) => role.roleKey).sort(),
  ]);
}
export function verifyModerator(currentValue: unknown, expectedValue: unknown) {
  let current: Moderator, expected: Moderator;
  try {
    current = parseCurrentUser(currentValue);
    expected = parseCurrentUser(expectedValue);
  } catch {
    throw new ModerationInputError("身份或社区审核授权已变化，请重新读取身份");
  }
  if (!canModerate(current) || moderatorKey(current) !== moderatorKey(expected))
    throw new ModerationInputError("身份或社区审核授权已变化，请重新读取身份");
}
export function moderationPage(page: number) {
  if (!Number.isInteger(page) || page < 1 || page > 107_374_183)
    throw new ModerationInputError("页码无效");
  return new URLSearchParams({ page: String(page), pageSize: "20" });
}
export function dynamicListPath(query: {
  page: number;
  keyword?: string;
  status?: AdminDynamic["status"];
}) {
  if (query.keyword !== undefined && typeof query.keyword !== "string")
    throw new ModerationInputError("搜索条件无效");
  const params = moderationPage(query.page),
    keyword = query.keyword?.trim() ?? "";
  if (
    keyword.length > 100 ||
    (query.status !== undefined &&
      !["pending", "published", "hidden"].includes(query.status))
  )
    throw new ModerationInputError("搜索条件无效");
  if (keyword) params.set("keyword", keyword);
  if (query.status) params.set("status", query.status);
  return `/admin/dynamics?${params}`;
}
export function dynamicActions(
  status: AdminDynamic["status"],
): DynamicAction[] {
  if (status === "pending") return ["approve", "hide"];
  if (status === "published") return ["hide"];
  if (status === "hidden") return ["restore"];
  throw new ModerationInputError("动态状态无效，请刷新");
}
export function commentActions(
  status: AdminComment["status"],
): CommentAction[] {
  if (status === "visible") return ["hide"];
  if (status === "hidden") return ["restore"];
  throw new ModerationInputError("评论状态无效，请刷新");
}
export const actionLabels = {
  approve: "通过并公开",
  hide: "隐藏",
  restore: "恢复公开",
  delete: "软删除",
} as const;
export const dynamicLabels = {
  pending: "待审核",
  published: "已公开",
  hidden: "已隐藏",
} as const;
export function moderationBody(action: DynamicAction, reason: string) {
  if (
    !["approve", "hide", "restore"].includes(action) ||
    typeof reason !== "string" ||
    reason.length > 500
  )
    throw new ModerationInputError("审核动作或原因无效，原因最多500字符");
  const trimmed = reason.trim();
  return { action, ...(trimmed ? { reason: trimmed } : {}) };
}
export function mutationFor(target: ModerationTarget): ModerationMutation {
  return {
    kind: target.kind,
    dynamicId: target.item.dynamicId,
    targetId:
      target.kind === "dynamic" ? target.item.dynamicId : target.item.commentId,
    action: target.action,
    ...(target.kind === "comment" ? { page: target.page } : {}),
  };
}
// Signed image URLs expire/change independently of the moderated content.
export function dynamicFingerprint(item: AdminDynamic) {
  return JSON.stringify([
    item.dynamicId,
    item.authorId,
    item.content,
    item.resortId,
    item.status,
    item.updatedAt,
    item.moderatedAt,
    item.moderatedByUserId,
    item.moderationReason,
  ]);
}
export function commentFingerprint(item: AdminComment) {
  return JSON.stringify([
    item.commentId,
    item.dynamicId,
    item.authorId,
    item.content,
    item.status,
    item.createdAt,
    item.moderatedAt,
    item.moderatedByUserId,
    item.moderationReason,
  ]);
}
export function moderationError(cause: unknown) {
  const message =
    cause instanceof ModerationInputError
      ? cause.message
      : cause instanceof ApiError && cause.status === 403
        ? "当前身份没有社区审核权限"
        : cause instanceof ApiError && cause.status === 404
          ? "内容不存在或无权读取，请刷新核对"
          : cause instanceof ApiError && cause.status === 409
            ? "状态已变化，请刷新核对后操作"
            : cause instanceof ApiError && [400, 422].includes(cause.status)
              ? "审核请求被拒绝，请核对内容"
              : "社区审核暂时不可用，请稍后重试";
  return cause instanceof ApiError && cause.traceId
    ? `${message}（traceId: ${cause.traceId}）`
    : message;
}
