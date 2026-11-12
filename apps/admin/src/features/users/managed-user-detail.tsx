"use client";
import { MerchantProfilePanel } from "@/features/users/merchant-profile-panel";

import { useEffect, useState } from "react";
import { PasswordResetPanel } from "@/features/users/password-reset-panel";
import { AccountSession } from "@/features/users/user-session";
import { readAccountDetail } from "@/features/users/user-queries";
import type { Operator } from "@/features/users/user-model";
import { managedUserLoadError } from "@/features/users/managed-user-api";
import {
  ManagedUserDetailView,
  type ManagedUserDetailState,
} from "@/features/users/managed-user-detail-view";

export function ManagedUserDetail({ userId }: { userId: number }) {
  return (
    <AccountSession target={String(userId)}>
      {(operator) => (
        <AccountDetailWorkspace userId={userId} operator={operator} />
      )}
    </AccountSession>
  );
}
function AccountDetailWorkspace({
  userId,
  operator,
}: {
  userId: number;
  operator: Operator;
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ManagedUserDetailState>({
    status: "loading",
  });
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    if (document.visibilityState === "visible")
      void readAccountDetail(operator, userId, controller.signal)
        .then((user) => {
          if (!controller.signal.aborted) setState({ status: "ready", user });
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) setState(managedUserLoadError(error));
        });
    const clear = () => {
      controller.abort();
      setState({ status: "loading" });
    };
    const hide = () => {
      if (document.visibilityState !== "visible") clear();
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", clear);
    return () => {
      controller.abort();
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", clear);
    };
  }, [userId, operator, attempt]);
  return (
    <>
      <ManagedUserDetailView
        state={state}
        onReload={() => setAttempt((value) => value + 1)}
      />
      {state.status === "ready" ? (
        <MerchantProfilePanel
          key={`merchant:${state.user.userId}`}
          operator={operator}
          target={state.user}
          onSaved={() => setAttempt((value) => value + 1)}
        />
      ) : null}
      {state.status === "ready" ? (
        <PasswordResetPanel
          key={`${state.user.userId}:${state.user.account}`}
          operator={operator}
          target={state.user}
        />
      ) : null}
    </>
  );
}
