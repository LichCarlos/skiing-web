import { cache } from "react";
import type { components } from "@common/api-contracts/openapi";
import { readAnonymousPublic } from "@/features/public-content/public-read";
import {
  projectResortDetail,
  projectArticleDetail,
  projectDynamicDetail,
  projectCommentPage,
} from "@/features/public-content/public-detail-response";
export { readAnonymousPublic } from "@/features/public-content/public-read";

type Details = {
  resort: components["schemas"]["PublicResortDetailVO"];
  article: components["schemas"]["PublicArticleDetailVO"];
  dynamic: components["schemas"]["DynamicDetailVO"];
};
export type PublicDetailKind = keyof Details;
const resource = {
  resort: { path: "/resorts", id: "resortId", project: projectResortDetail },
  article: {
    path: "/articles",
    id: "articleId",
    project: projectArticleDetail,
  },
  dynamic: {
    path: "/dynamics",
    id: "dynamicId",
    project: projectDynamicDetail,
  },
} as const;
export function isPublicDetailId(id: string): boolean {
  return (
    /^[1-9]\d*$/.test(id) &&
    Number.isSafeInteger(Number(id)) &&
    Number(id) <= 2147483647
  );
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Invalid public detail");
  return value as Record<string, unknown>;
}
function heading(value: unknown): boolean {
  return (
    typeof value === "string" &&
    !!value.replace(/[\u0000-\u001f\u007f]/gu, " ").trim()
  );
}
/** React request memoization only; no module Map or persistent user/content cache. */
export const readPublicDetail = cache(
  async <K extends PublicDetailKind>(
    kind: K,
    id: string,
  ): Promise<Details[K]> => {
    if (!isPublicDetailId(id)) throw new TypeError("Invalid public detail ID");
    const route = resource[kind];
    const item = record(
      await readAnonymousPublic<unknown>(`${route.path}/${id}`),
    );
    if (item[route.id] !== Number(id))
      throw new TypeError("Mismatched public detail ID");
    // Reject invalid sharing headings before projecting the complete public VO.
    if (
      kind === "resort" &&
      (!heading(item.name) || typeof item.description !== "string")
    )
      throw new TypeError("Invalid public resort sharing data");
    if (
      kind === "article" &&
      (!heading(item.title) || typeof item.summary !== "string")
    )
      throw new TypeError("Invalid public article sharing data");
    if (
      kind === "dynamic" &&
      (!heading(record(item.author).nickname) ||
        typeof item.summary !== "string" ||
        item.status !== "published")
    )
      throw new TypeError("Invalid public dynamic sharing data");
    return route.project(item) as Details[K];
  },
);

export async function readPublicComments(
  id: string,
  page: number,
): Promise<components["schemas"]["CommentPageVO"]> {
  if (
    !isPublicDetailId(id) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    (page - 1) * 20 > 2147483647
  )
    throw new TypeError("Invalid public comments query");
  return projectCommentPage(
    await readAnonymousPublic<unknown>(
      `/dynamics/${id}/comments?page=${page}&pageSize=20`,
    ),
    page,
  );
}

export const readPublicSiteName = cache(async (): Promise<string> => {
  try {
    const item = record(await readAnonymousPublic<unknown>("/public/config"));
    if (!heading(item.siteName) || [...(item.siteName as string)].length > 50)
      throw new TypeError("Invalid public site name");
    return item.siteName as string;
  } catch {
    return "凛迹雪客";
  }
});
