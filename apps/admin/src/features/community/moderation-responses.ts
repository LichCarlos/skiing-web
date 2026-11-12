import { safeContentUrl } from "@common/ui";
import {
  ModerationInputError,
  type AdminDynamic,
  type AdminComment,
  type DynamicPage,
  type CommentPage,
  type ModerationMutation,
} from "@/features/community/moderation-model";
function invalid(): never {
  throw new ModerationInputError("社区审核资料或分页不匹配，请刷新后核对");
}
function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function id(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 2147483647
  )
    invalid();
  return value;
}
function text(value: unknown): string {
  if (typeof value !== "string") invalid();
  return value;
}
function time(value: unknown): string {
  const result = text(value);
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(
      result,
    ) ||
    !Number.isFinite(Date.parse(result))
  )
    invalid();
  return result;
}
function state(value: unknown, statuses: readonly string[]) {
  if (typeof value !== "string" || !statuses.includes(value)) invalid();
  return value;
}
function moderation(source: Record<string, unknown>) {
  return {
    moderatedAt: source.moderatedAt === null ? null : time(source.moderatedAt),
    moderatedByUserId:
      source.moderatedByUserId === null ? null : id(source.moderatedByUserId),
    moderationReason:
      source.moderationReason === null ? null : text(source.moderationReason),
  };
}
export function parseAdminDynamic(
  value: unknown,
  expected?: number,
): AdminDynamic {
  const source = row(value),
    dynamicId = id(source.dynamicId);
  if (
    (expected !== undefined && expected !== dynamicId) ||
    !Array.isArray(source.imageUrls) ||
    source.imageUrls.length > 9
  )
    invalid();
  const imageUrls = source.imageUrls.map((value) => {
    const result = text(value);
    try {
      const url = new URL(result);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        invalid();
    } catch {
      invalid();
    }
    return result;
  });
  return {
    dynamicId,
    authorId: id(source.authorId),
    authorNickname: text(source.authorNickname),
    content: text(source.content),
    ...(source.contentFormat !== undefined
      ? { contentFormat: parseFormat(source.contentFormat) }
      : {}),
    ...(source.version !== undefined ? { version: id(source.version) } : {}),
    ...(source.bodyAssets !== undefined
      ? { bodyAssets: parseBodyAssets(source.bodyAssets) }
      : {}),
    resortId: source.resortId === null ? null : id(source.resortId),
    status: state(source.status, [
      "pending",
      "published",
      "hidden",
    ]) as AdminDynamic["status"],
    imageUrls,
    ...moderation(source),
    createdAt: time(source.createdAt),
    updatedAt: time(source.updatedAt),
  };
}
export function parseAdminComment(
  value: unknown,
  expectedDynamic?: number,
): AdminComment {
  const source = row(value),
    dynamicId = id(source.dynamicId);
  if (expectedDynamic !== undefined && dynamicId !== expectedDynamic) invalid();
  return {
    commentId: id(source.commentId),
    dynamicId,
    authorId: id(source.authorId),
    authorNickname: text(source.authorNickname),
    content: text(source.content),
    status: state(source.status, [
      "visible",
      "hidden",
    ]) as AdminComment["status"],
    ...moderation(source),
    createdAt: time(source.createdAt),
  };
}
function page<T>(
  value: unknown,
  expected: number,
  parse: (item: unknown) => T,
  key: (item: T) => number,
) {
  const source = row(value);
  if (
    source.page !== expected ||
    source.pageSize !== 20 ||
    typeof source.total !== "number" ||
    !Number.isSafeInteger(source.total) ||
    source.total < 0 ||
    !Array.isArray(source.items) ||
    source.items.length !==
      Math.min(20, Math.max(0, source.total - (expected - 1) * 20)) ||
    source.hasNext !== expected * 20 < source.total
  )
    invalid();
  const items = source.items.map(parse);
  if (new Set(items.map(key)).size !== items.length) invalid();
  return {
    items,
    page: expected,
    pageSize: 20,
    total: source.total,
    hasNext: source.hasNext as boolean,
  };
}
export function parseDynamicPage(
  value: unknown,
  expected: number,
  status?: string,
): DynamicPage {
  const result = page(
    value,
    expected,
    (item) => parseAdminDynamic(item),
    (item) => item.dynamicId,
  );
  if (
    status !== undefined &&
    result.items.some((item) => item.status !== status)
  )
    invalid();
  return result;
}
export function parseCommentPage(
  value: unknown,
  dynamicId: number,
  expected: number,
): CommentPage {
  return page(
    value,
    expected,
    (item) => parseAdminComment(item, dynamicId),
    (item) => item.commentId,
  );
}
export function parseModerationReceipt(
  value: unknown,
  mutation: ModerationMutation,
) {
  if (mutation.action === "delete") {
    if (value !== undefined) invalid();
    return;
  }
  const source = row(value),
    expected =
      mutation.action === "hide"
        ? "hidden"
        : mutation.kind === "comment"
          ? "visible"
          : "published";
  if (
    id(source[mutation.kind === "dynamic" ? "dynamicId" : "commentId"]) !==
      mutation.targetId ||
    source.status !== expected
  )
    invalid();
  moderation(source);
}

function parseFormat(value: unknown): "plain_text" | "markdown_v1" {
  if (value !== "plain_text" && value !== "markdown_v1") invalid();
  return value;
}
function parseBodyAssets(value: unknown): { assetId: string; url: string }[] {
  if (!Array.isArray(value) || value.length > 9) invalid();
  const items = value.map((item) => {
    const source = row(item);
    const assetId = text(source.assetId),
      url = text(source.url);
    if (
      !/^[1-9]\d{0,18}$/.test(assetId) ||
      BigInt(assetId) > 9223372036854775807n ||
      !safeContentUrl(url)
    )
      invalid();
    return { assetId, url };
  });
  if (new Set(items.map((a) => a.assetId)).size !== items.length) invalid();
  return items;
}
