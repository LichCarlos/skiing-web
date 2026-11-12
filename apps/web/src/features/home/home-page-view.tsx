import { SiteNavigation } from "@/components/site-navigation";
import { ArticleFavorites } from "@/features/article-favorites/article-favorites";
import Image from "next/image";
import Link from "next/link";
import type { components } from "@common/api-contracts/openapi";
import type { FeaturedContent } from "@/features/home/featured-content";
import { ArticleCard } from "@/features/public-content/article-card";
import { DynamicCardView } from "@/features/public-content/dynamic-card";
import { routes } from "@/config/routes";
import { SiteName, SiteTagline } from "@/features/site-config/site-config";
import shared from "@/app/public-site.module.css";
import styles from "@/features/home/home-experience.module.css";
import { ScrollRail } from "@/features/home/scroll-rail";
import { HomeOpening } from "@/features/home/home-opening";
import { SectionHold } from "@/features/home/section-hold";
import { SnowMark } from "@/components/snow-mark";
import { ArrowIcon } from "@/components/site-symbol";
import alpineLandscape from "@/features/home/assets/alpine-landscape.webp";
import alpineLandscapeMobile from "@/features/home/assets/alpine-landscape-mobile.webp";

type ResortCard = components["schemas"]["PublicResortCardVO"];

export function HomePageView({ resorts, articles, dynamics }: FeaturedContent) {
  return (
    <main className={styles.page}>
      <SiteNavigation explore />

      <HomeOpening>
        <section className={styles.hero} aria-labelledby="home-title">
          <div className={styles.heroContent}>
            <h2 id="home-title">
              <SiteName />
            </h2>
            <p className={styles.heroStatement}>
              <span>生活向前，</span>
              <span>快乐向山。</span>
            </p>
            <p className={styles.heroCopy}>
              <SiteTagline />
            </p>
            <Link className={styles.primaryButton} href={routes.resorts}>
              探索雪场 <ArrowIcon direction="diagonal" />
            </Link>
            <div className={styles.heroFoot}>
              <span>雪场指南 · 滑雪知识 · 雪友社区</span>
              <a href="#resort-discovery" className={styles.scrollLink}>
                向下探索 <ArrowIcon direction="down" />
              </a>
            </div>
          </div>
          <figure className={styles.heroMedia}>
            <picture>
              <source
                media="(max-width: 760px)"
                srcSet={alpineLandscapeMobile.src}
                type="image/webp"
              />
              <Image
                src={alpineLandscape}
                alt=""
                fill
                unoptimized
                loading="eager"
                fetchPriority="high"
                sizes="(max-width: 760px) 100vw, 52vw"
              />
            </picture>
            <figcaption>雪山意象 · 非雪场实拍</figcaption>
          </figure>
          <div className={styles.snowStamp} aria-hidden="true">
            <SnowMark />
          </div>
        </section>
      </HomeOpening>

      <div id="main-content" tabIndex={-1}>
        <section
          className={`${styles.discovery} ${styles.resortSection}`}
          id="resort-discovery"
          tabIndex={-1}
          aria-labelledby="discovery-title"
        >
          {resorts.status === "ready" && resorts.items.length > 0 ? null : (
            <div className={styles.sectionHeading}>
              <div>
                <h2 id="discovery-title">下一站，去雪里</h2>
              </div>
              <Link className={styles.textLink} href={routes.resorts}>
                查看全部雪场 <ArrowIcon />
              </Link>
            </div>
          )}

          {resorts.status === "unavailable" ? (
            <div className={styles.notice} role="status">
              <strong>雪场资料暂时无法加载</strong>
              <span>请稍后重试，或直接进入雪场目录。</span>
              <Link href={routes.resorts}>
                打开雪场目录 <ArrowIcon />
              </Link>
            </div>
          ) : resorts.items.length === 0 ? (
            <div className={styles.empty} role="status">
              <strong>雪场资料正在整理中</strong>
              <span>稍后再来看看新的雪上目的地。</span>
            </div>
          ) : (
            <ScrollRail
              heading={
                <div className={styles.sectionHeading}>
                  <h2 id="discovery-title">下一站，去雪里</h2>
                  <Link className={styles.textLink} href={routes.resorts}>
                    查看全部雪场 <ArrowIcon />
                  </Link>
                </div>
              }
            >
              <div className={styles.railIntro}>
                <SnowMark />
                <h3>
                  山在那里，
                  <br />
                  就去相见。
                </h3>
                <p>
                  看地区、查开放状态，
                  <br />
                  选择适合自己的雪场。
                </p>
                <Link href={routes.resorts}>
                  打开雪场目录 <ArrowIcon direction="diagonal" />
                </Link>
              </div>
              {resorts.items.map((resort) => (
                <Link
                  className={styles.resortCard}
                  href={routes.resortDetail(resort.resortId)}
                  key={resort.resortId}
                >
                  <div className={styles.cardImage}>
                    {resort.coverUrl ? (
                      <Image
                        src={resort.coverUrl}
                        alt={resort.name}
                        fill
                        unoptimized
                        sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 33vw"
                      />
                    ) : (
                      <div className={styles.coverPlaceholder}>
                        暂无雪场图片
                      </div>
                    )}
                    <span
                      className={styles.status}
                      data-status={resort.openStatus}
                    >
                      {openStatusLabel(resort.openStatus)}
                    </span>
                  </div>
                  <div className={styles.cardInfo}>
                    <div>
                      <h3>{resort.name}</h3>
                      <p>
                        {[resort.region.province, resort.region.city]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <div className={styles.rating}>
                      <span aria-hidden="true">★</span>
                      {resort.rating === null
                        ? "暂无评分"
                        : resort.rating.toFixed(1)}
                    </div>
                  </div>
                  <div className={styles.cardMeta}>
                    <span>
                      {resort.fitTags
                        .slice(0, 2)
                        .map((tag) => tag.label)
                        .join(" / ") || "雪场指南"}
                    </span>
                    <span>
                      {resort.startingPrice
                        ? `¥${resort.startingPrice} 起`
                        : "查看详情"}
                    </span>
                  </div>
                </Link>
              ))}
            </ScrollRail>
          )}
        </section>

        <SectionHold>
          <section
            className={`${styles.discovery} ${styles.knowledgeSection}`}
            aria-labelledby="knowledge-title"
          >
            <div className={styles.sectionHeading}>
              <div>
                <h2 id="knowledge-title">
                  把知识
                  <br />
                  带上雪道
                </h2>
                <p>从装备到安全，让每次出发都更有底气。</p>
              </div>
              <Link className={styles.textLink} href={routes.knowledge}>
                查看全部知识 <ArrowIcon />
              </Link>
            </div>
            {articles.status === "unavailable" ? (
              <div className={styles.notice} role="status">
                <strong>知识文章暂时无法加载</strong>
                <span>请稍后重试，或直接进入知识目录。</span>
                <Link href={routes.knowledge}>
                  打开知识目录 <ArrowIcon />
                </Link>
              </div>
            ) : articles.items.length === 0 ? (
              <div className={styles.empty} role="status">
                <strong>暂时没有公开文章</strong>
                <span>稍后再来了解装备、安全与滑行技巧。</span>
              </div>
            ) : (
              <ArticleFavorites
                path="/articles?page=1&pageSize=3"
                ids={articles.items.map((article) => article.articleId)}
              >
                <div className={`${shared.articleGrid} ${styles.articleGrid}`}>
                  {articles.items.map((article) => (
                    <ArticleCard
                      key={article.articleId}
                      article={article}
                      preview
                    />
                  ))}
                </div>
              </ArticleFavorites>
            )}
          </section>
        </SectionHold>
        <SectionHold>
          <section
            className={`${styles.discovery} ${styles.communitySection}`}
            aria-labelledby="dynamics-title"
          >
            <div className={styles.sectionHeading}>
              <div>
                <h2 id="dynamics-title">
                  雪上的故事，
                  <br />
                  一起分享。
                </h2>
                <p>不同的雪场，同样热爱的冬天。</p>
              </div>
              <Link className={styles.textLink} href={routes.dynamics}>
                查看全部动态 <ArrowIcon />
              </Link>
            </div>
            {dynamics.status === "unavailable" ? (
              <div className={styles.notice} role="status">
                <strong>雪友动态暂时无法加载</strong>
                <span>请稍后重试，或直接进入雪友社区。</span>
                <Link href={routes.dynamics}>
                  打开雪友社区 <ArrowIcon />
                </Link>
              </div>
            ) : dynamics.items.length === 0 ? (
              <div className={styles.empty} role="status">
                <strong>还没有公开动态</strong>
                <span>稍后再来发现雪友们的雪上故事。</span>
              </div>
            ) : (
              <div className={`${shared.dynamicGrid} ${styles.dynamicGrid}`}>
                {dynamics.items.map((dynamic) => (
                  <DynamicCardView
                    key={dynamic.dynamicId}
                    dynamic={dynamic}
                    preview
                  />
                ))}
              </div>
            )}
          </section>
        </SectionHold>
      </div>
    </main>
  );
}

function openStatusLabel(status: ResortCard["openStatus"]): string {
  return {
    open: "开放中",
    closed: "暂未开放",
    limited: "部分开放",
    unknown: "状态待更新",
  }[status];
}
