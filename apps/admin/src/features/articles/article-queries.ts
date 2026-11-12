import { ApiError, type ApiRequestOptions } from "@common/api-contracts/client";
import {
  articleIdFromSegment,
  articleListPath,
  ArticleInputError,
  articleInput,
  assertArticleCommand,
  verifyArticleOperator,
  type ArticleMutation,
  type ArticleOperator,
  type ManagedArticle,
  type ArticleCommand,
  type ArticleInput,
} from "@/features/articles/article-model";
import type { ArticleFieldSchema } from "@/features/articles/article-field-model";
import { loadArticleFormData } from "@/features/articles/article-form-loader";
import {
  parseManagedArticle,
  parseArticlePage,
  parseArticleFieldSchema,
} from "@/features/articles/article-responses";

export type ArticleRequest = <T>(
  path: string,
  options?: ApiRequestOptions,
) => Promise<T>;

export async function verifyArticleReader(
  request: ArticleRequest,
  user: ArticleOperator,
  signal: AbortSignal,
) {
  verifyArticleOperator(user, user);
  signal.throwIfAborted();
  const current = await request<unknown>("/auth/me", {
    signal,
    cache: "no-store",
  });
  signal.throwIfAborted();
  verifyArticleOperator(current, user);
}

export async function readArticle(
  request: ArticleRequest,
  user: ArticleOperator,
  articleId: number,
  signal: AbortSignal,
) {
  if (articleIdFromSegment(String(articleId)) === null)
    throw new ArticleInputError("文章编号无效");
  await verifyArticleReader(request, user, signal);
  let response: unknown;
  try {
    response = await request<unknown>(`/admin/articles/${articleId}`, {
      signal,
      cache: "no-store",
    });
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 404)
      await verifyArticleReader(request, user, signal);
    throw cause;
  }
  signal.throwIfAborted();
  const article = parseManagedArticle(response, articleId);
  await verifyArticleReader(request, user, signal);
  return article;
}

export async function readArticlePage(
  request: ArticleRequest,
  user: ArticleOperator,
  query: Parameters<typeof articleListPath>[0],
  signal: AbortSignal,
) {
  const path = articleListPath(query);
  await verifyArticleReader(request, user, signal);
  const response = await request<unknown>(path, {
    signal,
    cache: "no-store",
  });
  signal.throwIfAborted();
  const result = parseArticlePage(response, query.page, query.status);
  await verifyArticleReader(request, user, signal);
  return result;
}

export async function readArticleForm(
  request: ArticleRequest,
  user: ArticleOperator,
  id: number | undefined,
  signal: AbortSignal,
) {
  if (id !== undefined && articleIdFromSegment(String(id)) === null)
    throw new ArticleInputError("文章编号无效");
  await verifyArticleReader(request, user, signal);
  const data = await loadArticleFormData(
    (path, options) => request(path, { ...options, cache: "no-store" }),
    id,
    signal,
  );
  signal.throwIfAborted();
  if (id !== undefined && data.article?.articleId !== id)
    throw new ArticleInputError("文章资料不匹配，请重新读取");
  await verifyArticleReader(request, user, signal);
  return data;
}

export async function readArticleReview(
  request: ArticleRequest,
  user: ArticleOperator,
  mutations: readonly ArticleMutation[],
  signal: AbortSignal,
) {
  const summaries: string[] = [];
  for (const mutation of mutations) {
    signal.throwIfAborted();
    if (mutation.action === "create") {
      const page = await readArticlePage(
        request,
        user,
        { page: 1, keyword: mutation.title.slice(0, 100) },
        signal,
      );
      summaries.push(
        `新建文章候选 ${page.total} 条（最多展示前20条），请按标题、作者和内容核对：${page.items.map((item) => `#${item.articleId} ${item.title}`).join("；") || "未找到候选。请继续核对文章列表，搜索结果不证明创建是否成功"}`,
      );
    } else {
      try {
        const item = await readArticle(
          request,
          user,
          mutation.articleId,
          signal,
        );
        summaries.push(
          `#${item.articleId} ${item.title}：${item.status}，版本 ${item.version}`,
        );
      } catch (cause) {
        if (!(cause instanceof ApiError) || cause.status !== 404) throw cause;
        signal.throwIfAborted();
        summaries.push(
          `#${mutation.articleId} 已不存在或超出数据范围；404不能证明删除成功`,
        );
      }
    }
  }
  signal.throwIfAborted();
  return summaries;
}

export async function prepareArticleSave(
  request: ArticleRequest,
  user: ArticleOperator,
  input: {
    article?: ManagedArticle;
    schema: ArticleFieldSchema;
    values: ArticleInput;
  },
  signal: AbortSignal,
) {
  if (input.article) {
    const latest = await readArticle(
      request,
      user,
      input.article.articleId,
      signal,
    );
    if (latest.version !== input.article.version)
      throw new ArticleInputError("文章版本已变化，请保留修改后刷新最新资料");
  } else await verifyArticleReader(request, user, signal);
  const schema = parseArticleFieldSchema(
    await request<unknown>("/admin/articles/custom-fields", {
      signal,
      cache: "no-store",
    }),
  );
  signal.throwIfAborted();
  if (
    JSON.stringify(schema) !==
    JSON.stringify(parseArticleFieldSchema(input.schema))
  )
    throw new ArticleInputError(
      "字段定义或读写权限已变化，请保留修改后刷新资料",
    );
  await verifyArticleReader(request, user, signal);
  return articleInput(
    {
      ...input.values,
      ...(input.article &&
      (input.values.contentFormat === "markdown_v1" ||
        input.article.contentFormat === "markdown_v1")
        ? { expectedVersion: input.article.version }
        : {}),
    },
    schema,
    input.article?.customFields ?? {},
  );
}

export async function saveManagedArticle(
  request: ArticleRequest,
  articleId: number | undefined,
  body: ArticleInput,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  if (
    articleId !== undefined &&
    articleIdFromSegment(String(articleId)) === null
  )
    throw new ArticleInputError("文章编号无效");
  const saved = parseManagedArticle(
    await request<unknown>(
      articleId ? `/admin/articles/${articleId}` : "/admin/articles",
      { method: articleId ? "PATCH" : "POST", body, signal },
    ),
    articleId,
  );
  return saved;
}

export async function prepareArticleCommand(
  request: ArticleRequest,
  user: ArticleOperator,
  articleId: number,
  action: ArticleCommand,
  signal: AbortSignal,
  expectedVersion?: number,
) {
  const current = await readArticle(request, user, articleId, signal);
  assertArticleCommand(current, action);
  if (expectedVersion !== undefined && current.version !== expectedVersion)
    throw new ArticleInputError("文章版本已变化，请刷新核对后操作");
  return current.articleId;
}

export async function sendArticleCommand(
  request: ArticleRequest,
  articleId: number,
  action: ArticleCommand,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  if (
    articleIdFromSegment(String(articleId)) === null ||
    !["publish", "withdraw", "delete"].includes(action)
  )
    throw new ArticleInputError("文章操作无效");
  const value = await request<unknown>(
    `/admin/articles/${articleId}${action === "delete" ? "" : `/${action}`}`,
    {
      method: action === "delete" ? "DELETE" : "PATCH",
      signal,
    },
  );
  if (action === "delete") return;
  const article = parseManagedArticle(value, articleId);
  if (article.status !== (action === "publish" ? "published" : "withdrawn"))
    throw new ArticleInputError("文章命令响应不匹配，请刷新核对");
  return article;
}
