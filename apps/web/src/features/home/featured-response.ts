export {
  projectResortCard as featuredResort,
  projectArticleSummary as featuredArticle,
  projectDynamicCard as featuredDynamic,
} from "@/features/public-content/public-card-response";

export function featuredItems<T>(
  value: unknown,
  parse: (value: unknown) => T,
  key: (item: T) => number,
  limit = 3,
): T[] {
  if (
    !value ||
    typeof value !== "object" ||
    !("items" in value) ||
    !Array.isArray(value.items) ||
    value.items.length > limit
  )
    throw new TypeError("Invalid featured content response");
  const result = Array.from(value.items, parse);
  if (new Set(result.map(key)).size !== result.length)
    throw new TypeError("Invalid featured content response");
  return result;
}
