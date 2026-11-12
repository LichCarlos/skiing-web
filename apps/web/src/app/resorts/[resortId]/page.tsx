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
import { PhotoGallery } from "@/features/public-content/photo-gallery";
import { FavoriteNoteButton } from "@/features/member/favorite-note-button";

type Resort = components["schemas"]["PublicResortDetailVO"];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ resortId: string }>;
}) {
  return publicDetailMetadata("resort", (await params).resortId);
}

export default async function ResortDetailPage({
  params,
}: {
  params: Promise<{ resortId: string }>;
}) {
  const { resortId } = await params;
  if (
    !/^[1-9]\d*$/.test(resortId) ||
    !Number.isSafeInteger(Number(resortId)) ||
    Number(resortId) > 2147483647
  )
    notFound();

  let resort: Resort;
  try {
    resort = await readPublicDetail("resort", resortId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    return (
      <main className={styles.page}>
        <SiteNavigation active="resorts" />
        <div className={styles.notice} role="alert">
          <strong>雪场详情暂时无法加载</strong>
          <span>请检查网络后重试。</span>
          <Link href={routes.resortDetail(Number(resortId))}>
            重新加载 <span aria-hidden="true">↻</span>
          </Link>
        </div>
      </main>
    );
  }

  const hero = resort.galleryUrls[0] || resort.coverUrl;
  const updated = new Date(resort.updatedAt).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <main className={styles.page}>
      <SiteNavigation active="resorts" />

      <nav className={styles.breadcrumb} aria-label="面包屑">
        <Link href={routes.home}>首页</Link>
        <span aria-hidden="true">/</span>
        <Link href={routes.resorts}>雪场目录</Link>
        <span aria-hidden="true">/</span>
        <span>{resort.name}</span>
      </nav>

      <section className={styles.detailHero}>
        <div className={styles.detailImage}>
          {hero ? (
            <Image
              src={hero}
              alt={`${resort.name}雪场景观`}
              fill
              unoptimized
              sizes="100vw"
              priority
            />
          ) : (
            <div className={styles.imageFallback}>雪场影像整理中</div>
          )}
          <span className={styles.status} data-status={resort.openStatus}>
            {statusLabel(resort.openStatus)}
          </span>
        </div>
        <div className={styles.detailTitle}>
          <div>
            <p className={styles.kicker}>
              {[
                resort.region.province,
                resort.region.city,
                resort.region.district,
              ]
                .filter(Boolean)
                .join(" / ")}
            </p>
            <h1>{resort.name}</h1>
            <p>{resort.address || "雪场地址以官方公告为准"}</p>
          </div>
          <div className={styles.detailRating}>
            <span aria-hidden="true">★</span>
            <strong>
              {resort.rating === null ? "暂无评分" : resort.rating.toFixed(1)}
            </strong>
            <span>{resort.ratingCount} 条评价</span>
            <FavoriteNoteButton kind="resort" id={resort.resortId} />
          </div>
        </div>
      </section>

      <div className={styles.detailColumns}>
        <article className={styles.detailBody}>
          <section>
            <h2>雪场介绍</h2>
            <p className={styles.description}>{resort.description}</p>
          </section>
          {resort.fitTags.length > 0 && (
            <section>
              <h2>适合人群</h2>
              <div className={styles.tagList}>
                {resort.fitTags.map((tag) => (
                  <span key={tag.value}>{tag.label}</span>
                ))}
              </div>
            </section>
          )}
          {resort.galleryUrls.length > 0 && (
            <section>
              <h2>雪场相册</h2>
              <PhotoGallery
                label={`${resort.name}雪场相册`}
                urls={resort.galleryUrls}
              />
            </section>
          )}
        </article>
        <aside className={styles.facts} aria-label="雪场信息">
          <h2>上山前，先了解</h2>
          <dl>
            <div>
              <dt>起步票价</dt>
              <dd>
                {resort.startingPrice ? `¥${resort.startingPrice}` : "暂无信息"}
              </dd>
            </div>
            <div>
              <dt>当前雪况</dt>
              <dd>{resort.snowCondition.label}</dd>
            </div>
            <div>
              <dt>营业时间</dt>
              <dd>{resort.openingHours || "请查看雪场公告"}</dd>
            </div>
            <div>
              <dt>雪道信息</dt>
              <dd>{resort.trailSummary || "暂无信息"}</dd>
            </div>
            <div>
              <dt>设施</dt>
              <dd>{resort.facilitySummary || "暂无信息"}</dd>
            </div>
            <div>
              <dt>资料更新</dt>
              <dd>{updated}</dd>
            </div>
          </dl>
          {resort.customFields.length ? (
            <section aria-label="雪场补充信息">
              <h2>更多雪场信息</h2>
              <dl>
                {resort.customFields.map((field) => (
                  <div key={field.fieldKey}>
                    <dt>{field.label}</dt>
                    <dd>
                      {field.value === null
                        ? "暂无信息"
                        : Array.isArray(field.value)
                          ? field.value.join("、") || "暂无信息"
                          : typeof field.value === "boolean"
                            ? field.value
                              ? "是"
                              : "否"
                            : String(field.value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
          {resort.officialUrl && (
            <a
              className={styles.secondaryButton}
              href={resort.officialUrl}
              target="_blank"
              rel="noreferrer"
            >
              访问雪场官网 <span aria-hidden="true">↗</span>
            </a>
          )}
          <p className={styles.finePrint}>
            营业与雪况可能变化，请以雪场现场及官方公告为准。
          </p>
        </aside>
      </div>
    </main>
  );
}

function statusLabel(status: Resort["openStatus"]): string {
  return {
    open: "开放中",
    closed: "暂未开放",
    limited: "部分开放",
    unknown: "状态待更新",
  }[status];
}
