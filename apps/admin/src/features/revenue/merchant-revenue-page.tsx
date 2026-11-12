"use client";
import { AdminParagraph } from "@/components/admin-paragraph";
import { FormHint } from "@/components/form-hint";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Alert, Button, Input, Table } from "antd";
import { useSession } from "@/platform/auth/session-provider";
import {
  formatRevenue,
  type RevenueView,
} from "@/features/revenue/revenue-model";
import { RevenueSummary } from "@/features/revenue/revenue-summary";
import {
  canReadMerchantRevenue,
  initialRevenueFilters,
  revenueOperatorKey,
  revenueQuery,
  revenueReadError,
  type RevenueOperator,
  type MerchantRevenueFilters,
} from "@/features/revenue/merchant-revenue-model";
import { createMerchantRevenueRun } from "@/features/revenue/merchant-revenue-run";
import styles from "@/app/admin/merchant/revenue/page.module.css";

export function MerchantRevenueSession({
  children,
}: {
  children: (operator: RevenueOperator) => ReactNode;
}) {
  const { session, retryRestore } = useSession();
  if (session.status === "loading")
    return <AdminParagraph role="status">正在确认登录身份</AdminParagraph>;
  if (session.status !== "authenticated")
    return (
      <section role="alert">
        <AdminParagraph>
          {session.status === "unavailable" ? "会话暂时不可用" : "请先登录"}
        </AdminParagraph>
        <Button onClick={() => void retryRestore()}>重新读取身份</Button>
      </section>
    );
  const user = session.currentUser;
  if (!canReadMerchantRevenue(user))
    return (
      <section role="alert">
        <AdminParagraph>
          {!user.merchant?.merchantId
            ? "当前账号未绑定有效商家资料"
            : "当前账号没有收益查询权限"}
        </AdminParagraph>
        <Button onClick={() => void retryRestore()}>重新读取身份</Button>
      </section>
    );
  return <div key={revenueOperatorKey(user)}>{children(user)}</div>;
}
export function MerchantRevenuePage() {
  return (
    <MerchantRevenueSession>
      {(operator) => <RevenueContent operator={operator} />}
    </MerchantRevenueSession>
  );
}
function RevenueContent({ operator }: { operator: RevenueOperator }) {
  const { retryRestore } = useSession();
  const [draft, setDraft] = useState(initialRevenueFilters);
  const [query, setQuery] = useState({ filters: draft, page: 1, pageSize: 20 });
  const [view, setView] = useState<RevenueView>({ status: "loading" });
  const [error, setError] = useState<string>();
  const run = useRef<{
    reader: ReturnType<typeof createMerchantRevenueRun>;
    query: typeof query;
    operator: RevenueOperator;
  } | null>(null);
  const reload = useCallback(async () => {
    const current = run.current;
    if (
      document.visibilityState !== "visible" ||
      !current ||
      current.query !== query ||
      current.operator !== operator
    )
      return;
    return current.reader.load(query.filters, query.page, query.pageSize);
  }, [operator, query]);
  useEffect(() => {
    const next = createMerchantRevenueRun(setView, operator);
    run.current = { reader: next, query, operator };
    if (document.visibilityState === "visible")
      void next.load(query.filters, query.page, query.pageSize);
    const hide = () => {
      if (document.visibilityState !== "visible") next.clear();
    };
    const leave = () => next.clear();
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", leave);
    return () => {
      next.dispose();
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", leave);
      if (run.current?.reader === next) run.current = null;
    };
  }, [operator, query]);
  function apply(
    filters: MerchantRevenueFilters,
    page = 1,
    pageSize = query.pageSize,
  ) {
    try {
      revenueQuery(filters, page, pageSize);
      run.current?.reader.clear();
      setView({ status: "loading" });
      setError(undefined);
      setQuery({
        filters: { ...filters, resortId: filters.resortId.trim() },
        page,
        pageSize,
      });
    } catch (cause) {
      setError(revenueReadError(cause));
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    apply(draft);
  }
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1>收益数据</h1>
        <AdminParagraph>
          查看本人商家授权范围内的每日收益；修改筛选后点击查询。
        </AdminParagraph>
      </header>
      <form className={styles.filters} aria-label="收益筛选" onSubmit={submit}>
        <div className={styles.field}>
          <label htmlFor="revenue-from">开始日期</label>
          <Input
            id="revenue-from"
            aria-describedby="revenue-from-hint"
            type="date"
            value={draft.fromDate}
            onChange={(event) =>
              setDraft({ ...draft, fromDate: event.target.value })
            }
          />
          <FormHint id="revenue-from-hint">
            必填，选择查询开始日期，不得晚于结束日期。
          </FormHint>
        </div>
        <div className={styles.field}>
          <label htmlFor="revenue-to">结束日期</label>
          <Input
            id="revenue-to"
            aria-describedby="revenue-to-hint"
            type="date"
            value={draft.toDate}
            onChange={(event) =>
              setDraft({ ...draft, toDate: event.target.value })
            }
          />
          <FormHint id="revenue-to-hint">
            必填，选择查询结束日期，不得早于开始日期。
          </FormHint>
        </div>
        <div className={styles.field}>
          <label htmlFor="revenue-resort">雪场 ID</label>
          <Input
            id="revenue-resort"
            aria-describedby="revenue-resort-hint"
            inputMode="numeric"
            value={draft.resortId}
            onChange={(event) =>
              setDraft({ ...draft, resortId: event.target.value })
            }
          />
          <FormHint id="revenue-resort-hint">
            选填有效雪场ID（正整数），留空查询当前商家授权范围内全部雪场。
          </FormHint>
        </div>
        <Button htmlType="submit" type="primary">
          查询
        </Button>
        <Button
          onClick={() => {
            const next = initialRevenueFilters();
            setDraft(next);
            apply(next);
          }}
        >
          重置近30天
        </Button>
        <Button onClick={() => void reload()}>刷新已应用条件</Button>
        <Button
          onClick={() => {
            if (document.visibilityState !== "visible") return;
            run.current?.reader.clear();
            void retryRestore();
          }}
        >
          重新读取身份
        </Button>
      </form>
      {error ? <Alert type="error" title={error} /> : null}
      <AdminParagraph>
        已应用：{query.filters.fromDate} 至 {query.filters.toDate} ·{" "}
        {query.filters.resortId
          ? `雪场 ${query.filters.resortId}`
          : "本人获授权雪场"}
      </AdminParagraph>
      <RevenueSummary view={view} />
      {view.status === "error" ? (
        <section className={styles.error} role="alert">
          <span>{view.message}</span>
          <Button onClick={() => void reload()}>重试</Button>
        </section>
      ) : (
        <>
          {view.status === "ready" &&
          !view.records.items.length &&
          query.page > 1 ? (
            <Button onClick={() => apply(query.filters)}>
              当前页暂无记录，返回第一页
            </Button>
          ) : null}
          <Table
            rowKey="revenueId"
            dataSource={view.status === "ready" ? view.records.items : []}
            loading={view.status === "loading"}
            scroll={{ x: 850 }}
            locale={{ emptyText: "该区间暂无收益记录" }}
            pagination={{
              current: query.page,
              pageSize: query.pageSize,
              total: view.status === "ready" ? view.records.total : 0,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50, 100],
              onChange: (page, pageSize) =>
                apply(
                  query.filters,
                  pageSize === query.pageSize ? page : 1,
                  pageSize,
                ),
            }}
            columns={[
              { title: "日期", dataIndex: "reportDate" },
              { title: "雪场", dataIndex: "resortName" },
              {
                title: "收益金额",
                dataIndex: "revenueAmount",
                align: "right",
                render: (value: string) => formatRevenue(value),
              },
              {
                title: "来源",
                dataIndex: "source",
                render: (value: string) =>
                  value === "import" ? "批量导入" : "管理员录入",
              },
              {
                title: "备注",
                dataIndex: "note",
                render: (value: string | null) => value || "—",
              },
              {
                title: "录入人",
                render: (_, record) => record.createdBy.nickname,
              },
              {
                title: "更新时间",
                dataIndex: "updatedAt",
                render: (value: string) =>
                  new Date(value).toLocaleString("zh-CN"),
              },
            ]}
          />
        </>
      )}
    </main>
  );
}
