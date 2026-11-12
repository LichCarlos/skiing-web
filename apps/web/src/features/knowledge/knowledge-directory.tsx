import { SiteNavigation } from "@/components/site-navigation";
import { ArticleCard } from "@/features/public-content/article-card";
import { ArticleFavorites } from "@/features/article-favorites/article-favorites";
import Link from "next/link";
import { routes } from "@/config/routes";
import { getPageHref } from "@/platform/config";
import styles from "@/app/public-site.module.css";

import {
  knowledgePageHref,
  type KnowledgeFilters,
  type KnowledgeState,
} from "@/features/knowledge/knowledge-query";

export function KnowledgeDirectory({
  filters,
  state,
}: {
  filters: KnowledgeFilters;
  state: KnowledgeState;
}) {
  const { keyword, categoryValue } = filters;
  const query = state.status === "loaded" ? state.query : "";
  const articles = state.status === "loaded" ? state.articles : null;
  const categories = state.status === "loaded" ? (state.categories ?? []) : [];
  const page =
    state.status === "loaded"
      ? Number(new URLSearchParams(query).get("page"))
      : 1;

  return (
    <main className={styles.page} data-page-tone="knowledge">
      <SiteNavigation active="knowledge" />

      <section className={styles.listIntro}>
        <h1>从第一条雪道开始</h1>
        <p>装备、安全与滑行技巧，按自己的节奏了解滑雪。</p>
      </section>

      <form
        className={styles.knowledgeFilters}
        action={getPageHref(routes.knowledge)}
        method="get"
      >
        <label>
          <span>搜索标题或摘要</span>
          <input
            name="keyword"
            defaultValue={keyword}
            maxLength={100}
            placeholder="搜索滑雪知识"
          />
        </label>
        <label>
          <span>文章分类</span>
          <select name="categoryValue" defaultValue={categoryValue}>
            <option value="">全部分类</option>
            {categoryValue &&
            !categories.some((category) => category.value === categoryValue) ? (
              <option value={categoryValue}>当前分类：{categoryValue}</option>
            ) : null}
            {categories.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>
        </label>
        <button className={styles.filterButton} type="submit">
          筛选
        </button>
      </form>

      {state.status === "loaded" && state.categories === null ? (
        <div
          className={`${styles.notice} ${styles.knowledgeNotice}`}
          role="alert"
        >
          <strong>文章分类暂时无法加载</strong>
          <span>仍可查看文章和搜索，当前筛选已保留。</span>
          <Link href={knowledgePageHref(query, page)}>重新加载分类</Link>
        </div>
      ) : null}
      {state.status === "invalid" ? (
        <div
          className={`${styles.notice} ${styles.knowledgeNotice}`}
          role="alert"
        >
          <strong>请检查筛选条件</strong>
          <span>{state.message}</span>
          <Link href={routes.knowledge}>返回第一页</Link>
        </div>
      ) : articles === null ? (
        <div
          className={`${styles.notice} ${styles.knowledgeNotice}`}
          role="alert"
        >
          <strong>知识文章暂时无法加载</strong>
          <span>连接服务失败，请稍后重试。</span>
          <Link href={`${routes.knowledge}?${query}`}>
            重新加载 <span aria-hidden="true">↻</span>
          </Link>
        </div>
      ) : articles?.items.length ? (
        <>
          <div className={styles.resultSummary}>
            <span>{articles.total} 篇公开文章</span>
            <span>按发布时间排序</span>
          </div>
          <ArticleFavorites
            path={`/articles?${query}`}
            ids={articles.items.map((article) => article.articleId)}
          >
            <div className={styles.articleGrid}>
              {articles.items.map((article) => (
                <ArticleCard article={article} key={article.articleId} />
              ))}
            </div>
          </ArticleFavorites>
          <nav className={styles.pagination} aria-label="文章列表分页">
            {page > 1 ? (
              <Link href={knowledgePageHref(query, page - 1)}>← 上一页</Link>
            ) : (
              <span />
            )}
            <span>第 {articles.page} 页</span>
            {articles.hasNext ? (
              <Link href={knowledgePageHref(query, page + 1)}>下一页 →</Link>
            ) : (
              <span>已到末页</span>
            )}
          </nav>
        </>
      ) : (
        <div
          className={`${styles.empty} ${styles.knowledgeNotice}`}
          role="status"
        >
          <strong>
            {keyword || categoryValue ? "没有找到相关文章" : "暂时没有公开文章"}
          </strong>
          <span>调整关键词或分类后再试试。</span>
          {keyword || categoryValue ? (
            <Link href={routes.knowledge}>清除筛选</Link>
          ) : null}
          {page > 1 ? (
            <Link href={knowledgePageHref(query, page - 1)}>← 上一页</Link>
          ) : null}
        </div>
      )}
    </main>
  );
}
