"use client";
import { AdminParagraph } from "@/components/admin-paragraph";

import {
  useEffect,
  useState,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { App, Button, Space } from "antd";
import { useSession } from "@/platform/auth/session-provider";
import { apiRequest } from "@/platform/api";
import { RequestLane } from "@/platform/api/request-lane";
import {
  articleError,
  articleWorkspaceKey,
  canManageArticles,
  type ArticleOperator,
} from "@/features/articles/article-model";
import {
  articleRecoveryLedger,
  ArticleWriteGate,
} from "@/features/articles/article-workflow";
import { readArticleReview } from "@/features/articles/article-queries";

export function ArticleSession({
  children,
  target,
}: {
  children: (operator: ArticleOperator) => ReactNode;
  target: string;
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
  if (!canManageArticles(operator))
    return (
      <section role="alert">
        <AdminParagraph>当前账号无权管理文章</AdminParagraph>
        <Button onClick={() => void retryRestore()}>重新读取身份</Button>
      </section>
    );
  return (
    <div key={`${target}:${articleWorkspaceKey(operator)}`}>
      {children(operator)}
    </div>
  );
}

export function useArticleWrites(operator: ArticleOperator) {
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const [ledger] = useState(articleRecoveryLedger);
  const version = useSyncExternalStore(
    ledger.subscribe,
    () => ledger.version,
    () => 0,
  );
  const [gate] = useState(
    () =>
      new ArticleWriteGate(
        operator,
        (signal) =>
          apiRequest<ArticleOperator>("/auth/me", {
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
    version,
    ledger,
    gate,
    run,
  };
}

export function ArticleRecovery({
  operator,
  writes,
  reload,
}: {
  operator: ArticleOperator;
  writes: ReturnType<typeof useArticleWrites>;
  reload: () => Promise<boolean>;
}) {
  const [lane] = useState(() => new RequestLane());
  const [lock] = useState(() => ({ busy: false }));
  const [reviewing, setReviewing] = useState(false);
  const [reviewedVersion, setReviewedVersion] = useState<number>();
  const [summaries, setSummaries] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const generation = useRef(0);
  useEffect(() => {
    const clear = () => {
      generation.current++;
      lane.cancel();
      lock.busy = false;
      setSummaries([]);
      setReviewedVersion(undefined);
      setReviewing(false);
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
    const current = generation.current;
    lock.busy = true;
    setReviewing(true);
    setReviewedVersion(undefined);
    setSummaries([]);
    setError(undefined);
    const version = writes.ledger.version;
    try {
      await lane.run(
        async (signal) => {
          const data = await readArticleReview(
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
          if (writes.ledger.version !== version) return;
          setSummaries(data);
          setReviewedVersion(version);
        },
        (cause) => setError(articleError(cause)),
        () => setReviewing(false),
      );
    } finally {
      if (current === generation.current) lock.busy = false;
    }
  }
  return (
    <section role="alert">
      <AdminParagraph>
        {inFlight
          ? "先前文章请求尚未结束，请等待结果后核对"
          : "文章操作结果未确认，请读取并人工核对后继续。不会自动重复写入。"}
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
          disabled={reviewing || inFlight || reviewedVersion !== writes.version}
          onClick={() => {
            if (
              document.visibilityState === "visible" &&
              !lock.busy &&
              reviewedVersion !== undefined
            )
              writes.ledger.acknowledge(operator.userId, reviewedVersion);
          }}
        >
          我已核对，继续操作
        </Button>
      </Space>
    </section>
  );
}
