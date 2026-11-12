import type { components } from "@common/api-contracts/openapi";
import { apiRequest } from "@/platform/api";
import {
  featuredItems,
  featuredResort,
  featuredArticle,
  featuredDynamic,
} from "@/features/home/featured-response";

export type FeaturedSection<T> =
  { status: "ready"; items: T[] } | { status: "unavailable" };

export type FeaturedContent = {
  resorts: FeaturedSection<components["schemas"]["PublicResortCardVO"]>;
  articles: FeaturedSection<components["schemas"]["PublicArticleSummaryVO"]>;
  dynamics: FeaturedSection<components["schemas"]["DynamicCardVO"]>;
};

async function loadSection<T>(
  path: string,
  parse: (value: unknown) => T,
  key: (item: T) => number,
  limit = 3,
): Promise<FeaturedSection<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const result = await apiRequest<unknown>(path, {
      cache: "no-store",
      credentials: "omit",
      skipAuthRefresh: true,
      signal: controller.signal,
    });
    return { status: "ready", items: featuredItems(result, parse, key, limit) };
  } catch {
    return { status: "unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function loadFeaturedContent(): Promise<FeaturedContent> {
  const [resorts, articles, dynamics] = await Promise.all([
    loadSection<components["schemas"]["PublicResortCardVO"]>(
      "/resorts?page=1&pageSize=5&sortBy=rating&sortOrder=desc",
      featuredResort,
      (item) => item.resortId,
      5,
    ),
    loadSection<components["schemas"]["PublicArticleSummaryVO"]>(
      "/articles?page=1&pageSize=3",
      featuredArticle,
      (item) => item.articleId,
    ),
    loadSection<components["schemas"]["DynamicCardVO"]>(
      "/dynamics?limit=3",
      featuredDynamic,
      (item) => item.dynamicId,
    ),
  ]);
  return { resorts, articles, dynamics };
}
