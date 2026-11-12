import { AdminParagraph } from "@/components/admin-paragraph";
import Link from "next/link";
import { routes } from "@/config/routes";
import { formatRevenue } from "@/features/revenue/revenue-model";
import { RevenueSummary } from "@/features/revenue/revenue-summary";
import {
  lifecycleLabels,
  type DashboardView,
  type Panel,
} from "@/features/merchant-dashboard/dashboard-model";
import styles from "@/features/merchant-dashboard/dashboard.module.css";

export function DashboardSections({ view }: { view: DashboardView }) {
  return (
    <div className={styles.sections}>
      <section
        className={styles.section}
        aria-labelledby="dashboard-resorts-title"
      >
        <h2 id="dashboard-resorts-title">我的雪场</h2>
        {view.resorts.status === "ready" ? (
          <>
            <AdminParagraph>
              符合筛选的雪场：<strong>{view.resorts.data.total}</strong> 家
            </AdminParagraph>
            <AdminParagraph className={styles.hint}>
              最近更新的 5 家雪场
            </AdminParagraph>
            {view.resorts.data.items.length ? (
              <ul className={styles.resorts}>
                {view.resorts.data.items.map((resort) => (
                  <li key={resort.resortId}>
                    <div>
                      <strong>{resort.name}</strong>
                      <AdminParagraph>
                        {[resort.province, resort.city, resort.district]
                          .filter(Boolean)
                          .join(" / ") || "地区未填写"}
                      </AdminParagraph>
                    </div>
                    <span>{lifecycleLabels[resort.status] ?? "未知状态"}</span>
                    <time dateTime={resort.updatedAt}>
                      {new Date(resort.updatedAt).toLocaleString("zh-CN")}
                    </time>
                  </li>
                ))}
              </ul>
            ) : (
              <AdminParagraph>当前范围和筛选条件下暂无雪场</AdminParagraph>
            )}
            <Link href={routes.merchantResorts}>查看全部雪场</Link>
          </>
        ) : (
          <PanelNotice panel={view.resorts} label="雪场" />
        )}
      </section>
      <section
        className={styles.section}
        aria-labelledby="dashboard-revenue-title"
      >
        <h2 id="dashboard-revenue-title">经营收益</h2>
        {view.revenue.status === "ready" ? (
          <>
            <RevenueSummary view={view.revenue.data} />
            <h3>区间内最近 5 条收益记录</h3>
            {view.revenue.data.records.items.length ? (
              <div className={styles.tableScroll}>
                <table>
                  <caption className={styles.srOnly}>
                    区间内最近收益记录
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">日期</th>
                      <th scope="col">雪场</th>
                      <th scope="col">金额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.revenue.data.records.items.map((record) => (
                      <tr key={record.revenueId}>
                        <td>
                          <time dateTime={record.reportDate}>
                            {record.reportDate}
                          </time>
                        </td>
                        <td>{record.resortName}</td>
                        <td>{formatRevenue(record.revenueAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <AdminParagraph>该区间暂无收益记录</AdminParagraph>
            )}
            <Link href={routes.merchantRevenue}>查看完整收益明细</Link>
          </>
        ) : (
          <PanelNotice panel={view.revenue} label="收益" />
        )}
      </section>
    </div>
  );
}

function PanelNotice({
  panel,
  label,
}: {
  panel: Exclude<Panel<unknown>, { status: "ready" }>;
  label: string;
}) {
  if (panel.status === "loading")
    return (
      <AdminParagraph role="status">正在读取{label}数据...</AdminParagraph>
    );
  return (
    <div role={panel.status === "error" ? "alert" : undefined}>
      <AdminParagraph>{panel.message}</AdminParagraph>
      {panel.status === "error" && panel.traceId ? (
        <AdminParagraph>请求编号：{panel.traceId}</AdminParagraph>
      ) : null}
    </div>
  );
}
