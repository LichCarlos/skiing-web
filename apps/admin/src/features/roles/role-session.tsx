"use client";
import { AdminParagraph } from "@/components/admin-paragraph";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { App, Button, Space } from "antd";
import { apiRequest } from "@/platform/api";
import { useSession } from "@/platform/auth/session-provider";
import {
  beginRoleWrite,
  hasPendingRoleWrite,
  reviewRoleWrite,
} from "@/features/roles/role-recovery";
import {
  canReadRoles,
  isRoleAdministrator,
  roleWorkspaceKey,
  RoleWriteGate,
  type RoleUser,
  type RoleAction,
} from "@/features/roles/role-workflow";

export function RoleSession({
  children,
  authorization = false,
  target = "list",
}: {
  children: (user: RoleUser) => ReactNode;
  authorization?: boolean;
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
  const user = session.currentUser;
  if (
    !canReadRoles(user) ||
    (authorization &&
      (!isRoleAdministrator(user) ||
        !user.permissionKeys.includes("system:permission:assign")))
  )
    return (
      <section role="alert">
        <AdminParagraph>当前账号无权读取此角色页面</AdminParagraph>
        <Button onClick={() => void retryRestore()}>重新读取身份</Button>
      </section>
    );
  return (
    <div key={`${target}:${roleWorkspaceKey(user)}`}>{children(user)}</div>
  );
}

export function useRoleWrite(user: RoleUser) {
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState(() =>
    hasPendingRoleWrite(user.userId),
  );
  const [gate] = useState(
    () =>
      new RoleWriteGate(
        user,
        (signal) =>
          apiRequest<RoleUser>("/auth/me", { signal, cache: "no-store" }),
        setSaving,
        () => beginRoleWrite(user.userId),
        pending,
      ),
  );
  useEffect(() => {
    gate.activate();
    const suspend = () => {
      gate.dispose();
      setSaving(false);
      setPending(hasPendingRoleWrite(user.userId));
    };
    const hide = () => {
      if (document.visibilityState !== "visible") suspend();
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", suspend);
    if (document.visibilityState !== "visible") suspend();
    return () => {
      gate.dispose();
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", suspend);
    };
  }, [gate, user.userId]);
  async function run<T>(
    action: RoleAction,
    prepare: (signal: AbortSignal) => Promise<T | null>,
    write: (body: T, signal: AbortSignal) => Promise<unknown>,
    committed: () => void,
    requiresAdmin = false,
  ) {
    if (document.visibilityState !== "visible")
      return { status: "ignored" as const };
    if (!gate.isActive()) gate.activate(hasPendingRoleWrite(user.userId));
    const result = await gate.run(
      action,
      prepare,
      write,
      () => {
        setPending(false);
        committed();
      },
      requiresAdmin,
    );
    if (gate.isActive() && result.status === "error") {
      message.error(
        result.traceId
          ? `${result.message}（traceId: ${result.traceId}）`
          : result.message,
      );
      setPending(result.uncertain);
    }
    return result;
  }
  function acknowledge() {
    if (gate.isRunning() || document.visibilityState !== "visible") return;
    if (!gate.isActive()) gate.activate(hasPendingRoleWrite(user.userId));
    gate.acknowledge();
    reviewRoleWrite(user.userId);
    setPending(false);
  }
  return { gate, run, saving, pending, acknowledge };
}

export function RoleRecovery({
  pending,
  saving,
  reload,
  acknowledge,
}: {
  pending: boolean;
  saving: boolean;
  reload: () => Promise<boolean>;
  acknowledge: () => void;
}) {
  const [reviewed, setReviewed] = useState(false),
    [reviewing, setReviewing] = useState(false);
  const lock = useRef(false),
    live = useRef(true),
    reviewVersion = useRef(0);
  useEffect(() => {
    live.current = true;
    const clear = () => {
      reviewVersion.current++;
      setReviewed(false);
    };
    const hide = () => {
      if (document.visibilityState !== "visible") clear();
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", clear);
    return () => {
      live.current = false;
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", clear);
    };
  }, []);
  if (!pending || saving) return null;
  return (
    <section role="alert">
      <AdminParagraph>
        操作结果未确认。请刷新角色数据，核对后再继续；不会自动重试写入。
      </AdminParagraph>
      <Space wrap>
        <Button
          loading={reviewing}
          disabled={reviewing}
          onClick={() => {
            if (lock.current || document.visibilityState !== "visible") return;
            lock.current = true;
            const version = ++reviewVersion.current;
            setReviewing(true);
            setReviewed(false);
            void reload()
              .then((success) => {
                if (
                  live.current &&
                  version === reviewVersion.current &&
                  document.visibilityState === "visible"
                )
                  setReviewed(success);
              })
              .catch(() => {
                if (live.current) setReviewed(false);
              })
              .finally(() => {
                lock.current = false;
                if (live.current) setReviewing(false);
              });
          }}
        >
          刷新核对
        </Button>
        <Button
          disabled={!reviewed || reviewing}
          onClick={() => {
            if (
              !lock.current &&
              reviewed &&
              document.visibilityState === "visible"
            ) {
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
