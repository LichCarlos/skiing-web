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
import {
  canManageConfig,
  configOperatorKey,
  type ConfigOperator,
} from "@/features/system-config/config-model";
import { configError } from "@/features/system-config/config-api";
import {
  ConfigWriteGate,
  configRecoveryLedger,
} from "@/features/system-config/config-workflow";
import { reviewConfigWrites } from "@/features/system-config/config-queries";

export function ConfigSession({
  target,
  children,
}: {
  target: string;
  children: (operator: ConfigOperator) => ReactNode;
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
  if (!canManageConfig(user))
    return (
      <section role="alert">
        <AdminParagraph>
          当前账号没有系统配置读取权限或管理员身份
        </AdminParagraph>
        <Button onClick={() => void retryRestore()}>重新读取身份</Button>
      </section>
    );
  return (
    <div key={`${target}:${configOperatorKey(user)}`}>{children(user)}</div>
  );
}
export function useConfigWrites(operator: ConfigOperator) {
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const [ledger] = useState(configRecoveryLedger);
  const version = useSyncExternalStore(
    ledger.subscribe,
    () => ledger.version,
    () => 0,
  );
  const [gate] = useState(
    () =>
      new ConfigWriteGate(
        operator,
        (signal) =>
          apiRequest<ConfigOperator>("/auth/me", { signal, cache: "no-store" }),
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
  const entries = ledger.entries(operator.userId);
  async function run<T, R>(...args: Parameters<typeof gate.run<T, R>>) {
    if (document.visibilityState !== "visible")
      return { status: "ignored" as const };
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
export type ConfigWrites = ReturnType<typeof useConfigWrites>;
export function ConfigWriteRecovery({
  operator,
  writes,
  reload,
}: {
  operator: ConfigOperator;
  writes: ConfigWrites;
  reload: () => Promise<boolean>;
}) {
  const [lane] = useState(() => new RequestLane());
  const [lock] = useState(() => ({ busy: false }));
  const [reviewing, setReviewing] = useState(false),
    [reviewed, setReviewed] = useState<number>();
  const [summaries, setSummaries] = useState<string[]>([]),
    [error, setError] = useState<string>();
  const generation = useRef(0);
  useEffect(() => {
    const clear = () => {
      generation.current++;
      lane.cancel();
      lock.busy = false;
      setReviewing(false);
      setReviewed(undefined);
      setSummaries([]);
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
  const inFlight = writes.entries.some((item) => item.inFlight);
  if (!writes.pending || writes.saving) return null;
  async function review() {
    if (lock.busy || inFlight || document.visibilityState !== "visible") return;
    const currentGeneration = generation.current;
    lock.busy = true;
    setReviewing(true);
    setReviewed(undefined);
    setSummaries([]);
    setError(undefined);
    const version = writes.ledger.version;
    try {
      await lane.run(
        async (signal) => {
          const data = await reviewConfigWrites(
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
          if (version === writes.ledger.version) {
            setSummaries(data);
            setReviewed(version);
          }
        },
        (cause) => setError(configError(cause)),
        () => setReviewing(false),
      );
    } finally {
      if (generation.current === currentGeneration) lock.busy = false;
    }
  }
  return (
    <section role="alert">
      <AdminParagraph>
        {inFlight
          ? "先前系统配置保存请求尚未结束，请等待结果后核对"
          : "系统配置保存结果未确认，请读取并人工核对后继续。不会自动重复写入。"}
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
            if (
              !lock.busy &&
              reviewed !== undefined &&
              document.visibilityState === "visible"
            )
              writes.ledger.acknowledge(operator.userId, reviewed);
          }}
        >
          我已核对，继续操作
        </Button>
      </Space>
    </section>
  );
}
