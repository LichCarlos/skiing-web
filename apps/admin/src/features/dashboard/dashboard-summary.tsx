"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "@/platform/auth/session-provider";
import {
  createSummaryRun,
  dashboardIdentity,
  type SummaryState,
} from "@/features/dashboard/summary-model";
import { SummaryPanels } from "@/features/dashboard/summary-panels";
import {
  canReadSummary,
  type SummaryOperator,
} from "@/features/dashboard/summary-queries";
import { Button } from "antd";
import styles from "@/app/admin/dashboard.module.css";

export function DashboardSummary() {
  const { session } = useSession();
  if (
    session.status !== "authenticated" ||
    !canReadSummary(session.currentUser)
  )
    return null;
  return (
    <SummaryContent
      key={dashboardIdentity(session.currentUser)}
      operator={session.currentUser}
    />
  );
}
function SummaryContent({ operator }: { operator: SummaryOperator }) {
  const [state, setState] = useState<SummaryState>({ status: "loading" });
  const run = useRef<ReturnType<typeof createSummaryRun> | null>(null);
  useEffect(() => {
    const next = createSummaryRun(setState, operator);
    run.current = next;
    if (document.visibilityState === "visible") void next.load();
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
  }, [operator]);
  return (
    <section className={styles.summarySection} aria-label="工作台数据汇总">
      <h2 className={styles.sectionTitle}>数据汇总</h2>
      <SummaryPanels
        state={state}
        retry={() => {
          if (document.visibilityState === "visible") void run.current?.load();
        }}
      />
      {state.status === "loading" ? (
        <Button
          onClick={() => {
            if (document.visibilityState === "visible")
              void run.current?.load();
          }}
        >
          重新读取统计
        </Button>
      ) : null}
    </section>
  );
}
