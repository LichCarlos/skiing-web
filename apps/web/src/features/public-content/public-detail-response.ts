import type { components } from "@common/api-contracts/openapi";
import {
  projectResortCard,
  projectArticleSummary,
  projectDynamicCard,
  projectPublicImage,
  projectPublicTime,
  projectCommunityAuthor,
} from "@/features/public-content/public-card-response";
function invalid(): never {
  throw new TypeError("Invalid public detail response");
}
function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string") invalid();
  return value;
}
function nullableText(value: unknown): string | null {
  return value === null ? null : text(value);
}
function coordinate(value: unknown, limit: number): number | null {
  if (value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    Math.abs(value) > limit
  )
    invalid();
  return value;
}
function pictures(value: unknown): string[] {
  if (!Array.isArray(value)) invalid();
  return Array.from(value, (value) => {
    const url = projectPublicImage(value);
    if (!url) invalid();
    return url;
  });
}
function officialUrl(value: unknown): string | null {
  if (value === null) return null;
  const result = text(value);
  let url: URL;
  try {
    url = new URL(result);
  } catch {
    invalid();
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    result.includes("\\")
  )
    invalid();
  return result;
}
export function projectResortDetail(
  value: unknown,
): components["schemas"]["PublicResortDetailVO"] {
  const item = row(value),
    base = projectResortCard(item),
    snow = row(item.snowCondition);
  if (typeof snow.value !== "string" || typeof snow.label !== "string")
    invalid();
  if (
    new Set(base.fitTags.map((tag) => tag.value)).size !==
      base.fitTags.length ||
    new Set(base.customFields.map((field) => field.fieldKey)).size !==
      base.customFields.length
  )
    invalid();
  return {
    ...base,
    address: nullableText(item.address),
    longitude: coordinate(item.longitude, 180),
    latitude: coordinate(item.latitude, 90),
    description: text(item.description),
    galleryUrls: pictures(item.galleryUrls),
    snowCondition: {
      value: snow.value,
      label: snow.label,
      verifiedAt:
        snow.verifiedAt === null ? null : projectPublicTime(snow.verifiedAt),
    },
    openingHours: nullableText(item.openingHours),
    trailSummary: nullableText(item.trailSummary),
    facilitySummary: nullableText(item.facilitySummary),
    officialUrl: officialUrl(item.officialUrl),
    updatedAt: projectPublicTime(item.updatedAt),
  };
}
export function projectArticleDetail(
  value: unknown,
): components["schemas"]["PublicArticleDetailVO"] {
  const item = row(value);
  if (
    item.contentFormat !== undefined &&
    item.contentFormat !== "plain_text" &&
    item.contentFormat !== "markdown_v1"
  )
    invalid();
  const bodyAssets =
    item.bodyAssets === undefined
      ? undefined
      : projectBodyAssets(item.bodyAssets);
  return {
    ...projectArticleSummary(item),
    body: text(item.body),
    ...(item.contentFormat !== undefined
      ? { contentFormat: item.contentFormat as "plain_text" | "markdown_v1" }
      : {}),
    ...(bodyAssets !== undefined ? { bodyAssets } : {}),
  };
}
export function projectDynamicDetail(
  value: unknown,
): components["schemas"]["DynamicDetailVO"] {
  const item = row(value),
    base = projectDynamicCard(item),
    imageUrls = pictures(item.imageUrls);
  if (imageUrls.length !== base.imageCount) invalid();
  return {
    ...base,
    content: text(item.content),
    ...(item.contentFormat !== undefined
      ? { contentFormat: contentFormat(item.contentFormat) }
      : {}),
    ...(item.bodyAssets !== undefined
      ? { bodyAssets: projectBodyAssets(item.bodyAssets) }
      : {}),
    ...(item.version !== undefined
      ? { version: positiveId(item.version) }
      : {}),
    imageUrls,
    updatedAt: projectPublicTime(item.updatedAt),
  };
}
export function projectCommentPage(
  value: unknown,
  expectedPage: number,
): components["schemas"]["CommentPageVO"] {
  const item = row(value);
  if (
    !Array.isArray(item.items) ||
    item.items.length > 20 ||
    item.page !== expectedPage ||
    item.pageSize !== 20 ||
    typeof item.total !== "number" ||
    !Number.isSafeInteger(item.total) ||
    item.total < 0 ||
    item.hasNext !== expectedPage * 20 < item.total ||
    item.items.length > item.total
  )
    invalid();
  const items = Array.from(
    item.items,
    (value): components["schemas"]["CommentVO"] => {
      const item = row(value);
      if (
        typeof item.commentId !== "number" ||
        !Number.isSafeInteger(item.commentId) ||
        item.commentId < 1 ||
        item.commentId > 2147483647 ||
        item.status !== "visible"
      )
        invalid();
      return {
        commentId: item.commentId,
        author: projectCommunityAuthor(item.author),
        content: text(item.content),
        status: "visible",
        createdAt: projectPublicTime(item.createdAt),
      };
    },
  );
  if (new Set(items.map((comment) => comment.commentId)).size !== items.length)
    invalid();
  return {
    items,
    page: expectedPage,
    pageSize: 20,
    total: item.total,
    hasNext: expectedPage * 20 < item.total,
  };
}

function projectBodyAssets(value: unknown): { assetId: string; url: string }[] {
  if (!Array.isArray(value)) invalid();
  const items = value.map((value) => {
    const item = row(value);
    if (
      typeof item.assetId !== "string" ||
      !/^[1-9]\d{0,18}$/.test(item.assetId) ||
      BigInt(item.assetId) > 9223372036854775807n ||
      typeof item.url !== "string"
    )
      invalid();
    const href = new URL(item.url);
    if (
      !["http:", "https:"].includes(href.protocol) ||
      href.username ||
      href.password
    )
      invalid();
    return { assetId: item.assetId, url: item.url };
  });
  if (new Set(items.map((i) => i.assetId)).size !== items.length) invalid();
  return items;
}

function contentFormat(value: unknown): "plain_text" | "markdown_v1" {
  if (value !== "plain_text" && value !== "markdown_v1") invalid();
  return value;
}
function positiveId(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 2147483647
  )
    invalid();
  return value;
}
