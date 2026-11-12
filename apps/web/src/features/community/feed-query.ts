import type { components } from "@common/api-contracts/openapi";
import { apiRequest } from "@/platform/api";
import { readAnonymousPublic } from "@/features/public-content/public-read";
import { projectDynamicFeed } from "@/features/public-content/public-directory-response";

export type FeedSearch = Record<string, string | string[] | undefined>;
export type FeedFilters = { keyword: string; cursor: string };
export type Feed = components["schemas"]["DynamicFeedVO"];
export type FeedState =
  | { status: "invalid"; message: string }
  | { status: "error"; query: string }
  | { status: "ready"; query: string; data: Feed };
export function readFeedFilters(search: FeedSearch): FeedFilters {
  const first = (value: string | string[] | undefined) =>
    (Array.isArray(value) ? value[0] : value) ?? "";
  return { keyword: first(search.keyword), cursor: first(search.cursor) };
}
export function buildFeedQuery(filters: FeedFilters) {
  if (filters.keyword.length > 200) throw new Error("搜索词不能超过 200 字符");
  if (
    filters.cursor &&
    (filters.cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(filters.cursor))
  )
    throw new Error("动态游标无效，请返回最新动态");
  const query = new URLSearchParams({ limit: "12" });
  if (filters.keyword.trim()) query.set("keyword", filters.keyword.trim());
  if (filters.cursor) query.set("cursor", filters.cursor);
  return query;
}
export function feedHref(
  query: string,
  cursor?: string | null,
): `/dynamics?${string}` {
  const params = new URLSearchParams(query);
  params.delete("cursor");
  if (cursor) params.set("cursor", cursor);
  return `/dynamics?${params}`;
}
export async function loadFeed(
  filters: FeedFilters,
  request: typeof apiRequest = apiRequest,
): Promise<FeedState> {
  let query: URLSearchParams;
  try {
    query = buildFeedQuery(filters);
  } catch (cause) {
    return {
      status: "invalid",
      message: cause instanceof Error ? cause.message : "搜索条件无效",
    };
  }
  try {
    return {
      status: "ready",
      query: query.toString(),
      data: projectDynamicFeed(
        await readAnonymousPublic<unknown>(`/dynamics?${query}`, request),
        filters.cursor,
      ),
    };
  } catch {
    return { status: "error", query: query.toString() };
  }
}
