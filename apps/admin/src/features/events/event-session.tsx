"use client";
import { AdminParagraph } from "@/components/admin-paragraph";

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { App, Button, Space } from "antd";
import { useSession } from "@/platform/auth/session-provider";
import { apiRequest } from "@/platform/api";
import { RequestLane } from "@/platform/api/request-lane";
import {
  canManageEvents,
  eventOperatorKey,
  type EventOperator,
} from "@/features/events/event-model";
import { eventMessage } from "@/features/events/event-api";
import {
  EventWriteGate,
  eventRecoveryLedger,
} from "@/features/events/event-workflow";
import { reviewEventRetries } from "@/features/events/event-queries";

export function EventSession({
  target,
  children,
}: {
  target: string;
  children: (operator: EventOperator) => ReactNode;
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
  if (!canManageEvents(user))
    return (
      <section role="alert">
        <AdminParagraph>
          当前账号没有消息任务读取权限或管理员身份
        </AdminParagraph>
        <Button onClick={() => void retryRestore()}>重新读取身份</Button>
      </section>
    );
  return (
    <div key={`${target}:${eventOperatorKey(user)}`}>{children(user)}</div>
  );
}
export function useEventWrites(operator: EventOperator) {
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const [ledger] = useState(eventRecoveryLedger);
  const version = useSyncExternalStore(
    ledger.subscribe,
    () => ledger.version,
    () => 0,
  );
  const [gate] = useState(
    () =>
      new EventWriteGate(
        operator,
        (signal) =>
          apiRequest<EventOperator>("/auth/me", { signal, cache: "no-store" }),
        ledger,
        setSaving,
      ),
  );
  useEffect(() => {
    const visibility = () => {
      if (document.visibilityState === "visible") gate.activate();
      else {
        gate.dispose();
        setSaving(false);
      }
    };
    const leave = () => {
      gate.dispose();
      setSaving(false);
    };
    visibility();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", visibility);
    return () => {
      gate.dispose();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", visibility);
    };
  }, [gate]);
  const entries = version === 0 ? [] : ledger.entries(operator.userId);
  async function run<T, R>(...args: Parameters<typeof gate.run<T, R>>) {
    const result = await gate.run(...args);
    if (gate.isActive() && result.status === "error")
      message.error(result.message);
    return result;
  }
  return {
    saving,
    pending: entries.length > 0,
    entries,
    ledger,
    version,
    gate,
    run,
  };
}
export type EventWrites = ReturnType<typeof useEventWrites>;
export function EventWriteRecovery({
  operator,
  writes,
  reload,
}: {
  operator: EventOperator;
  writes: EventWrites;
  reload: () => Promise<boolean>;
}) {
  const [lane] = useState(() => new RequestLane());
  const [lock] = useState(() => ({ busy: false }));
  const [reviewing, setReviewing] = useState(false),
    [reviewed, setReviewed] = useState<number>();
  const [summaries, setSummaries] = useState<string[]>([]),
    [error, setError] = useState<string>();
  useEffect(() => {
    const clear = () => {
      lane.cancel();
      setReviewed(undefined);
      setSummaries([]);
      setReviewing(false);
    };
    const hide = () => {
      if (document.visibilityState !== "visible") clear();
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", clear);
    return () => {
      lane.cancel();
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", clear);
    };
  }, [lane]);
  const inFlight = writes.entries.some((item) => item.inFlight);
  if (!writes.pending || writes.saving) return null;
  async function review() {
    if (lock.busy || inFlight || document.visibilityState !== "visible") return;
    lock.busy = true;
    setReviewing(true);
    setReviewed(undefined);
    setSummaries([]);
    setError(undefined);
    const version = writes.ledger.version;
    try {
      await lane.run(
        async (signal) => {
          const data = await reviewEventRetries(
            apiRequest,
            operator,
            writes.ledger.entries(operator.userId).map((item) => item.mutation),
            signal,
          );
          signal.throwIfAborted();
          if (!(await reload())) throw new Error("Reload failed");
          signal.throwIfAborted();
          return data;
        },
        (data) => {
          if (writes.ledger.confirmRead(operator.userId, version)) {
            setSummaries(data);
            setReviewed(version);
          }
        },
        (cause) => setError(eventMessage(cause)),
        () => setReviewing(false),
      );
    } finally {
      lock.busy = false;
    }
  }
  return (
    <section role="alert">
      <AdminParagraph>
        {inFlight
          ? "先前消息任务重试请求尚未结束，请等待结果后核对"
          : "消息任务重试结果未确认，请读取并人工核对后继续。不会自动重复写入。"}
      </AdminParagraph>
      {summaries.map((summary, index) => (
        <AdminParagraph key={index}>{summary}</AdminParagraph>
      ))}
      {error ? <AdminParagraph>{error}</AdminParagraph> : null}
      <Space wrap>
        <Button
          loading={reviewing}
          disabled={reviewing || inFlight}
          onClick={() => void review()}
        >
          读取目标并刷新
        </Button>
        <Button
          disabled={reviewing || inFlight || reviewed !== writes.version}
          onClick={() => {
            if (!lock.busy && reviewed !== undefined)
              writes.ledger.acknowledge(operator.userId, reviewed);
          }}
        >
          我已核对，继续操作
        </Button>
      </Space>
    </section>
  );
}
