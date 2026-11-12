import type { components } from "@common/api-contracts/openapi";
import { ApiError, type ApiClient } from "@common/api-contracts/client";
import { parsePublicUser } from "@/platform/auth/public-session-model";
import { inspectMarkdown, safeContentUrl } from "@common/ui";
import {
  allowedArticleLink,
  articleAssetReference,
} from "@/features/member/content-links";

export type OwnNote = components["schemas"]["OwnDynamicDetailVO"];
export type OwnPage = components["schemas"]["OwnDynamicPageVO"];
export type FavoriteKind = "dynamic" | "article" | "resort";
export type CollectionItem = {
  favoriteId: string;
  targetType: FavoriteKind;
  favoritedAt: string;
  target: { id: number; title: string; summary: string; author: string };
};
export type CollectionPage = {
  items: CollectionItem[];
  total: number;
  page: number;
  pageSize: number;
};
export class MemberError extends Error {}
export class UnconfirmedWrite extends MemberError {}
function fail(): never {
  throw new MemberError("内容响应异常，请刷新后重试。");
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 10000): string {
  if (typeof value !== "string" || value.length > max) fail();
  return value;
}
function count(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 2147483647
  )
    fail();
  return value;
}
function id(value: unknown): number {
  const result = count(value);
  if (!result) fail();
  return result;
}
function date(value: unknown): string {
  const result = text(value);
  if (!Number.isFinite(Date.parse(result))) fail();
  return result;
}
function url(value: unknown): string | null {
  if (value === null) return null;
  const result = text(value, 4096);
  if (!safeContentUrl(result)) fail();
  return result;
}
function image(value: unknown) {
  const row = object(value);
  const assetId = text(row.assetId, 19);
  if (!articleAssetReference(`asset:${assetId}`)) fail();
  return { assetId, url: url(row.url) ?? fail() };
}
export function noteCard(
  value: unknown,
  userId: number,
): OwnPage["items"][number] {
  const row = object(value),
    author = object(row.author);
  if (
    author.userId !== userId ||
    !["pending", "published", "hidden"].includes(String(row.status))
  )
    fail();
  const resort = row.resort === null ? null : object(row.resort);
  if (typeof row.likedByMe !== "boolean") fail();
  return {
    dynamicId: id(row.dynamicId),
    author: {
      userId,
      nickname: text(author.nickname, 50),
      avatarUrl: url(author.avatarUrl),
    },
    summary: text(row.summary, 180),
    coverUrl: url(row.coverUrl),
    imageCount: count(row.imageCount),
    resort: resort
      ? { resortId: id(resort.resortId), name: text(resort.name, 200) }
      : null,
    likeCount: count(row.likeCount),
    commentCount: count(row.commentCount),
    likedByMe: row.likedByMe,
    status: row.status as OwnPage["items"][number]["status"],
    createdAt: date(row.createdAt),
  };
}
export function parseOwnPage(
  value: unknown,
  userId: number,
  page: number,
  status = "all",
): OwnPage {
  const row = object(value);
  const total = count(row.total);
  if (
    row.page !== page ||
    row.pageSize !== 12 ||
    !Array.isArray(row.items) ||
    row.items.length > 12 ||
    row.items.length > total ||
    row.hasNext !== page * 12 < total
  )
    fail();
  const items = row.items.map((item) => noteCard(item, userId));
  if (
    new Set(items.map((x) => x.dynamicId)).size !== items.length ||
    items.some((x) => status !== "all" && x.status !== status)
  )
    fail();
  return { items, total, page, pageSize: 12, hasNext: row.hasNext as boolean };
}
export function parseOwnNote(
  value: unknown,
  userId: number,
  noteId: number,
): OwnNote {
  const row = object(value),
    card = noteCard(row, userId);
  if (
    card.dynamicId !== noteId ||
    !["plain_text", "markdown_v1"].includes(String(row.contentFormat)) ||
    !Array.isArray(row.images)
  )
    fail();
  const images = row.images.map(image);
  if (new Set(images.map((x) => x.assetId)).size !== images.length) fail();
  return {
    ...card,
    content: text(row.content),
    contentFormat: row.contentFormat as OwnNote["contentFormat"],
    version: id(row.version),
    images,
    imageUrls: images.map((x) => x.url),
    bodyAssets: images,
    updatedAt: date(row.updatedAt),
  };
}
export function parseCollection(
  value: unknown,
  kind: FavoriteKind,
  page: number,
): CollectionPage {
  const row = object(value);
  const total = count(row.total);
  if (
    row.page !== page ||
    row.pageSize !== 12 ||
    !Array.isArray(row.items) ||
    row.items.length > 12 ||
    row.items.length > total
  )
    fail();
  const items = row.items.map((value) => {
    const item = object(value),
      target = object(item.target),
      favoriteId = text(item.favoriteId, 19);
    if (
      !articleAssetReference(`asset:${favoriteId}`) ||
      item.targetType !== kind ||
      target.targetType !== kind
    )
      fail();
    const summary =
      kind === "resort"
        ? [target.province, target.city]
            .filter((x) => typeof x === "string")
            .join(" · ")
        : text(target.summary);
    return {
      favoriteId,
      targetType: kind,
      favoritedAt: date(item.favoritedAt),
      target: {
        id: id(target.id),
        title:
          kind === "resort"
            ? text(target.name, 200)
            : kind === "article"
              ? text(target.title, 200)
              : summary.split(/\n/)[0] || "雪友笔记",
        summary,
        author: kind === "dynamic" ? text(target.authorNickname, 50) : "",
      },
    };
  });
  if (new Set(items.map((x) => x.target.id)).size !== items.length) fail();
  return { items, total, page, pageSize: 12 };
}
export function validateNote(
  content: string,
  format: "plain_text" | "markdown_v1",
  images: { assetId: string }[],
) {
  if (!content.trim() || content.length > 10000)
    throw new MemberError("请写下笔记内容，最多 10000 字符。");
  if (new Set(images.map((x) => x.assetId)).size !== images.length)
    throw new MemberError("图片不能重复添加。");
  if (format === "markdown_v1") {
    const issue = inspectMarkdown(content, {
      link: allowedArticleLink,
      image: (source) =>
        articleAssetReference(source) &&
        images.some((x) => source === `asset:${x.assetId}`),
    });
    if (issue) throw new MemberError(issue);
  }
}
export function memberFailure(error: unknown): string {
  if (error instanceof MemberError) return error.message;
  if (error instanceof ApiError) {
    if (error.status === 401) return "登录已失效，请重新登录后继续。";
    if (error.status === 403)
      return "当前账号没有操作权限，请检查会话或联系管理员。";
    if (error.status === 404) return "笔记已删除或当前不可用，请返回列表刷新。";
    if (error.status === 409)
      return "内容已在其他页面改变，请先重新读取，避免覆盖较新的版本。";
    if (error.status === 422 || error.status === 400)
      return "内容未被接受，请检查正文、图片和关联雪场。";
  }
  return "操作结果未确认。请先刷新列表核对，避免重复提交；当前正文仍可导出。";
}
/** One lifetime per account. Late reads and writes cannot update a replacement workspace. */
export class MemberRun {
  private active = true;
  private controllers = new Set<AbortController>();
  private writing = false;
  constructor(
    readonly userId: number,
    private request: ApiClient["request"],
  ) {}
  suspend() {
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
  }
  dispose() {
    this.active = false;
    this.suspend();
  }
  activate() {
    this.active = true;
  }
  async read<T>(path: string, parse: (value: unknown) => T): Promise<T> {
    if (!this.active) throw new DOMException("Closed", "AbortError");
    const controller = new AbortController();
    const timeout = setTimeout(
      () =>
        controller.abort(
          new DOMException("读取超时，请重新读取。", "TimeoutError"),
        ),
      15000,
    );
    this.controllers.add(controller);
    try {
      const value = await this.request(path, {
        signal: controller.signal,
        cache: "no-store",
        skipAuthRefresh: true,
      });
      controller.signal.throwIfAborted();
      if (!this.active) throw new DOMException("Closed", "AbortError");
      return parse(value);
    } finally {
      clearTimeout(timeout);
      this.controllers.delete(controller);
    }
  }
  async write<T>(
    path: string,
    method: "POST" | "PATCH" | "DELETE" | "PUT",
    body: unknown,
    parse: (value: unknown) => T,
  ): Promise<T> {
    if (this.writing) throw new MemberError("操作仍在进行，请稍候。");
    this.writing = true;
    try {
      await this.read("/auth/me", (value) => {
        if (parsePublicUser(value).userId !== this.userId)
          throw new MemberError("登录账号已改变，请重新打开个人中心。");
      });
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(new DOMException("提交超时", "TimeoutError")),
        30000,
      );
      this.controllers.add(controller);
      try {
        const value = await this.request(path, {
          method,
          body,
          signal: controller.signal,
          skipAuthRefresh: true,
        });
        controller.signal.throwIfAborted();
        if (!this.active) throw new DOMException("Closed", "AbortError");
        return parse(value);
      } catch (error) {
        if (
          !this.active ||
          (controller.signal.aborted &&
            controller.signal.reason?.name === "AbortError")
        )
          throw new DOMException("Closed", "AbortError");
        if (
          error instanceof ApiError &&
          error.status >= 400 &&
          error.status < 500
        )
          throw error;
        throw new UnconfirmedWrite(
          "提交结果未确认。请先核对我的笔记，避免重复提交；当前正文仍可导出。",
        );
      } finally {
        clearTimeout(timeout);
        this.controllers.delete(controller);
      }
    } finally {
      this.writing = false;
    }
  }
}
