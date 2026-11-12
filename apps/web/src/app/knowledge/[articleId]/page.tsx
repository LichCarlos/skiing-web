import { MarkdownContent } from "@common/ui";
import { getPageHref } from "@/platform/config";
import { SiteNavigation } from "@/components/site-navigation";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { components } from "@common/api-contracts/openapi";
import { ApiError } from "@common/api-contracts/client";
import { routes } from "@/config/routes";
import { readPublicDetail } from "@/features/public-content/public-detail";
import { publicDetailMetadata } from "@/features/public-content/public-metadata";
import styles from "@/app/public-site.module.css";
import {
  ArticleFavorites,
  ArticleFavoriteButton,
} from "@/features/article-favorites/article-favorites";

type Article = components["schemas"]["PublicArticleDetailVO"];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ articleId: string }>;
}) {
  return publicDetailMetadata("article", (await params).articleId);
}
const fallbackImage =
  "https://images.unsplash.com/photo-1517299321609-52687d1bc55a?auto=format&fit=crop&w=1800&q=80";

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ articleId: string }>;
}) {
  const { articleId } = await params;
  if (
    !/^[1-9]\d*$/.test(articleId) ||
    !Number.isSafeInteger(Number(articleId)) ||
    Number(articleId) > 2147483647
  )
    notFound();

  let article: Article;
  try {
    article = await readPublicDetail("article", articleId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    return (
      <main className={styles.page}>
        <SiteNavigation active="knowledge" />
        <div
          className={`${styles.notice} ${styles.knowledgeNotice}`}
          role="alert"
        >
          <strong>文章暂时无法加载</strong>
          <span>连接服务失败，请稍后重试。</span>
          <Link href={routes.articleDetail(Number(articleId))}>
            重新加载 <span aria-hidden="true">↻</span>
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <SiteNavigation active="knowledge" />
      <nav className={styles.breadcrumb} aria-label="面包屑">
        <Link href={routes.home}>首页</Link>
        <span aria-hidden="true">/</span>
        <Link href={routes.knowledge}>滑雪知识</Link>
        <span aria-hidden="true">/</span>
        <span>{article.category.label}</span>
      </nav>
      <article className={styles.articleDetail}>
        <header className={styles.articleHeading}>
          <span className={styles.articleCategory}>
            {article.category.label}
          </span>
          <h1>{article.title}</h1>
          <ArticleFavorites
            path={`/articles/${article.articleId}`}
            ids={[article.articleId]}
          >
            <ArticleFavoriteButton articleId={article.articleId} />
          </ArticleFavorites>
          <p>{article.summary}</p>
          <div className={styles.articleMeta}>
            <span>{article.authorName || "凛迹雪客"}</span>
            <time dateTime={article.publishTime}>
              {formatDate(article.publishTime)}
            </time>
          </div>
        </header>
        <div className={styles.articleHero}>
          <Image
            src={article.coverUrl || fallbackImage}
            alt=""
            fill
            priority
            unoptimized
            sizes="(max-width: 900px) 100vw, 900px"
          />
        </div>
        <MarkdownContent
          className={styles.articleBody}
          source={article.body}
          format={article.contentFormat}
          images={Object.fromEntries(
            (article.bodyAssets ?? []).map((image) => [
              `asset:${image.assetId}`,
              image.url,
            ]),
          )}
          resolveLink={(value) => {
            const match = /^(article|resort):([1-9]\d{0,9})$/.exec(value);
            if (!match || Number(match[2]) > 2147483647) return undefined;
            return getPageHref(
              match[1] === "article"
                ? routes.articleDetail(Number(match[2]))
                : routes.resortDetail(Number(match[2])),
            );
          }}
        />
      </article>
    </main>
  );
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
