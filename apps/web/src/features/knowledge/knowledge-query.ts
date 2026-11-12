import type { components } from "@common/api-contracts/openapi";
import { apiRequest } from "@/platform/api";
import { readAnonymousPublic } from "@/features/public-content/public-read";
import { projectArticlePage } from "@/features/public-content/public-directory-response";
import { projectPublicOptions } from "@/features/public-content/public-card-response";

export type KnowledgeSearch = Record<string, string | string[] | undefined>;
export type KnowledgeFilters = {
  keyword: string;
  categoryValue: string;
  page: string;
};
export type ArticlePage = components["schemas"]["PublicArticlePageVO"];
export type ArticleCategory = components["schemas"]["PublicArticleCategoryVO"];
export type KnowledgeState =
  | { status: "invalid"; message: string }
  | {
      status: "loaded";
      query: string;
      articles: ArticlePage | null;
      categories: ArticleCategory[] | null;
    };

export function readKnowledgeFilters(
  search: KnowledgeSearch,
): KnowledgeFilters {
  const first = (key: string) => {
    const value = search[key];
    return (Array.isArray(value) ? value[0] : value) ?? "";
  };
  return {
    keyword: first("keyword"),
    categoryValue: first("categoryValue"),
    page: first("page") || "1",
  };
}

export function buildKnowledgeQuery(
  filters: KnowledgeFilters,
): URLSearchParams {
  const query = new URLSearchParams();
  for (const key of ["keyword", "categoryValue"] as const) {
    const value = filters[key].trim();
    if (value.length > 100)
      throw new Error(
        key === "keyword"
          ? "关键词不能超过 100 字符"
          : "分类值不能超过 100 字符",
      );
    if (value) query.set(key, value);
  }
  const page = Number(filters.page);
  if (
    !/^\d+$/.test(filters.page) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    (page - 1) * 12 > 2147483647
  )
    throw new Error("页码无效，请返回第一页");
  query.set("page", String(page));
  query.set("pageSize", "12");
  return query;
}

export async function loadKnowledgeDirectory(
  filters: KnowledgeFilters,
  request: typeof apiRequest = apiRequest,
): Promise<KnowledgeState> {
  let query: URLSearchParams;
  try {
    query = buildKnowledgeQuery(filters);
  } catch (cause) {
    return {
      status: "invalid",
      message: cause instanceof Error ? cause.message : "筛选条件无效",
    };
  }
  const [articles, categories] = await Promise.allSettled([
    readAnonymousPublic<unknown>(`/articles?${query}`, request).then((value) =>
      projectArticlePage(value, Number(query.get("page"))),
    ),
    readAnonymousPublic<unknown>("/knowledge/categories", request).then(
      projectPublicOptions,
    ),
  ]);
  return {
    status: "loaded",
    query: query.toString(),
    articles: articles.status === "fulfilled" ? articles.value : null,
    categories: categories.status === "fulfilled" ? categories.value : null,
  };
}

export function knowledgePageHref(
  query: string,
  page: number,
): `/knowledge?${string}` {
  const params = new URLSearchParams(query);
  params.set("page", String(page));
  return `/knowledge?${params}`;
}
