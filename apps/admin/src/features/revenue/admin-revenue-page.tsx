"use client";
import { AdminParagraph } from "@/components/admin-paragraph";
import { FormHint } from "@/components/form-hint";

import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { Alert, Button, Input, Table } from "antd";
import type { components } from "@common/api-contracts/openapi";
import { useSession } from "@/platform/auth/session-provider";
import { apiRequest } from "@/platform/api";
import { RequestLane } from "@/platform/api/request-lane";
import {
  revenueOperatorKey,
  type RevenueOperator,
} from "@/features/revenue/merchant-revenue-model";
import {
  buildRevenueInput,
  formatRevenue,
} from "@/features/revenue/revenue-model";
import {
  adminRevenueQuery,
  browserRevenueRecovery,
  canUseAdminRevenue,
  readAdminRevenue,
  type RevenueRecovery,
} from "@/features/revenue/admin-revenue-workflow";
import {
  browserRevenueImportRecovery,
  type RevenueImportRecovery,
} from "@/features/revenue/admin-revenue-import-workflow";
import styles from "@/app/admin/system/revenue/page.module.css";
import { AdminRevenueVisibility } from "@/features/revenue/admin-revenue-visibility";

export function AdminRevenuePage() {
  const { session, retryRestore } = useSession();
  if (session.status !== "authenticated")
    return (
      <section role="status">
        <AdminParagraph>
          {session.status === "loading"
            ? "正在确认登录身份"
            : "请先恢复登录身份"}
        </AdminParagraph>
        <Button onClick={() => void retryRestore()}>重新读取身份</Button>
      </section>
    );
  const actor = session.currentUser;
  if (
    !canUseAdminRevenue(actor, "list") &&
    !canUseAdminRevenue(actor, "upsert")
  )
    return (
      <AdminParagraph role="alert">当前账号没有收益管理权限</AdminParagraph>
    );
  return (
    <AdminRevenueVisibility key={revenueOperatorKey(actor)} actor={actor}>
      {(signal) => <RevenueContent actor={actor} signal={signal} />}
    </AdminRevenueVisibility>
  );
}
function RevenueContent({
  actor,
  signal,
}: {
  actor: RevenueOperator;
  signal: AbortSignal;
}) {
  const [recovery, setRecovery] = useState<RevenueRecovery>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    try {
      setRecovery(browserRevenueRecovery(actor.userId));
    } catch {
      setError("浏览器会话存储不可用，暂时无法保存收益请求");
    }
  }, [actor.userId]);
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1>收益维护</h1>
      </header>
      {error ? <Alert type="error" title={error} role="alert" /> : null}
      {canUseAdminRevenue(actor, "list") ? (
        <RevenueRecords actor={actor} signal={signal} />
      ) : (
        <AdminParagraph>当前账号没有收益查询权限</AdminParagraph>
      )}
      {canUseAdminRevenue(actor, "upsert") && recovery ? (
        <RevenueEditor actor={actor} recovery={recovery} signal={signal} />
      ) : null}
      <RevenueImportPanel actor={actor} signal={signal} />
    </main>
  );
}

function RevenueImportPanel({
  actor,
  signal,
}: {
  actor: RevenueOperator;
  signal: AbortSignal;
}) {
  const [recovery, setRecovery] = useState<RevenueImportRecovery>();
  const [, redraw] = useState(0);
  const [error, setError] = useState<string>();
  const [working, setWorking] = useState(false);
  useEffect(() => {
    if (!canUseAdminRevenue(actor, "upsert") || signal.aborted) return;
    try {
      const current = browserRevenueImportRecovery(actor.userId);
      setRecovery(current);
      const unsubscribe = current.subscribe(() => {
        if (!signal.aborted) redraw((value) => value + 1);
      });
      void current.restore();
      return () => unsubscribe();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, [actor, signal]);
  if (!canUseAdminRevenue(actor, "upsert")) return null;
  async function run(action: () => Promise<unknown>) {
    if (
      working ||
      !recovery ||
      signal.aborted ||
      document.visibilityState !== "visible"
    )
      return;
    setWorking(true);
    setError(undefined);
    try {
      await action();
    } catch (cause) {
      if (!signal.aborted) setError(errorMessage(cause));
    } finally {
      if (!signal.aborted) setWorking(false);
    }
  }
  const attempt = recovery?.snapshot();
  const terminal = Boolean(
    attempt?.job?.result || attempt?.rejected || attempt?.blocked,
  );
  return (
    <section className={styles.section}>
      <h2>CSV 批量导入</h2>
      <AdminParagraph className={styles.hint}>
        导入文件暂存于当前浏览器，确认结果后可清理本机记录。
      </AdminParagraph>
      {error || recovery?.errorSnapshot()?.message ? (
        <Alert
          role="alert"
          type="error"
          title={error ?? recovery?.errorSnapshot()?.message}
        />
      ) : null}
      {!recovery?.ready ? (
        <AdminParagraph role="status">正在读取本机导入记录</AdminParagraph>
      ) : null}
      {attempt ? (
        <div className={styles.importSummary}>
          <AdminParagraph>
            文件：{attempt.fileName} · 幂等键：{attempt.requestId}
          </AdminParagraph>
          {attempt.job ? (
            <AdminParagraph>
              任务 {attempt.job.jobId}：{attempt.job.status}，已处理{" "}
              {attempt.job.processedRows}/{attempt.job.totalRows} 行，成功{" "}
              {attempt.job.succeededRows}，失败 {attempt.job.failedRows}
            </AdminParagraph>
          ) : (
            <AdminParagraph>尚未收到任务编号</AdminParagraph>
          )}
          <div>
            {!attempt.jobId && !attempt.rejected && !attempt.blocked ? (
              <Button
                type="primary"
                loading={working || (recovery?.busy ?? false)}
                onClick={() => {
                  if (recovery)
                    void run(() => recovery.upload(apiRequest, actor, signal));
                }}
              >
                手动提交原文件
              </Button>
            ) : null}
            {attempt.jobId && !terminal ? (
              <Button
                loading={working || (recovery?.busy ?? false)}
                onClick={() => {
                  if (recovery)
                    void run(() => recovery.query(apiRequest, actor, signal));
                }}
              >
                手动查询任务
              </Button>
            ) : null}
            {terminal ? (
              <Button
                disabled={working || (recovery?.busy ?? false)}
                onClick={() => {
                  if (
                    attempt.blocked &&
                    !window.confirm(
                      "服务端无法继续核对该请求。请先在收益记录中人工核对，再结束本次导入。",
                    )
                  )
                    return;
                  if (recovery) void run(() => recovery.clear());
                }}
              >
                确认结果并清理本机记录
              </Button>
            ) : null}
          </div>
          {attempt.job?.result ? (
            <Table
              rowKey="rowNumber"
              dataSource={attempt.job.result.results}
              pagination={{
                pageSize: 20,
                showSizeChanger: true,
                pageSizeOptions: [20, 50, 100],
              }}
              scroll={{ x: 540 }}
              columns={[
                { title: "CSV 行", dataIndex: "rowNumber", width: 90 },
                {
                  title: "结果",
                  render: (_, row) => (row.success ? "成功" : "失败"),
                  width: 90,
                },
                { title: "收益记录", dataIndex: "revenueId", width: 110 },
                { title: "原因", dataIndex: "error" },
              ]}
            />
          ) : null}
        </div>
      ) : (
        <Input
          type="file"
          aria-label="选择收益CSV文件"
          aria-describedby="revenue-csv-hint"
          accept=".csv,text/csv,application/csv,application/vnd.ms-excel"
          disabled={working || !recovery?.ready}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file && recovery)
              void run(() => recovery.choose(file, undefined, signal));
            event.currentTarget.value = "";
          }}
        />
      )}
      <FormHint id="revenue-csv-hint">
        选择符合本页模板的CSV文件；先核对预检结果再提交导入，单行结果可在导入后查看。
      </FormHint>
    </section>
  );
}
function RevenueRecords({
  actor,
  signal: lifetime,
}: {
  actor: RevenueOperator;
  signal: AbortSignal;
}) {
  const [draft, setDraft] = useState({
    resortId: "",
    fromDate: "",
    toDate: "",
  });
  const [applied, setApplied] = useState({ ...draft, page: 1, pageSize: 20 });
  const [records, setRecords] =
    useState<components["schemas"]["RevenuePageVO"]>();
  const [loading, setLoading] = useState(true),
    [error, setError] = useState<string>();
  const [lane] = useState(() => new RequestLane());
  const [recordsKey, setRecordsKey] = useState("");
  const queryKey = JSON.stringify(applied);
  const reload = useCallback(async () => {
    if (lifetime.aborted || document.visibilityState !== "visible") return;
    setLoading(true);
    setRecords(undefined);
    setError(undefined);
    await lane.run(
      (signal) =>
        readAdminRevenue(
          apiRequest,
          actor,
          adminRevenueQuery(applied, applied.page, applied.pageSize),
          signal,
        ),
      (value) => {
        if (!lifetime.aborted) {
          setRecords(value);
          setRecordsKey(JSON.stringify(applied));
        }
      },
      (cause) => setError(errorMessage(cause)),
      () => setLoading(false),
    );
  }, [actor, applied, lane, lifetime]);
  useEffect(() => {
    const cancel = () => lane.cancel();
    lifetime.addEventListener("abort", cancel);
    void reload();
    return () => {
      lane.cancel();
      lifetime.removeEventListener("abort", cancel);
    };
  }, [reload, lane, lifetime]);
  function apply(event: FormEvent) {
    event.preventDefault();
    if (lifetime.aborted || document.visibilityState !== "visible") return;
    try {
      adminRevenueQuery(draft, 1, applied.pageSize);
      setApplied({ ...draft, page: 1, pageSize: applied.pageSize });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  return (
    <section className={styles.section}>
      <h2>收益查询</h2>
      <form className={styles.form} onSubmit={apply}>
        {(
          [
            ["resortId", "雪场 ID"],
            ["fromDate", "开始日期"],
            ["toDate", "结束日期"],
          ] as const
        ).map(([key, label]) => (
          <div className={styles.field} key={key}>
            <label htmlFor={`query-${key}`}>{label}</label>
            <Input
              id={`query-${key}`}
              aria-describedby={`query-${key}-hint`}
              type={key === "resortId" ? "text" : "date"}
              value={draft[key]}
              onChange={(event) =>
                setDraft({ ...draft, [key]: event.target.value })
              }
            />
            <FormHint id={`query-${key}-hint`}>
              {key === "resortId"
                ? "选填有效雪场ID（正整数），留空查询获授权范围内全部雪场。"
                : "选填有效日期，开始日期不得晚于结束日期；留空表示不限该端日期。"}
            </FormHint>
          </div>
        ))}
        <div>
          <Button htmlType="submit">查询</Button>{" "}
          <Button onClick={() => void reload()}>刷新已应用条件</Button>
        </div>
      </form>
      <AdminParagraph>
        已应用：雪场 {applied.resortId || "全部授权范围"}，
        {applied.fromDate || "不限开始日期"} 至{" "}
        {applied.toDate || "不限结束日期"}
      </AdminParagraph>
      {error ? <Alert role="alert" type="error" title={error} /> : null}
      {loading ? (
        <AdminParagraph role="status">正在读取收益</AdminParagraph>
      ) : null}
      {records && recordsKey === queryKey ? (
        <>
          <Table
            rowKey="revenueId"
            dataSource={records.items}
            scroll={{ x: 900 }}
            columns={[
              { title: "雪场", dataIndex: "resortName" },
              { title: "日期", dataIndex: "reportDate" },
              {
                title: "金额",
                dataIndex: "revenueAmount",
                render: formatRevenue,
              },
              { title: "来源", dataIndex: "source" },
              { title: "备注", dataIndex: "note" },
              {
                title: "录入人",
                render: (_, record) => record.createdBy.nickname,
              },
              { title: "更新时间", dataIndex: "updatedAt" },
            ]}
            pagination={{
              current: records.page,
              pageSize: records.pageSize,
              total: records.total,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50, 100],
              onChange: (page, pageSize) => {
                if (lifetime.aborted || document.visibilityState !== "visible")
                  return;
                setApplied({
                  ...applied,
                  page: pageSize === applied.pageSize ? page : 1,
                  pageSize,
                });
              },
            }}
          />
          {records.page > 1 && !records.items.length ? (
            <Button onClick={() => setApplied({ ...applied, page: 1 })}>
              返回第一页
            </Button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
function RevenueEditor({
  actor,
  recovery,
  signal,
}: {
  actor: RevenueOperator;
  recovery: RevenueRecovery;
  signal: AbortSignal;
}) {
  const attempt = useSyncExternalStore(
    recovery.subscribe,
    recovery.snapshot,
    () => undefined,
  );
  const [input, setInput] = useState({
    resortId: "",
    reportDate: "",
    revenueAmount: "",
    note: "",
  });
  const [working, setWorking] = useState(false),
    [error, setError] = useState<string>();
  async function run(action: () => Promise<void>) {
    if (
      working ||
      recovery.busy ||
      signal.aborted ||
      document.visibilityState !== "visible"
    )
      return;
    setWorking(true);
    setError(undefined);
    try {
      await action();
    } catch (cause) {
      if (!signal.aborted) setError(errorMessage(cause));
    } finally {
      if (!signal.aborted) setWorking(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await recovery.send(
        apiRequest,
        actor,
        buildRevenueInput({ ...input, resortId: Number(input.resortId) }),
        undefined,
        signal,
      );
    });
  }
  return (
    <section className={styles.section}>
      <h2>单条记录</h2>
      {error ? <Alert role="alert" type="error" title={error} /> : null}
      {attempt ? (
        <div role="status">
          <AdminParagraph>原请求：{attempt.requestId}</AdminParagraph>
          <AdminParagraph>
            雪场 {attempt.body.resortId} · {attempt.body.reportDate} ·{" "}
            {formatRevenue(attempt.body.revenueAmount)}
          </AdminParagraph>
          <AdminParagraph>
            {attempt.result
              ? "已核对：该请求已提交。后续更新不会改变此原始结果。"
              : attempt.rejected
                ? "服务端明确拒绝此请求，未完成保存。"
                : attempt.blocked
                  ? "原请求已过期或内容冲突，禁止复用或自动换键，请联系管理员核对。"
                  : "结果尚未确认。404仅表示尚无可见结果，原请求可能仍在执行。"}
          </AdminParagraph>
          <Button
            disabled={working || recovery.busy}
            onClick={() =>
              void run(() => recovery.review(apiRequest, actor, signal))
            }
          >
            核对原请求
          </Button>{" "}
          {attempt.checked &&
          !attempt.result &&
          !attempt.blocked &&
          !attempt.rejected ? (
            <Button
              disabled={working || recovery.busy}
              onClick={() =>
                void run(async () => {
                  await recovery.send(
                    apiRequest,
                    actor,
                    undefined,
                    undefined,
                    signal,
                  );
                })
              }
            >
              使用原键和原内容重试
            </Button>
          ) : null}
          {attempt.result || attempt.rejected ? (
            <Button
              disabled={working || recovery.busy}
              onClick={() => {
                if (signal.aborted || document.visibilityState !== "visible")
                  return;
                try {
                  recovery.acknowledge();
                  setError(undefined);
                } catch (cause) {
                  setError(errorMessage(cause));
                }
              }}
            >
              确认结果并结束本次录入
            </Button>
          ) : null}
        </div>
      ) : (
        <form onSubmit={submit} className={styles.form}>
          {(
            [
              ["resortId", "雪场 ID"],
              ["reportDate", "统计日期"],
              ["revenueAmount", "收益金额"],
              ["note", "备注"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className={styles.field}>
              <label htmlFor={`write-${key}`}>{label}</label>
              <Input
                id={`write-${key}`}
                aria-describedby={`write-${key}-hint`}
                type={key === "reportDate" ? "date" : "text"}
                value={input[key]}
                disabled={working}
                maxLength={key === "note" ? 300 : undefined}
                onChange={(event) =>
                  setInput({ ...input, [key]: event.target.value })
                }
              />
              <FormHint id={`write-${key}-hint`}>
                {
                  {
                    resortId: "必填，1至2147483647的雪场ID，需属于可维护范围。",
                    reportDate: "必填，选择收益对应的有效统计日期。",
                    revenueAmount:
                      "必填，单位为元，非负金额，最多10位整数及2位小数；相同雪场与日期按现有记录维护。",
                    note: "选填，补充本次收益记录的说明，最多300字。",
                  }[key]
                }
              </FormHint>
            </div>
          ))}
          <Button
            htmlType="submit"
            type="primary"
            loading={working}
            disabled={recovery.busy}
          >
            保存记录
          </Button>
        </form>
      )}
    </section>
  );
}
function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : "收益处理失败，请核对后重试";
}
