import { inspectMarkdown } from "@common/ui";
import {
  allowedArticleLink,
  articleAssetReference,
} from "@/features/articles/article-content-links";
import type { components } from "@common/api-contracts/openapi";
import { ApiError } from "@common/api-contracts/client";
import { parseCurrentUser } from "@/platform/auth/session-model";
import {
  writableArticleChanges,
  type ArticleFieldSchema,
} from "@/features/articles/article-field-model";

export type ArticleOperator = components["schemas"]["CurrentUserVO"];
export type ManagedArticle = components["schemas"]["AdminArticleVO"];
export type ArticlePage = components["schemas"]["AdminArticlePageVO"];
export type ArticleListItem = ArticlePage["items"][number];
export type ArticleInput = components["schemas"]["UpsertArticleDto"];
export type ArticleStatus = ManagedArticle["status"];
export type ArticleCommand = "publish" | "withdraw" | "delete";
export type ArticleMutation =
  | { action: "create"; title: string }
  | { action: "save" | ArticleCommand; articleId: number };

export class ArticleInputError extends Error {}

export function articleIdFromSegment(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isInteger(id) && id <= 2_147_483_647 ? id : null;
}

export function canManageArticles(user: ArticleOperator): boolean {
  return (
    articleIdFromSegment(String(user.userId)) !== null &&
    ["management:portal:enter", "content:article:manage"].every((key) =>
      user.permissionKeys.includes(key),
    )
  );
}

export function articleWorkspaceKey(user: ArticleOperator): string {
  return JSON.stringify([
    user.userId,
    user.account,
    user.merchant?.merchantId ?? null,
    [...new Set(user.permissionKeys)].sort(),
    [...new Set(user.roles.map((role) => role.roleKey))].sort(),
  ]);
}

export function verifyArticleOperator(value: unknown, snapshot: unknown) {
  let current: ArticleOperator, expected: ArticleOperator;
  try {
    current = parseCurrentUser(value);
    expected = parseCurrentUser(snapshot);
  } catch {
    throw new ArticleInputError("身份或权限已变化，请重新读取身份后继续");
  }
  if (
    !canManageArticles(current) ||
    articleWorkspaceKey(current) !== articleWorkspaceKey(expected)
  )
    throw new ArticleInputError("身份或权限已变化，请重新读取身份后继续");
}

export function articleListPath(query: {
  page: number;
  keyword?: string;
  status?: ArticleStatus;
}): string {
  const keyword = query.keyword?.trim() ?? "";
  if (
    !Number.isInteger(query.page) ||
    query.page < 1 ||
    query.page > 107_374_183 ||
    keyword.length > 100 ||
    (query.status !== undefined &&
      !["draft", "published", "withdrawn"].includes(query.status))
  )
    throw new ArticleInputError("页码、关键词或状态无效，请重新筛选");
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: "20",
  });
  if (keyword) params.set("keyword", keyword);
  if (query.status) params.set("status", query.status);
  return `/admin/articles?${params}`;
}

export function articleInput(
  values: ArticleInput,
  schema: ArticleFieldSchema,
  original: Readonly<Record<string, unknown>>,
): ArticleInput {
  for (const [value, maximum] of [
    [values.title, 200],
    [values.summary, 1000],
    [values.body, 100000],
  ] as const)
    if (typeof value !== "string" || !value.trim() || value.length > maximum)
      throw new ArticleInputError("请填写有效的标题、摘要和正文");
  if (
    typeof values.categoryValue !== "string" ||
    !values.categoryValue.trim() ||
    values.categoryValue.length > 100
  )
    throw new ArticleInputError("请选择有效的文章分类");
  if (
    values.contentFormat !== undefined &&
    !["plain_text", "markdown_v1"].includes(values.contentFormat)
  )
    throw new ArticleInputError("正文格式无效");
  if (values.contentFormat === "markdown_v1") {
    const issue = inspectMarkdown(values.body, {
      image: articleAssetReference,
      link: allowedArticleLink,
    });
    if (issue) throw new ArticleInputError(issue);
  }
  const coverAssetId = values.coverAssetId ?? null;
  if (
    coverAssetId !== null &&
    (typeof coverAssetId !== "string" ||
      !/^[1-9]\d{0,18}$/.test(coverAssetId) ||
      BigInt(coverAssetId) > 9_223_372_036_854_775_807n)
  )
    throw new ArticleInputError("请选择有效的封面图片");
  if (
    values.customFields !== undefined &&
    (!values.customFields ||
      typeof values.customFields !== "object" ||
      Array.isArray(values.customFields))
  )
    throw new ArticleInputError("扩展字段必须为对象");
  return {
    title: values.title,
    summary: values.summary,
    body: values.body,
    ...(values.contentFormat !== undefined
      ? { contentFormat: values.contentFormat }
      : {}),
    ...(values.expectedVersion !== undefined
      ? { expectedVersion: values.expectedVersion }
      : {}),
    categoryValue: values.categoryValue,
    coverAssetId,
    customFields: writableArticleChanges(
      schema,
      values.customFields ?? {},
      original,
    ),
  };
}

export function assertArticleCommand(
  article: ManagedArticle,
  command: ArticleCommand,
) {
  const allowed =
    command === "delete" ||
    (command === "publish" &&
      ["draft", "withdrawn"].includes(article.status)) ||
    (command === "withdraw" && article.status === "published");
  if (!allowed) throw new ArticleInputError("文章状态已变化，请刷新后重新操作");
}

export function articleError(cause: unknown): string {
  const text =
    cause instanceof ArticleInputError
      ? cause.message
      : cause instanceof ApiError && cause.status === 403
        ? "当前账号无权操作该文章或读取所需字典，请核对权限和数据范围"
        : cause instanceof ApiError && cause.status === 404
          ? "文章已删除或不在当前数据范围内"
          : cause instanceof ApiError && cause.status === 409
            ? "文章或关联资料已变化，请刷新核对后重试"
            : cause instanceof ApiError && [400, 422].includes(cause.status)
              ? "提交被拒绝，请核对内容、分类、图片和扩展字段"
              : "文章操作暂时不可用，请稍后重试";
  return cause instanceof ApiError && cause.traceId
    ? `${text}（traceId: ${cause.traceId}）`
    : text;
}
