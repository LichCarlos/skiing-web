"use client";
import { AdminParagraph } from "@/components/admin-paragraph";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { App, Button, Space } from "antd";
import { useSession } from "@/platform/auth/session-provider";
import { apiRequest } from "@/platform/api";
import { RequestLane } from "@/platform/api/request-lane";
import { resortError } from "@/features/merchant-resorts/resort-model";
import {
  canManageGlobalResorts,
  globalOperatorKey,
  type GlobalResortOperator,
  type GlobalResortAction,
} from "@/features/admin-resorts/global-resort-model";
import {
  GlobalResortWriteGate,
  globalResortLedger,
} from "@/features/admin-resorts/global-resort-workflow";
import { reviewGlobalWrites } from "@/features/admin-resorts/global-resort-api";
export function GlobalResortSession({
  target,
  action = "list",
  children,
}: {
  target: string;
  action?: GlobalResortAction;
  children: (operator: GlobalResortOperator) => ReactNode;
}) {
  const { session, retryRestore } = useSession();
  if (session.status === "loading")
    return <AdminParagraph role="status">正在确认登录身份</AdminParagraph>;
  if (
    session.status !== "authenticated" ||
    !canManageGlobalResorts(session.currentUser, action)
  )
    return (
      <section role="alert">
        <AdminParagraph>
          {session.status === "authenticated"
            ? "当前账号没有全局雪场操作权限"
            : "会话暂时不可用，请重新登录或读取身份"}
        </AdminParagraph>
        <Button onClick={() => void retryRestore()}>重新读取身份</Button>
      </section>
    );
  return (
    <div key={`${target}:${action}:${globalOperatorKey(session.currentUser)}`}>
      {children(session.currentUser)}
    </div>
  );
}
export function useGlobalResortWrites(operator: GlobalResortOperator) {
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const [ledger] = useState(globalResortLedger);
  const version = useSyncExternalStore(
    ledger.subscribe,
    () => ledger.version,
    () => 0,
  );
  const [gate] = useState(
    () =>
      new GlobalResortWriteGate(
        operator,
        (signal) =>
          apiRequest<GlobalResortOperator>("/auth/me", {
            signal,
            cache: "no-store",
          }),
        ledger,
        setSaving,
      ),
  );
  useEffect(() => {
    gate.activate();
    const clear = () => {
      gate.dispose();
      setSaving(false);
    };
    const hide = () => {
      if (document.visibilityState !== "visible") clear();
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", clear);
    hide();
    return () => {
      gate.dispose();
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", clear);
    };
  }, [gate]);
  async function run<T, R>(...args: Parameters<typeof gate.run<T, R>>) {
    if (document.visibilityState !== "visible")
      return { status: "ignored" as const };
    const result = await gate.run(...args);
    if (gate.isActive() && result.status === "error")
      message.error(result.message);
    return result;
  }
  const entries = ledger.entries(operator.userId);
  return {
    saving,
    ledger,
    version,
    gate,
    entries,
    pending: entries.length > 0,
    run,
  };
}
export type GlobalResortWrites = ReturnType<typeof useGlobalResortWrites>;
export function GlobalResortRecovery({
  operator,
  writes,
  reload,
}: {
  operator: GlobalResortOperator;
  writes: GlobalResortWrites;
  reload: () => Promise<boolean>;
}) {
  const [lane] = useState(() => new RequestLane());
  const [lock] = useState(() => ({ busy: false }));
  const [reviewing, setReviewing] = useState(false);
  const [review, setReview] = useState<{
    version: number;
    summaries: string[];
  }>();
  const [error, setError] = useState<string>();
  const generation = useRef(0);
  useEffect(() => {
    const clear = () => {
      generation.current++;
      lane.cancel();
      lock.busy = false;
      setReviewing(false);
      setReview(undefined);
      setError(undefined);
    };
    const hide = () => {
      if (document.visibilityState !== "visible") clear();
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", clear);
    return () => {
      generation.current++;
      lane.cancel();
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", clear);
    };
  }, [lane, lock]);
  const inFlight = writes.entries.some((entry) => entry.inFlight);
  if (!writes.pending || writes.saving) return null;
  async function check() {
    if (lock.busy || inFlight || document.visibilityState !== "visible") return;
    const current = generation.current;
    lock.busy = true;
    setReviewing(true);
    setReview(undefined);
    setError(undefined);
    const version = writes.ledger.version;
    try {
      await lane.run(
        async (signal) => {
          const summaries = await reviewGlobalWrites(
            apiRequest,
            operator,
            writes.ledger
              .entries(operator.userId)
              .map((entry) => entry.mutation),
            signal,
          );
          signal.throwIfAborted();
          if (!(await reload()))
            throw new Error(
              "页面刷新失败，请重新核对；目标不可见时可返回列表核对",
            );
          signal.throwIfAborted();
          return summaries;
        },
        (summaries) => {
          if (writes.ledger.version === version)
            setReview({ version, summaries });
        },
        (cause) => setError(resortError(cause)),
        () => setReviewing(false),
      );
    } finally {
      if (generation.current === current) lock.busy = false;
    }
  }
  return (
    <section role="alert">
      <AdminParagraph>
        存在尚未确认的雪场操作，已暂停写入。不会自动重试；请读取当前数据后人工核对。
      </AdminParagraph>
      {writes.entries.map((entry, i) => (
        <AdminParagraph key={i}>
          {entry.mutation.action}{" "}
          {entry.mutation.action === "create"
            ? entry.mutation.name
            : `#${entry.mutation.resortId}`}
          ：{entry.inFlight ? "请求仍在处理" : "结果未确认"}
        </AdminParagraph>
      ))}
      {error ? <AdminParagraph>{error}</AdminParagraph> : null}
      {review?.version === writes.version
        ? review.summaries.map((summary, i) => (
            <AdminParagraph key={i}>{summary}</AdminParagraph>
          ))
        : null}
      <Space>
        <Button disabled={inFlight || reviewing} onClick={() => void check()}>
          读取并核对
        </Button>
        <Button
          disabled={inFlight || reviewing || review?.version !== writes.version}
          onClick={() => {
            if (
              document.visibilityState === "visible" &&
              !lock.busy &&
              review &&
              writes.ledger.acknowledge(operator.userId, review.version)
            ) {
              setReview(undefined);
              void reload();
            }
          }}
        >
          我已人工核对，解除写入保护
        </Button>
      </Space>
    </section>
  );
}
