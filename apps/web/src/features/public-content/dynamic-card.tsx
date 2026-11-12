import Image from "next/image";
import Link from "next/link";
import type { components } from "@common/api-contracts/openapi";
import { routes } from "@/config/routes";
import styles from "@/app/public-site.module.css";

type DynamicCard = components["schemas"]["DynamicCardVO"];

export function DynamicCardView({
  dynamic,
  preview = false,
}: {
  dynamic: DynamicCard;
  preview?: boolean;
}) {
  const date = formatDate(dynamic.createdAt);
  return (
    <article
      className={styles.dynamicCard}
      data-home-preview={preview || undefined}
    >
      {dynamic.coverUrl ? (
        <Link
          className={styles.dynamicImage}
          href={routes.dynamicDetail(dynamic.dynamicId)}
          aria-label={`查看 ${dynamic.author.nickname} 的动态`}
        >
          <Image
            src={dynamic.coverUrl}
            alt="动态图片"
            fill
            unoptimized
            sizes="(max-width: 700px) 100vw, (max-width: 1050px) 50vw, 33vw"
          />
          {dynamic.imageCount > 1 ? (
            <span className={styles.imageCount}>▧ {dynamic.imageCount} 张</span>
          ) : null}
        </Link>
      ) : null}
      <div className={styles.dynamicCardBody}>
        <div className={styles.dynamicAuthor}>
          <span className={styles.authorMark} aria-hidden="true">
            {dynamic.author.nickname.slice(0, 1) || "雪"}
          </span>
          <div>
            <strong>{dynamic.author.nickname}</strong>
            <time dateTime={dynamic.createdAt}>{date}</time>
          </div>
        </div>
        <Link
          className={styles.dynamicSummary}
          href={routes.dynamicDetail(dynamic.dynamicId)}
        >
          {dynamic.summary}
        </Link>
        <div className={styles.dynamicCardMeta}>
          {dynamic.resort ? (
            <Link
              href={routes.resortDetail(dynamic.resort.resortId)}
              aria-label={`查看关联雪场：${dynamic.resort.name}`}
            >
              {dynamic.resort.name}
            </Link>
          ) : (
            <span>雪友分享</span>
          )}
          {!dynamic.coverUrl && dynamic.imageCount > 0 ? (
            <span>{dynamic.imageCount} 张图片</span>
          ) : null}
          <span
            aria-label={`${dynamic.likeCount} 个赞，${dynamic.commentCount} 条评论`}
          >
            ♥ {dynamic.likeCount} <span aria-hidden="true">·</span> ◌{" "}
            {dynamic.commentCount}
          </span>
        </div>
      </div>
    </article>
  );
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "long",
    day: "numeric",
  });
}
