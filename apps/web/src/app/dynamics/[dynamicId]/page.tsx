import { MarkdownContent } from "@common/ui";
import { FavoriteNoteButton } from "@/features/member/favorite-note-button";
import { getPageHref } from "@/platform/config";
import { SiteNavigation } from "@/components/site-navigation";
import { PhotoGallery } from "@/features/public-content/photo-gallery";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { components } from "@common/api-contracts/openapi";
import { ApiError } from "@common/api-contracts/client";
import { routes } from "@/config/routes";
import {
  readPublicDetail,
  readPublicComments,
} from "@/features/public-content/public-detail";
import { publicDetailMetadata } from "@/features/public-content/public-metadata";
import styles from "@/app/public-site.module.css";

type Dynamic = components["schemas"]["DynamicDetailVO"];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ dynamicId: string }>;
}) {
  return publicDetailMetadata("dynamic", (await params).dynamicId);
}
type CommentPage = components["schemas"]["CommentPageVO"];
type Search = Record<string, string | string[] | undefined>;

export default async function DynamicDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ dynamicId: string }>;
  searchParams: Promise<Search>;
}) {
  const [{ dynamicId }, search] = await Promise.all([params, searchParams]);
  if (
    !/^[1-9]\d*$/.test(dynamicId) ||
    !Number.isSafeInteger(Number(dynamicId)) ||
    Number(dynamicId) > 2147483647
  )
    notFound();
  const rawPage = first(search.page) || "1";
  const page = Number(rawPage);
  const pageValid =
    /^\d+$/.test(rawPage) &&
    Number.isSafeInteger(page) &&
    page > 0 &&
    (page - 1) * 20 <= 2147483647;

  let dynamic: Dynamic;
  try {
    dynamic = await readPublicDetail("dynamic", dynamicId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    return (
      <main className={styles.page}>
        <SiteHeader />
        <div
          className={`${styles.notice} ${styles.dynamicNotice}`}
          role="alert"
        >
          <strong>动态详情暂时无法加载</strong>
          <span>连接服务失败，请稍后重试。</span>
          <Link href={routes.dynamicDetail(Number(dynamicId))}>
            重新加载 <span aria-hidden="true">↻</span>
          </Link>
        </div>
      </main>
    );
  }

  let comments: CommentPage | null = null;
  let commentsFailed = false;
  if (pageValid)
    try {
      comments = await readPublicComments(dynamicId, page);
    } catch {
      commentsFailed = true;
    }

  const imageUrls = dynamic.imageUrls.filter(Boolean);
  const nextPage = page + 1;

  return (
    <main className={styles.page}>
      <SiteHeader />
      <nav className={styles.breadcrumb} aria-label="面包屑">
        <Link href={routes.home}>首页</Link>
        <span aria-hidden="true">/</span>
        <Link href={routes.dynamics}>雪友动态</Link>
        <span aria-hidden="true">/</span>
        <span>动态详情</span>
      </nav>

      <article className={styles.dynamicDetail}>
        <h1 className={styles.dynamicPageTitle}>雪友动态</h1>
        <header className={styles.dynamicDetailHeader}>
          <div className={styles.dynamicAuthor}>
            <span className={styles.authorMark} aria-hidden="true">
              {dynamic.author.nickname.slice(0, 1) || "雪"}
            </span>
            <div>
              <strong>{dynamic.author.nickname}</strong>
              <time dateTime={dynamic.createdAt}>
                {formatDate(dynamic.createdAt)}
              </time>
            </div>
          </div>
          {dynamic.resort ? (
            <Link
              className={styles.resortReference}
              href={routes.resortDetail(dynamic.resort.resortId)}
              aria-label={`查看雪场目录，动态关联雪场：${dynamic.resort.name}`}
            >
              {dynamic.resort.name} <span aria-hidden="true">↗</span>
            </Link>
          ) : null}
        </header>
        <MarkdownContent
          className={styles.dynamicDetailContent}
          source={dynamic.content}
          format={dynamic.contentFormat}
          images={Object.fromEntries(
            (dynamic.bodyAssets ?? []).map((image) => [
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
        {imageUrls.length ? (
          <PhotoGallery label="动态图片" urls={imageUrls} />
        ) : null}
        <div className={styles.dynamicDetailStats}>
          <FavoriteNoteButton id={dynamic.dynamicId} />
          <span>♥ {dynamic.likeCount} 赞</span>
          <span>◌ {dynamic.commentCount} 条评论</span>
          <time dateTime={dynamic.updatedAt}>
            更新于 {formatDate(dynamic.updatedAt)}
          </time>
        </div>
      </article>

      <section
        className={styles.commentSection}
        aria-labelledby="comments-title"
      >
        <div className={styles.commentHeading}>
          <div>
            <h2 id="comments-title">雪友评论</h2>
          </div>
          <span>{dynamic.commentCount} 条</span>
        </div>
        {!pageValid ? (
          <div className={styles.notice} role="alert">
            <strong>评论页码无效</strong>
            <Link href={routes.dynamicDetail(dynamic.dynamicId)}>
              返回评论第一页
            </Link>
          </div>
        ) : commentsFailed ? (
          <div className={styles.notice} role="alert">
            <strong>评论暂时无法加载</strong>
            <Link
              href={`${routes.dynamicDetail(dynamic.dynamicId)}?page=${page}`}
            >
              重试 <span aria-hidden="true">↻</span>
            </Link>
          </div>
        ) : comments?.items.length ? (
          <>
            <ol className={styles.commentList}>
              {comments.items.map((comment) => (
                <li className={styles.commentItem} key={comment.commentId}>
                  <span className={styles.authorMark} aria-hidden="true">
                    {comment.author.nickname.slice(0, 1) || "雪"}
                  </span>
                  <div>
                    <div className={styles.commentMeta}>
                      <strong>{comment.author.nickname}</strong>
                      <time dateTime={comment.createdAt}>
                        {formatDate(comment.createdAt)}
                      </time>
                    </div>
                    <p>{comment.content}</p>
                  </div>
                </li>
              ))}
            </ol>
            <nav className={styles.pagination} aria-label="评论分页">
              {page > 1 ? (
                <Link
                  href={`${routes.dynamicDetail(dynamic.dynamicId)}?page=${page - 1}`}
                >
                  ← 更新的评论
                </Link>
              ) : (
                <span />
              )}
              {comments.hasNext ? (
                <Link
                  href={`${routes.dynamicDetail(dynamic.dynamicId)}?page=${nextPage}`}
                >
                  更早的评论 →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          </>
        ) : (
          <div className={styles.empty} role="status">
            <strong>{page > 1 ? "本页暂无评论" : "还没有评论"}</strong>
            <span>登录 App 后可以参与讨论。</span>
            {page > 1 ? (
              <Link
                href={`${routes.dynamicDetail(dynamic.dynamicId)}?page=${page - 1}`}
              >
                ← 更新的评论
              </Link>
            ) : null}
          </div>
        )}
      </section>
    </main>
  );
}

function SiteHeader() {
  return <SiteNavigation active="dynamics" />;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
