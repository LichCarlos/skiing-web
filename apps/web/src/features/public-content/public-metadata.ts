import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApiError } from "@common/api-contracts/client";
import { getSiteOrigin, getBasePath } from "@/platform/config";
import { routes } from "@/config/routes";
import {
  isPublicDetailId,
  readPublicDetail,
  readPublicSiteName,
  type PublicDetailKind,
} from "@/features/public-content/public-detail";

const labels = {
  resort: "雪场详情",
  article: "滑雪知识",
  dynamic: "雪友动态",
} as const;
function compact(value: string, limit: number): string {
  return Array.from(
    value
      .replace(/[\u0000-\u001f\u007f]/gu, " ")
      .replace(/\s+/gu, " ")
      .trim(),
  )
    .slice(0, limit)
    .join("");
}
export async function publicDetailMetadata(
  kind: PublicDetailKind,
  id: string,
): Promise<Metadata> {
  if (!isPublicDetailId(id)) notFound();
  // An explicitly invalid deployment address is an error, not a guessed origin.
  const origin = getSiteOrigin();
  let title: string, description: string, siteName: string;
  try {
    const [item, brand] = await Promise.all([
      readPublicDetail(kind, id),
      readPublicSiteName(),
    ]);
    siteName = compact(brand, 50) || "凛迹雪客";
    if (kind === "resort" && "name" in item) {
      title = item.name;
      description =
        compact(item.description, 160) ||
        `${item.name}的地区、雪况、票价与设施信息。`;
    } else if (kind === "article" && "title" in item) {
      title = item.title;
      description = compact(item.summary, 160) || item.title;
    } else if ("author" in item) {
      title = `${item.author.nickname}的雪友动态`;
      description = compact(item.summary, 160) || title;
    } else throw new TypeError("Invalid public sharing kind");
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    return {
      title: `${labels[kind]}暂时无法加载`,
      description: "请稍后重试或返回公开目录。",
      robots: { index: false, follow: true },
      openGraph: {
        title: `${labels[kind]}暂时无法加载`,
        description: "请稍后重试或返回公开目录。",
        images: [],
      },
      twitter: {
        card: "summary",
        title: `${labels[kind]}暂时无法加载`,
        description: "请稍后重试或返回公开目录。",
        images: [],
      },
    };
  }
  title = `${compact(title, 80 - [...siteName].length - 3)} · ${siteName}`;
  description = compact(description, 160);
  const path =
    kind === "resort"
      ? routes.resortDetail(Number(id))
      : kind === "article"
        ? routes.articleDetail(Number(id))
        : routes.dynamicDetail(Number(id));
  const url = origin
    ? new URL(getBasePath() + path, origin).toString()
    : undefined;
  return {
    title,
    description,
    robots: { index: true, follow: true },
    ...(url ? { alternates: { canonical: url } } : {}),
    openGraph: {
      title,
      description,
      type: "website",
      siteName,
      locale: "zh_CN",
      ...(url ? { url } : {}),
      images: [],
    },
    twitter: { card: "summary", title, description, images: [] },
  };
}
