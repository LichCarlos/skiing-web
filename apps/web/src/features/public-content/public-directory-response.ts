import type { components } from "@common/api-contracts/openapi";
import {
  projectResortCard,
  projectArticleSummary,
  projectDynamicCard,
} from "@/features/public-content/public-card-response";

function invalid(): never {
  throw new TypeError("Invalid public directory response");
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function items<T>(
  value: unknown,
  parse: (value: unknown) => T,
  key: (item: T) => number,
): T[] {
  if (!Array.isArray(value) || value.length > 12) invalid();
  const result = Array.from(value, parse);
  if (new Set(result.map(key)).size !== result.length) invalid();
  return result;
}
function page<T>(
  value: unknown,
  expectedPage: number,
  parse: (value: unknown) => T,
  key: (item: T) => number,
) {
  const data = record(value);
  if (
    data.page !== expectedPage ||
    data.pageSize !== 12 ||
    typeof data.total !== "number" ||
    !Number.isSafeInteger(data.total) ||
    data.total < 0 ||
    data.hasNext !== expectedPage * 12 < data.total
  )
    invalid();
  const projected = items(data.items, parse, key);
  if (projected.length > data.total) invalid();
  return {
    items: projected,
    page: expectedPage,
    pageSize: 12,
    total: data.total,
    hasNext: expectedPage * 12 < data.total,
  };
}
export function projectResortPage(
  value: unknown,
  expectedPage: number,
): components["schemas"]["PublicResortPageVO"] {
  return page(value, expectedPage, projectResortCard, (item) => item.resortId);
}
export function projectArticlePage(
  value: unknown,
  expectedPage: number,
): components["schemas"]["PublicArticlePageVO"] {
  return page(
    value,
    expectedPage,
    projectArticleSummary,
    (item) => item.articleId,
  );
}
export function projectDynamicFeed(
  value: unknown,
  currentCursor: string,
): components["schemas"]["DynamicFeedVO"] {
  const data = record(value);
  const projected = items(
    data.items,
    projectDynamicCard,
    (item) => item.dynamicId,
  );
  if (typeof data.hasNext !== "boolean") invalid();
  const cursor = data.nextCursor;
  if (data.hasNext) {
    if (
      !projected.length ||
      typeof cursor !== "string" ||
      !cursor ||
      cursor.length > 512 ||
      !/^[A-Za-z0-9_-]+$/.test(cursor) ||
      cursor === currentCursor
    )
      invalid();
  } else if (cursor !== null) invalid();
  return {
    items: projected,
    hasNext: data.hasNext,
    nextCursor: cursor as string | null,
  };
}
