"use client";
import { AdminParagraph } from "@/components/admin-paragraph";

import type { ReactNode } from "react";
import { Button } from "antd";
import { useSession } from "@/platform/auth/session-provider";
import { parseCurrentUser } from "@/platform/auth/session-model";
import {
  canUseAiOperations,
  operatorKey,
  type Operator,
} from "@/features/ai-operations/api";
export function AiOperationSession({
  kind,
  target,
  children,
}: {
  kind: "rag" | "audit";
  target: string;
  children: (operator: Operator) => ReactNode;
}) {
  const { session, retryRestore } = useSession();
  if (session.status === "loading")
    return <AdminParagraph role="status">正在确认登录身份…</AdminParagraph>;
  let operator: Operator | undefined;
  if (session.status === "authenticated") {
    try {
      operator = parseCurrentUser(session.currentUser);
    } catch {
      /* Hide malformed identity snapshots. */
    }
  }
  if (!operator || !canUseAiOperations(operator, kind))
    return (
      <section role="alert">
        <AdminParagraph>会话不可用或未获此页面授权</AdminParagraph>
        <Button onClick={() => void retryRestore()}>重新读取身份</Button>
      </section>
    );
  return (
    <div key={`${target}:${operatorKey(operator)}`}>
      {children(operator)}
      <Button onClick={() => void retryRestore()}>重新读取身份</Button>
    </div>
  );
}
