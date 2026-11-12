import { SiteNavigation } from "@/components/site-navigation";
import { DynamicCardView } from "@/features/public-content/dynamic-card";
import Link from "next/link";
import { routes } from "@/config/routes";
import { getPageHref } from "@/platform/config";
import styles from "@/app/public-site.module.css";

import {
  feedHref,
  type FeedFilters,
  type FeedState,
} from "@/features/community/feed-query";

export function FeedDirectory({
  filters,
  state,
}: {
  filters: FeedFilters;
  state: FeedState;
}) {
  const { keyword, cursor } = filters;
  const feed = state.status === "ready" ? state.data : null;
  const query = state.status === "invalid" ? "" : state.query;
  return (
    <main className={styles.page} data-page-tone="dynamics">
      <SiteNavigation active="dynamics" />

      <section className={styles.listIntro}>
        <h1>雪上的每一刻，都值得分享</h1>
        <p>看看雪友正在滑哪条道，也记录你的山上日常。</p>
      </section>

      <form
        className={styles.dynamicSearch}
        action={getPageHref(routes.dynamics)}
        method="get"
      >
        <label htmlFor="dynamic-keyword">搜索动态正文</label>
        <input
          id="dynamic-keyword"
          name="keyword"
          defaultValue={keyword}
          maxLength={200}
          placeholder="试试搜“粉雪”或“初次上山”"
        />
        <button className={styles.filterButton} type="submit">
          搜索 <span aria-hidden="true">→</span>
        </button>
      </form>

      {state.status === "invalid" ? (
        <div
          className={`${styles.notice} ${styles.dynamicNotice}`}
          role="alert"
        >
          <strong>请检查搜索条件</strong>
          <span>{state.message}</span>
          <Link
            href={
              keyword.length <= 200
                ? feedHref(
                    new URLSearchParams({
                      keyword: keyword.trim(),
                      limit: "12",
                    }).toString(),
                  )
                : routes.dynamics
            }
          >
            返回最新动态
          </Link>
        </div>
      ) : state.status === "error" ? (
        <div
          className={`${styles.notice} ${styles.dynamicNotice}`}
          role="alert"
        >
          <strong>动态暂时无法加载</strong>
          <span>连接服务失败，请稍后重试。</span>
          <Link href={`${routes.dynamics}?${query}`}>
            重新加载 <span aria-hidden="true">↻</span>
          </Link>
          {cursor ? <Link href={feedHref(query)}>返回最新动态</Link> : null}
        </div>
      ) : feed?.items.length ? (
        <>
          <div className={styles.resultSummary}>
            <span>{keyword ? `“${keyword}”的动态` : "最新雪友动态"}</span>
            <span>按发布时间更新</span>
          </div>
          <div className={styles.dynamicGrid}>
            {feed.items.map((item) => (
              <DynamicCardView dynamic={item} key={item.dynamicId} />
            ))}
          </div>
          <nav className={styles.pagination} aria-label="动态列表分页">
            {cursor ? (
              <Link href={feedHref(query)}>返回最新动态</Link>
            ) : (
              <span />
            )}
            {feed.hasNext && feed.nextCursor ? (
              <Link href={feedHref(query, feed.nextCursor)}>
                更多动态 <span aria-hidden="true">→</span>
              </Link>
            ) : (
              <span>已到末尾</span>
            )}
          </nav>
        </>
      ) : (
        <div
          className={`${styles.empty} ${styles.dynamicNotice}`}
          role="status"
        >
          <strong>{keyword ? "没有找到相关动态" : "还没有公开动态"}</strong>
          <span>稍后再来看看，发现雪友们的新分享。</span>
          {keyword ? <Link href={routes.dynamics}>清除搜索</Link> : null}
          {cursor ? <Link href={feedHref(query)}>返回最新动态</Link> : null}
        </div>
      )}
    </main>
  );
}
