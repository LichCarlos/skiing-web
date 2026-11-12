"use client";
import { AdminParagraph } from "@/components/admin-paragraph";
import { FormHint } from "@/components/form-hint";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/platform/api";
import { useSession } from "@/platform/auth/session-provider";
import { readAccountTarget } from "@/features/users/user-queries";
import type { Operator, ManagedAccount } from "@/features/users/user-model";
import {
  canResetPasswords,
  PasswordResetRun,
  type PasswordResetState,
} from "@/features/users/password-reset-run";
import styles from "@/features/users/managed-user-detail.module.css";

export function PasswordResetPanel({
  operator,
  target,
}: {
  operator: Operator;
  target: ManagedAccount;
}) {
  const router = useRouter(),
    { signOut } = useSession();
  const [password, setPassword] = useState(""),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [reviewed, setReviewed] = useState(false);
  const [state, setState] = useState<PasswordResetState>({
    busy: false,
    unknown: false,
    saved: false,
    message: null,
  });
  const [run] = useState(
    () =>
      new PasswordResetRun(operator, target, {
        verify: (signal) =>
          apiRequest<Operator>("/auth/me", { signal, cache: "no-store" }),
        readTarget: (signal) => readAccountTarget(target.userId, signal),
        write: (body, signal) =>
          apiRequest<void>(`/admin/users/${target.userId}/password`, {
            method: "PATCH",
            body,
            signal,
          }),
        saved: async () => {
          if (target.userId === operator.userId) {
            try {
              await signOut();
            } finally {
              router.replace("/login");
            }
          }
        },
        changed: setState,
      }),
  );
  useEffect(() => {
    run.activate();
    const close = () => {
      run.dispose();
      setPassword("");
      setReason("");
      setConfirmed(false);
    };
    const open = () => run.activate();
    window.addEventListener("pagehide", close);
    window.addEventListener("pageshow", open);
    return () => {
      window.removeEventListener("pagehide", close);
      window.removeEventListener("pageshow", open);
      run.dispose();
    };
  }, [run]);
  if (!canResetPasswords(operator)) return null;
  const disabled = state.busy || state.unknown;
  return (
    <section
      className={`${styles.panel} ${styles.resetPanel}`}
      aria-labelledby="password-reset-heading"
    >
      <h2 id="password-reset-heading">重置密码</h2>
      <AdminParagraph>
        目标：{target.account}（ID {target.userId}
        ）。成功后该账号全部登录会话将退出。
        {target.userId === operator.userId
          ? "这是当前账号，完成后将返回登录页。"
          : ""}
      </AdminParagraph>
      {state.message ? (
        <AdminParagraph role={state.unknown ? "alert" : "status"}>
          {state.message}
        </AdminParagraph>
      ) : null}
      {state.unknown ? (
        <div>
          <label>
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(event) => setReviewed(event.target.checked)}
            />
            我已人工核对，允许发起新的重置命令
          </label>
          <button
            type="button"
            disabled={!reviewed || state.busy}
            onClick={() => {
              run.acknowledge();
              setReviewed(false);
            }}
          >
            确认已核对
          </button>
        </div>
      ) : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (disabled || !confirmed) return;
          const submittedPassword = password,
            submittedReason = reason;
          setPassword("");
          setReason("");
          setConfirmed(false);
          void run.submit(submittedPassword, submittedReason);
        }}
      >
        <label>
          新密码
          <input
            aria-label="新密码"
            aria-describedby="reset-password-hint"
            type="password"
            autoComplete="new-password"
            required
            disabled={disabled}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <FormHint id="reset-password-hint">
          必填，8–72个UTF-8字节，保留空格；提交后将退出该账号全部会话。
        </FormHint>
        <label>
          重置原因
          <textarea
            aria-label="重置原因"
            aria-describedby="reset-reason-hint"
            required
            maxLength={500}
            disabled={disabled}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <FormHint id="reset-reason-hint">
          必填，说明密码重置原因，最多500字，记录到操作审计。
        </FormHint>
        <label>
          <input
            type="checkbox"
            checked={confirmed}
            disabled={disabled}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          确认重置上述账号密码并退出其全部会话
        </label>
        <button
          type="submit"
          className={styles.action}
          disabled={disabled || !confirmed}
        >
          {state.busy ? "正在重置…" : "确认重置密码"}
        </button>
      </form>
    </section>
  );
}
