"use client";
import { AdminParagraph } from "@/components/admin-paragraph";

import { useEffect, useState, type ReactNode } from "react";
import { App, Button, Space } from "antd";
import { useSession } from "@/platform/auth/session-provider";
import { apiRequest } from "@/platform/api";
import {
  accountWorkspaceKey,
  canReadAccounts,
  type Operator,
  accountError,
} from "@/features/users/user-model";
import { AccountWriteGate } from "@/features/users/user-workflow";
import {
  beginAccountMutation,
  pendingAccountMutations,
  reviewAccountMutations,
  type AccountMutation,
} from "@/features/users/user-recovery";
import { readAccountMutationReview } from "@/features/users/user-queries";
import { RequestLane } from "@/platform/api/request-lane";
export function AccountSession({
  children,
  target = "list",
}: {
  children: (operator: Operator) => ReactNode;
  target?: string;
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
  const operator = session.currentUser;
  if (!canReadAccounts(operator))
    return (
      <section role="alert">
        <AdminParagraph>当前账号无权读取账号管理</AdminParagraph>
        <Button onClick={() => void retryRestore()}>重新读取身份</Button>
      </section>
    );
  return (
    <div key={`${target}:${accountWorkspaceKey(operator)}`}>
      {children(operator)}
    </div>
  );
}
export function useAccountWrites(operator: Operator) {
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false),
    [pending, setPending] = useState(
      () => pendingAccountMutations(operator.userId).length > 0,
    );
  const [gate] = useState(
    () =>
      new AccountWriteGate(
        operator,
        (signal) =>
          apiRequest<Operator>("/auth/me", { signal, cache: "no-store" }),
        setSaving,
        (mutation) => beginAccountMutation(operator.userId, mutation),
        pending,
      ),
  );
  useEffect(() => {
    gate.activate();
    return () => gate.dispose();
  }, [gate]);
  async function run<T>(
    action: AccountMutation["action"],
    prepare: (
      signal: AbortSignal,
    ) => Promise<{ body: T; mutation: AccountMutation } | null>,
    write: (body: T, signal: AbortSignal) => Promise<unknown>,
    committed: () => void,
  ) {
    const result = await gate.run(action, prepare, write, () => {
      setPending(false);
      committed();
    });
    if (gate.isActive() && result.status === "error") {
      setPending(result.uncertain);
      message.error(
        result.traceId
          ? `${result.message}（traceId: ${result.traceId}）`
          : result.message,
      );
    }
    return result;
  }
  function acknowledge() {
    if (!gate.isActive() || gate.isRunning()) return;
    reviewAccountMutations(operator.userId);
    gate.acknowledge();
    setPending(false);
  }
  return { run, gate, saving, pending, acknowledge };
}
export function AccountWriteRecovery({
  operator,
  pending,
  saving,
  reload,
  acknowledge,
}: {
  operator: Operator;
  pending: boolean;
  saving: boolean;
  reload: () => Promise<boolean>;
  acknowledge: () => void;
}) {
  const [lane] = useState(() => new RequestLane());
  const [reviewing, setReviewing] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [summaries, setSummaries] = useState<string[]>([]),
    [error, setError] = useState<string>();
  const [lock] = useState(() => ({ busy: false }));
  useEffect(() => () => lane.cancel(), [lane]);
  if (!pending || saving) return null;
  async function review() {
    if (lock.busy) return;
    lock.busy = true;
    setReviewing(true);
    setReviewed(false);
    setSummaries([]);
    setError(undefined);
    try {
      await lane.run(
        async (signal) => {
          const data = await readAccountMutationReview(
            operator,
            pendingAccountMutations(operator.userId),
            signal,
          );
          signal.throwIfAborted();
          if (!(await reload())) throw new Error("Reload unavailable");
          return data;
        },
        (data) => {
          setSummaries(data);
          setReviewed(true);
        },
        (cause) => setError(accountError(cause)),
        () => setReviewing(false),
      );
    } finally {
      lock.busy = false;
    }
  }
  return (
    <section role="alert">
      <AdminParagraph>
        操作结果未确认。请读取目标账号，核对后继续；不会自动重复写入。
      </AdminParagraph>
      {summaries.map((summary, index) => (
        <AdminParagraph key={index}>{summary}</AdminParagraph>
      ))}
      {error ? <AdminParagraph>{error}</AdminParagraph> : null}
      <Space wrap>
        <Button
          loading={reviewing}
          disabled={reviewing}
          onClick={() => void review()}
        >
          读取目标并刷新
        </Button>
        <Button
          disabled={!reviewed || reviewing}
          onClick={() => {
            if (!lock.busy && reviewed) {
              acknowledge();
              setReviewed(false);
            }
          }}
        >
          我已核对，继续操作
        </Button>
      </Space>
    </section>
  );
}
