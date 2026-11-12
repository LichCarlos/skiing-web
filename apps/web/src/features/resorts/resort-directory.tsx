import { SiteNavigation } from "@/components/site-navigation";
import Image from "next/image";
import Link from "next/link";
import { routes } from "@/config/routes";
import { getPageHref } from "@/platform/config";
import {
  formatResortDistance,
  resortPageHref,
  resortSorts,
  resortStatuses,
  type DirectoryState,
  type ResortCard,
  type ResortFitTag,
  type ResortFilters,
} from "@/features/resorts/resort-query";
import styles from "@/app/public-site.module.css";

export function ResortDirectory({
  filters,
  state,
  fitTags = null,
}: {
  filters: ResortFilters;
  state: DirectoryState;
  fitTags?: ResortFitTag[] | null;
}) {
  const result = state.status === "ready" ? state.data : null;
  return (
    <main className={styles.page} data-page-tone="resorts">
      <SiteNavigation active="resorts" />
      <section className={styles.listIntro}>
        <h1>找到适合你的雪道</h1>
        <p>按目的地、价格、开放状态和口碑，规划下一次上山。</p>
        <Link href={routes.catalog}>按扩展字段筛选公开数据</Link>
      </section>
      <form
        className={styles.filters}
        action={getPageHref(routes.resorts)}
        method="get"
      >
        {(
          [
            ["keyword", "雪场名称或地区", 100],
            ["province", "省份", 50],
            ["city", "城市", 50],
            ["district", "区县", 50],
          ] as const
        ).map(([key, label, maxLength]) => (
          <label key={key}>
            <span>{label}</span>
            <input
              name={key}
              defaultValue={filters[key]}
              maxLength={maxLength}
            />
          </label>
        ))}
        {(
          [
            ["minPrice", "最低价格（元）", 0, undefined, 1],
            ["maxPrice", "最高价格（元）", 0, undefined, 1],
            ["minRating", "最低评分", 0, 5, "any"],
            ["latitude", "参考纬度", -90, 90, "any"],
            ["longitude", "参考经度", -180, 180, "any"],
          ] as const
        ).map(([key, label, min, max, step]) => (
          <label key={key}>
            <span>{label}</span>
            <input
              name={key}
              type="number"
              defaultValue={filters[key]}
              min={min}
              max={max}
              step={step}
            />
          </label>
        ))}
        <label>
          <span>营业状态</span>
          <select name="openStatus" defaultValue={filters.openStatus}>
            <option value="">全部状态</option>
            {Object.entries(resortStatuses).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>排序</span>
          <select name="sortBy" defaultValue={filters.sortBy}>
            {Object.entries(resortSorts).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>排序方向</span>
          <select name="sortOrder" defaultValue={filters.sortOrder}>
            <option value="asc">从低到高 / 升序</option>
            <option value="desc">从高到低 / 降序</option>
          </select>
        </label>
        <fieldset className={styles.fitTags}>
          <legend>适配标签</legend>
          {fitTags === null ? (
            <p role="status">标签选项暂不可用，当前已选项仍保留。</p>
          ) : null}
          {(() => {
            const options = fitTags ?? [];
            const selectedOnly = filters.fitTags
              .filter((value) => !options.some((tag) => tag.value === value))
              .map((value) => ({ value, label: value }));
            const all = [...options, ...selectedOnly];
            return all.length ? (
              all.map((tag) => (
                <label key={tag.value}>
                  <input
                    type="checkbox"
                    name="fitTags"
                    value={tag.value}
                    defaultChecked={filters.fitTags.includes(tag.value)}
                  />
                  <span>{tag.label}</span>
                </label>
              ))
            ) : (
              <p>暂无可筛选的适配标签</p>
            );
          })()}
        </fieldset>
        <button className={styles.filterButton} type="submit">
          应用筛选 →
        </button>
        <Link href={routes.resorts}>清除筛选</Link>
        <p className={styles.filterHint}>
          按距离排序时，同时填写参考纬度和经度；距离为直线距离。
        </p>
      </form>
      {state.status === "invalid" ? (
        <div className={styles.notice} role="alert">
          <strong>请检查筛选条件</strong>
          <span>{state.message}</span>
          <Link href={routes.resorts}>返回第一页并清除筛选</Link>
        </div>
      ) : state.status === "error" ? (
        <div className={styles.notice} role="alert">
          <strong>雪场目录暂时不可用</strong>
          <span>连接服务失败，请稍后重试。</span>
          <Link href={resortPageHref(state.query, Number(filters.page))}>
            重新加载 ↻
          </Link>
        </div>
      ) : result?.items.length ? (
        <>
          <div className={styles.resultSummary}>
            <span>
              找到 <strong>{result.total}</strong> 座雪场
            </span>
            <span>第 {result.page} 页</span>
          </div>
          <div className={styles.resortGrid}>
            {result.items.map((resort, index) => (
              <ResortCardView
                key={resort.resortId}
                resort={resort}
                index={index}
              />
            ))}
          </div>
          <nav className={styles.pagination} aria-label="雪场列表分页">
            {result.page > 1 ? (
              <Link href={resortPageHref(state.query, result.page - 1)}>
                ← 上一页
              </Link>
            ) : (
              <span />
            )}
            {result.hasNext ? (
              <Link href={resortPageHref(state.query, result.page + 1)}>
                下一页 →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        </>
      ) : (
        <div className={styles.empty} role="status">
          <strong>没有找到符合条件的雪场</strong>
          <span>试试缩短关键词或清除筛选条件。</span>
          {result && result.page > 1 ? (
            <Link href={resortPageHref(state.query, result.page - 1)}>
              ← 上一页
            </Link>
          ) : null}
          <Link href={routes.resorts}>清除筛选 ↻</Link>
        </div>
      )}
    </main>
  );
}
function ResortCardView({
  resort,
  index,
}: {
  resort: ResortCard;
  index: number;
}) {
  const distance = formatResortDistance(resort.distanceMeters);
  return (
    <Link
      className={styles.resortCard}
      href={routes.resortDetail(resort.resortId)}
    >
      <div className={styles.cardImage}>
        {resort.coverUrl ? (
          <Image
            src={resort.coverUrl}
            alt={`${resort.name}雪场`}
            fill
            unoptimized
            sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 33vw"
          />
        ) : (
          <span className={styles.coverPlaceholder}>雪场图片待更新</span>
        )}
        <span className={styles.cardNumber}>
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className={styles.status} data-status={resort.openStatus}>
          {resortStatuses[resort.openStatus]}
        </span>
      </div>
      <div className={styles.cardInfo}>
        <div>
          <h2>{resort.name}</h2>
          <p>
            {[
              resort.region.province,
              resort.region.city,
              resort.region.district,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className={styles.rating}>
          <span aria-hidden="true">★</span>
          {resort.rating === null ? "暂无评分" : resort.rating.toFixed(1)}
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
          {resort.startingPrice === null
            ? "价格待更新"
            : `¥${resort.startingPrice} 起`}
        </span>
      </div>
      {distance ? (
        <p className={styles.cardDistance}>距参考点 {distance}</p>
      ) : null}
    </Link>
  );
}
