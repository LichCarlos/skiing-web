import type { components } from "@common/api-contracts/openapi";

function invalid(): never {
  throw new TypeError("Invalid public content response");
}
function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string") invalid();
  return value;
}
function label(value: unknown): string {
  const result = text(value);
  if (!result.trim()) invalid();
  return result;
}
function nullableText(value: unknown): string | null {
  return value === null ? null : text(value);
}
function id(value: unknown): number {
  const result = count(value);
  if (result < 1 || result > 2147483647) invalid();
  return result;
}
function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    invalid();
  return value;
}
function numeric(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    invalid();
  return value;
}
function bool(value: unknown): boolean {
  if (typeof value !== "boolean") invalid();
  return value;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) invalid();
  return value;
}
export function projectPublicImage(value: unknown): string | null {
  const result = nullableText(value);
  if (!result) return result;
  if (result.includes("\\")) invalid();
  if (result.startsWith("/") && !result.startsWith("//")) return result;
  let url: URL;
  try {
    url = new URL(result);
  } catch {
    invalid();
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    invalid();
  return result;
}
export function projectPublicTime(value: unknown): string {
  const result = label(value);
  if (!Number.isFinite(Date.parse(result))) invalid();
  return result;
}
function category(value: unknown) {
  const item = row(value);
  return { value: label(item.value), label: label(item.label) };
}
function customField(
  value: unknown,
): components["schemas"]["PublicCustomFieldValueVO"] {
  const item = row(value),
    content = item.value;
  let projected: components["schemas"]["PublicCustomFieldValueVO"]["value"];
  if (
    content === null ||
    typeof content === "string" ||
    typeof content === "boolean"
  )
    projected = content;
  else if (typeof content === "number" && Number.isFinite(content))
    projected = content;
  else if (Array.isArray(content)) projected = Array.from(content, text);
  else invalid();
  return {
    fieldKey: label(item.fieldKey),
    label: label(item.label),
    value: projected,
  };
}

export function projectResortCard(
  value: unknown,
): components["schemas"]["PublicResortCardVO"] {
  const item = row(value),
    region = row(item.region);
  const rating = item.rating === null ? null : numeric(item.rating);
  if (rating !== null && rating > 5) invalid();
  const price = nullableText(item.startingPrice);
  if (price !== null && !/^\d+(?:\.\d+)?$/.test(price)) invalid();
  const openStatus = item.openStatus;
  if (
    openStatus !== "open" &&
    openStatus !== "closed" &&
    openStatus !== "limited" &&
    openStatus !== "unknown"
  )
    invalid();
  return {
    resortId: id(item.resortId),
    name: label(item.name),
    region: {
      province: text(region.province),
      city: text(region.city),
      district: nullableText(region.district),
    },
    coverUrl: projectPublicImage(item.coverUrl),
    rating,
    ratingCount: count(item.ratingCount),
    distanceMeters:
      item.distanceMeters === null ? null : numeric(item.distanceMeters),
    startingPrice: price,
    fitTags: Array.from(array(item.fitTags), category),
    openStatus,
    favoriteByMe: bool(item.favoriteByMe),
    customFields: Array.from(array(item.customFields), customField),
  };
}
export function projectArticleSummary(
  value: unknown,
): components["schemas"]["PublicArticleSummaryVO"] {
  const item = row(value);
  return {
    articleId: id(item.articleId),
    title: label(item.title),
    summary: text(item.summary),
    coverUrl: projectPublicImage(item.coverUrl),
    category: category(item.category),
    authorName: nullableText(item.authorName),
    publishTime: projectPublicTime(item.publishTime),
    favoriteByMe: bool(item.favoriteByMe),
  };
}
export function projectDynamicCard(
  value: unknown,
): components["schemas"]["DynamicCardVO"] {
  const item = row(value),
    author = row(item.author),
    resort = item.resort === null ? null : row(item.resort);
  const imageCount = count(item.imageCount);
  if (item.status !== "published") invalid();
  return {
    dynamicId: id(item.dynamicId),
    author: projectCommunityAuthor(author),
    summary: text(item.summary),
    coverUrl: projectPublicImage(item.coverUrl),
    imageCount,
    resort:
      resort === null
        ? null
        : { resortId: id(resort.resortId), name: label(resort.name) },
    likeCount: count(item.likeCount),
    commentCount: count(item.commentCount),
    likedByMe: bool(item.likedByMe),
    status: "published",
    createdAt: projectPublicTime(item.createdAt),
  };
}

export function projectCommunityAuthor(
  value: unknown,
): components["schemas"]["CommunityAuthorVO"] {
  const author = row(value);
  return {
    userId: id(author.userId),
    nickname: label(author.nickname),
    avatarUrl: nullableText(author.avatarUrl),
  };
}

export function projectPublicOptions(
  value: unknown,
): Array<{ value: string; label: string }> {
  const options = Array.from(array(value), category);
  if (new Set(options.map((option) => option.value)).size !== options.length)
    invalid();
  return options;
}
