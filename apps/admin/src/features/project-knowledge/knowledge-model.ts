import type { components } from "@common/api-contracts/openapi";
import { ApiError } from "@common/api-contracts/client";
import { parseCurrentUser } from "@/platform/auth/session-model";
export type KnowledgeOperator = components["schemas"]["CurrentUserVO"];
export type Knowledge = components["schemas"]["ProjectKnowledgeVO"];
export type KnowledgePage = components["schemas"]["ProjectKnowledgePageVO"];
export type KnowledgeInput = components["schemas"]["ProjectKnowledgeWriteDto"];
export type KnowledgeUpdate =
  components["schemas"]["UpdateProjectKnowledgeDto"];
export type KnowledgeAction =
  "list" | "create" | "update" | "publish" | "withdraw" | "delete";
export type KnowledgeCommand = "publish" | "withdraw" | "delete";
export type KnowledgeMutation =
  | { action: "create"; title: string }
  | {
      action: "update" | KnowledgeCommand;
      projectKnowledgeId: number;
    };
export class KnowledgeInputError extends Error {}

export function knowledgeId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isInteger(id) && id <= 2_147_483_647 ? id : null;
}
export function canManageKnowledge(
  user: KnowledgeOperator,
  action: KnowledgeAction,
) {
  return (
    knowledgeId(String(user.userId)) !== null &&
    user.roles.length === 1 &&
    user.roles[0]?.roleKey === "system_admin" &&
    user.permissionKeys.includes("management:portal:enter") &&
    user.permissionKeys.includes(`content:project-knowledge:${action}`)
  );
}
export function knowledgeWorkspaceKey(user: KnowledgeOperator) {
  return JSON.stringify([
    user.userId,
    user.account,
    user.merchant?.merchantId ?? null,
    [...new Set(user.permissionKeys)].sort(),
    user.roles.map((role) => role.roleKey).sort(),
  ]);
}
export function verifyKnowledgeOperator(
  currentValue: unknown,
  expectedValue: unknown,
  action: KnowledgeAction = "list",
) {
  let current: KnowledgeOperator, expected: KnowledgeOperator;
  try {
    current = parseCurrentUser(currentValue);
    expected = parseCurrentUser(expectedValue);
  } catch {
    throw new KnowledgeInputError("身份或项目知识授权已变化，请重新读取身份");
  }
  if (
    !canManageKnowledge(current, action) ||
    knowledgeWorkspaceKey(current) !== knowledgeWorkspaceKey(expected)
  )
    throw new KnowledgeInputError("身份或项目知识授权已变化，请重新读取身份");
}
export function knowledgePath(query: {
  page: number;
  keyword?: string;
  status?: Knowledge["status"];
}) {
  if (query.keyword !== undefined && typeof query.keyword !== "string")
    throw new KnowledgeInputError("页码、关键词或状态无效");
  const keyword = query.keyword?.trim() ?? "";
  if (
    !Number.isInteger(query.page) ||
    query.page < 1 ||
    query.page > 107_374_183 ||
    keyword.length > 100 ||
    (query.status !== undefined &&
      !["draft", "published", "withdrawn"].includes(query.status))
  )
    throw new KnowledgeInputError("页码、关键词或状态无效");
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: "20",
  });
  if (keyword) params.set("keyword", keyword);
  if (query.status) params.set("status", query.status);
  return `/admin/project-knowledge?${params}`;
}
export function knowledgeInput(
  values: KnowledgeInput,
  version?: number,
): KnowledgeInput | KnowledgeUpdate {
  for (const [value, max] of [
    [values.title, 200],
    [values.content, 100000],
    [values.category, 80],
  ] as const)
    if (typeof value !== "string" || !value.trim() || value.length > max)
      throw new KnowledgeInputError("请填写有效的标题、分类和正文");
  let sourceUrl: string | null = null;
  if (
    values.sourceUrl !== undefined &&
    values.sourceUrl !== null &&
    values.sourceUrl !== ""
  ) {
    if (typeof values.sourceUrl !== "string")
      throw new KnowledgeInputError("来源链接必须为字符串");
    sourceUrl = values.sourceUrl.trim() || null;
    if (sourceUrl) {
      let url: URL;
      try {
        url = new URL(sourceUrl);
      } catch {
        throw new KnowledgeInputError("请输入有效的HTTP(S)来源链接");
      }
      if (
        sourceUrl.length > 2048 ||
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new KnowledgeInputError(
          "来源链接仅允许不含账号密码的HTTP(S)地址",
        );
    }
  }
  if (version !== undefined && knowledgeId(String(version)) === null)
    throw new KnowledgeInputError("项目知识版本无效，请刷新资料");
  return {
    title: values.title,
    content: values.content,
    category: values.category,
    sourceUrl,
    ...(version === undefined ? {} : { version }),
  };
}
export function assertKnowledgeCommand(
  item: Knowledge,
  action: KnowledgeCommand,
) {
  if (
    action === "delete" ||
    (action === "publish" && ["draft", "withdrawn"].includes(item.status)) ||
    (action === "withdraw" && item.status === "published")
  )
    return;
  throw new KnowledgeInputError("项目知识状态已变化，请刷新核对");
}
export function knowledgeError(cause: unknown) {
  const message =
    cause instanceof KnowledgeInputError
      ? cause.message
      : cause instanceof ApiError && cause.status === 403
        ? "当前身份没有所需项目知识权限"
        : cause instanceof ApiError && cause.status === 404
          ? "项目知识不存在或无权读取"
          : cause instanceof ApiError && cause.status === 409
            ? "内容已变化，请保留当前修改并刷新最新版本"
            : cause instanceof ApiError && [400, 422].includes(cause.status)
              ? "内容被拒绝，请核对文本、来源链接和敏感信息规则"
              : "项目知识操作暂时不可用，请稍后重试";
  return cause instanceof ApiError && cause.traceId
    ? `${message}（traceId: ${cause.traceId}）`
    : message;
}
