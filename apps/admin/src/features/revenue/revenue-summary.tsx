import { AdminParagraph } from "@/components/admin-paragraph";
import type { RevenueView } from "@/features/revenue/revenue-model";
import { formatRevenue } from "@/features/revenue/revenue-model";
import styles from "@/app/admin/merchant/revenue/page.module.css";

export function RevenueSummary({ view }: { view: RevenueView }) {
  if (view.status === "loading")
    return <AdminParagraph role="status">正在读取收益...</AdminParagraph>;
  if (view.status !== "ready") return null;
  const { summary } = view;
  const maximum = summary.daily.reduce((max, day) => {
    const value = cents(day.amount);
    return value > max ? value : max;
  }, 0n);
  return (
    <>
      <section className={styles.cards} aria-label="收益汇总">
        <div className={styles.metric}>
          <span>区间总收益</span>
          <strong>{formatRevenue(summary.totalAmount)}</strong>
        </div>
        <div className={styles.metric}>
          <span>统计区间</span>
          <strong>
            {summary.fromDate} 至 {summary.toDate}
          </strong>
        </div>
        <div className={styles.metric}>
          <span>有收益记录的日期</span>
          <strong>{summary.daily.length} 天</strong>
        </div>
      </section>
      <section aria-label="每日收益趋势">
        <h2>每日收益</h2>
        {summary.daily.length ? (
          <ol className={styles.daily}>
            {summary.daily.map((day) => (
              <li key={day.date}>
                <time dateTime={day.date}>{day.date}</time>
                <meter
                  aria-label={`${day.date} 收益相对峰值`}
                  min={0}
                  max={1000}
                  value={
                    maximum ? Number((cents(day.amount) * 1000n) / maximum) : 0
                  }
                />
                <strong>{formatRevenue(day.amount)}</strong>
              </li>
            ))}
          </ol>
        ) : (
          <AdminParagraph>该区间暂无收益记录</AdminParagraph>
        )}
      </section>
    </>
  );
}

function cents(amount: string) {
  const [whole = "0", fraction = "00"] = amount.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}
