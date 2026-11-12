"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { login, logout, restoreSession } from "@/platform/auth/session";
import { AdminSessionController } from "@/platform/auth/session-controller";
import { sessionCommandGate } from "@/platform/auth/session-command-gate";
import {
  loadingSession,
  type SessionState,
  type CurrentUser,
} from "@/platform/auth/session-model";
interface SessionContextValue {
  session: SessionState;
  signIn(input: { account: string; password: string }): Promise<CurrentUser>;
  signOut(): Promise<void>;
  retryRestore(): Promise<void>;
}
const SessionContext = createContext<SessionContextValue | null>(null);
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionState>(loadingSession);
  const [controller] = useState(
    () =>
      new AdminSessionController(
        { read: restoreSession, login, logout, changed: setSession },
        sessionCommandGate(),
      ),
  );
  useEffect(() => controller.activate(), [controller]);
  const value = useMemo(
    () => ({ session, ...controller.actions() }),
    [session, controller],
  );
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context)
    throw new Error("useSession must be used within SessionProvider");
  return context;
}
