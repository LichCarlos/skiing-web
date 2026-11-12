import Image from "next/image";
import Link from "next/link";
import type { components } from "@common/api-contracts/openapi";
import { routes } from "@/config/routes";
import { ArticleFavoriteButton } from "@/features/article-favorites/article-favorites";
import styles from "@/app/public-site.module.css";

type Article = components["schemas"]["PublicArticleSummaryVO"];

export function ArticleCard({
  article,
  preview = false,
}: {
  article: Article;
  preview?: boolean;
}) {
  return (
    <article
      className={styles.articleCard}
      data-home-preview={preview || undefined}
    >
      {article.coverUrl ? (
        <Link
          className={styles.articleImage}
          href={routes.articleDetail(article.articleId)}
        >
          <Image
            src={article.coverUrl}
            alt=""
            fill
            unoptimized
            sizes="(max-width: 700px) 100vw, (max-width: 1000px) 50vw, 33vw"
          />
        </Link>
      ) : null}
      <div className={styles.articleCardBody}>
        <div className={styles.articleMeta}>
          <span>{article.category.label}</span>
          <time dateTime={article.publishTime}>
            {formatDate(article.publishTime)}
          </time>
        </div>
        <Link
          className={styles.articleTitle}
          href={routes.articleDetail(article.articleId)}
        >
          {article.title}
        </Link>
        <p className={styles.articleSummary}>{article.summary}</p>
        <div className={styles.articleByline}>
          {article.authorName || "凛迹雪客"}
          <span aria-hidden="true">·</span>
          <span>阅读全文 →</span>
        </div>
        <ArticleFavoriteButton articleId={article.articleId} />
      </div>
    </article>
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
