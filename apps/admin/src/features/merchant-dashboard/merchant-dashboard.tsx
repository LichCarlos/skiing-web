"use client";
import { AdminParagraph } from "@/components/admin-paragraph";
import { FormHint } from "@/components/form-hint";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSession } from "@/platform/auth/session-provider";
import type { CurrentUser } from "@/platform/auth/session-model";
import {
  canReadMerchantDashboard,
  merchantDashboardIdentity,
} from "@/features/merchant-dashboard/dashboard-queries";
import {
  createMerchantDashboardRun,
  loadingDashboard,
} from "@/features/merchant-dashboard/dashboard-run";
import { DashboardSections } from "@/features/merchant-dashboard/dashboard-sections";
import {
  initialDashboardFilters,
  lifecycleLabels,
  validateDashboardFilters,
  type DashboardFilters,
  type DashboardView,
} from "@/features/merchant-dashboard/dashboard-model";
import styles from "@/features/merchant-dashboard/dashboard.module.css";

export function MerchantDashboard() {
  const { session } = useSession();
  if (session.status !== "authenticated") return null;
  const user = session.currentUser;
  if (user.merchant && !canReadMerchantDashboard(user))
    return <AdminParagraph>当前账号未获商家工作台授权</AdminParagraph>;
  if (!user.merchant)
    return (
      <main className={styles.main}>
        <h1>商家经营概览</h1>
        <AdminParagraph>
          当前账号尚未绑定有效商家资料，请联系系统管理员。
        </AdminParagraph>
      </main>
    );
  return (
    <DashboardContent
      key={merchantDashboardIdentity(user)}
      operator={user}
      businessName={user.merchant.businessName ?? user.nickname}
    />
  );
}

function DashboardContent({
  operator,
  businessName,
}: {
  operator: CurrentUser;
  businessName: string;
}) {
  const [draft, setDraft] = useState(initialDashboardFilters);
  const [query, setQuery] = useState(draft);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const permissionKeys = operator.permissionKeys;
  const canReadRevenue = permissionKeys.includes("revenue:merchant:list");
  const canReadResorts = permissionKeys.includes("resort:merchant:list");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setQuery(validateDashboardFilters(draft));
      setRevision((value) => value + 1);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "筛选条件无效");
    }
  }
  return (
    <main className={styles.main}>
      <header>
        <h1>{businessName}</h1>
        <AdminParagraph>查看获授权范围内的雪场状态和经营收益。</AdminParagraph>
      </header>
      <form className={styles.filters} onSubmit={submit}>
        {canReadResorts ? (
          <label>
            雪场状态
            <select
              aria-label="雪场状态"
              aria-describedby="dashboard-status-hint"
              value={draft.status}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  status: event.target.value as DashboardFilters["status"],
                })
              }
            >
              <option value="">全部状态</option>
              {Object.entries(lifecycleLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <FormHint id="dashboard-status-hint">
              选填，选择雪场发布状态，全部状态不作限制。
            </FormHint>
          </label>
        ) : null}
        {canReadRevenue ? (
          <>
            <label>
              收益开始日期
              <input
                aria-label="收益开始日期"
                aria-describedby="dashboard-from-hint"
                type="date"
                required
                value={draft.fromDate}
                onChange={(event) =>
                  setDraft({ ...draft, fromDate: event.target.value })
                }
              />
              <FormHint id="dashboard-from-hint">
                必填，选择收益统计开始日期，不得晚于结束日期。
              </FormHint>
            </label>
            <label>
              收益结束日期
              <input
                aria-label="收益结束日期"
                aria-describedby="dashboard-to-hint"
                type="date"
                required
                value={draft.toDate}
                onChange={(event) =>
                  setDraft({ ...draft, toDate: event.target.value })
                }
              />
              <FormHint id="dashboard-to-hint">
                必填，选择收益统计结束日期，不得早于开始日期。
              </FormHint>
            </label>
            <label>
              收益雪场 ID
              <input
                aria-label="收益雪场 ID"
                aria-describedby="dashboard-resort-hint"
                inputMode="numeric"
                placeholder="全部可见雪场"
                value={draft.resortId}
                onChange={(event) =>
                  setDraft({ ...draft, resortId: event.target.value })
                }
              />
              <FormHint id="dashboard-resort-hint">
                选填正整数ID，留空查看当前商家授权范围内全部雪场。
              </FormHint>
            </label>
          </>
        ) : null}
        <button type="submit">查询 / 刷新</button>
      </form>
      {error ? <AdminParagraph role="alert">{error}</AdminParagraph> : null}
      <DashboardResults
        key={`${JSON.stringify(query)}:${revision}`}
        query={query}
        operator={operator}
      />
    </main>
  );
}

function DashboardResults({
  query,
  operator,
}: {
  query: DashboardFilters;
  operator: CurrentUser;
}) {
  const { retryRestore } = useSession();
  const [view, setView] = useState<DashboardView>(loadingDashboard);
  const run = useRef<ReturnType<typeof createMerchantDashboardRun> | null>(
    null,
  );
  useEffect(() => {
    const next = createMerchantDashboardRun(setView, operator);
    run.current = next;
    if (document.visibilityState === "visible") void next.load(query);
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
      if (run.current === next) run.current = null;
    };
  }, [operator, query]);
  return (
    <>
      <DashboardSections view={view} />
      <button
        onClick={() => {
          if (document.visibilityState === "visible")
            void run.current?.load(query);
        }}
      >
        重新读取经营概览
      </button>
      <button
        onClick={() => {
          if (document.visibilityState !== "visible") return;
          run.current?.clear();
          void retryRestore();
        }}
      >
        重新读取身份
      </button>
    </>
  );
}
