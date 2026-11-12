import { AdminParagraph } from "@/components/admin-paragraph";
import type {
  DashboardSummary,
  SummaryState,
} from "@/features/dashboard/summary-model";
import styles from "@/app/admin/dashboard.module.css";
import { Button, Skeleton } from "antd";

export function SummaryPanels({
  state,
  retry,
}: {
  state: SummaryState;
  retry: () => void;
}) {
  if (state.status === "loading")
    return (
      <div className={styles.loading} role="status">
        <span>正在读取工作台汇总…</span>
        <Skeleton active paragraph={{ rows: 2 }} title={false} />
      </div>
    );
  if (state.status === "error")
    return (
      <div className={styles.error} role="alert">
        <AdminParagraph>{state.message}</AdminParagraph>
        {state.traceId ? (
          <AdminParagraph>请求编号：{state.traceId}</AdminParagraph>
        ) : null}
        <Button onClick={retry}>重试汇总</Button>
      </div>
    );
  const data = state.data;
  const visible = [
    data.users,
    data.merchants,
    data.resorts,
    data.articles,
    data.dynamics,
    data.rag,
    data.revenue,
  ].some((panel) => panel !== null);
  return (
    <>
      <AdminParagraph className={styles.empty}>
        统计时间：
        <time dateTime={data.generatedAt}>
          {new Date(data.generatedAt).toLocaleString("zh-CN", {
            timeZone: "Asia/Shanghai",
            hour12: false,
          })}
          （北京时间）
        </time>
      </AdminParagraph>
      {!visible ? (
        <AdminParagraph>
          当前账号尚无可展示的统计面板，请联系管理员配置读取权限。
        </AdminParagraph>
      ) : (
        <div className={styles.summaryGrid}>
          {data.users ? (
            <Counts
              title="账号"
              scope="账号查询授权范围（含停用账号）"
              values={data.users}
              labels={{ total: "总数", active: "启用", disabled: "停用" }}
            />
          ) : null}
          {data.merchants ? (
            <Counts
              title="商家资料"
              scope="可见账号关联资料（按资料状态统计）"
              values={data.merchants}
              labels={{ total: "总数", active: "启用", disabled: "停用" }}
            />
          ) : null}
          {data.resorts ? (
            <Counts
              title="雪场"
              scope="雪场查询授权范围（不含已删除）"
              values={data.resorts}
              labels={{
                total: "总数",
                draft: "草稿",
                pendingReview: "待审核",
                published: "已发布",
                offline: "已下架",
              }}
            />
          ) : null}
          {data.articles ? (
            <Counts
              title="知识文章"
              scope="文章管理授权范围（不含已删除）"
              values={data.articles}
              labels={{
                total: "总数",
                draft: "草稿",
                published: "已发布",
                withdrawn: "已撤回",
              }}
            />
          ) : null}
          {data.dynamics ? (
            <Counts
              title="社区动态"
              scope="全局审核范围（不含已删除）"
              values={data.dynamics}
              labels={{
                total: "总数",
                pending: "待审核",
                published: "已发布",
                hidden: "已隐藏",
              }}
            />
          ) : null}
          {data.rag ? (
            <Counts
              title="RAG 索引"
              scope="全局知识索引失败记录"
              values={data.rag}
              labels={{ failed: "失败数量" }}
            />
          ) : null}
          {data.revenue ? <RevenuePanel revenue={data.revenue} /> : null}
        </div>
      )}
      <Button onClick={retry}>刷新统计</Button>
    </>
  );
}
function Counts<T extends Record<string, number>>({
  title,
  scope,
  values,
  labels,
}: {
  title: string;
  scope: string;
  values: T;
  labels: Record<keyof T, string>;
}) {
  return (
    <section className={styles.summaryCard} aria-label={title}>
      <h3>{title}</h3>
      <AdminParagraph>{scope}</AdminParagraph>
      <dl>
        {Object.entries(labels).map(([key, label]) => (
          <div key={key} data-primary={key === "total" || key === "failed"}>
            <dt>{label}</dt>
            <dd>{values[key]}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
function RevenuePanel({
  revenue,
}: {
  revenue: NonNullable<DashboardSummary["revenue"]>;
}) {
  return (
    <section
      className={`${styles.summaryCard} ${styles.revenueCard}`}
      aria-label="累计收益"
    >
      <h3>累计收益</h3>
      <AdminParagraph>
        {revenue.scope === "all" ? "全平台有效雪场" : "本人商家获授权雪场"} ·
        全部时间
      </AdminParagraph>
      <AdminParagraph className={styles.amount}>
        {revenue.amount} 元（CNY）
      </AdminParagraph>
    </section>
  );
}
