"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { apiRequest } from "@/platform/api";
import {
  initialPublicSession,
  visiblePublicSession,
  type PublicSessionState,
} from "@/platform/auth/public-session-model";
import { PublicSessionRun } from "@/platform/auth/public-session-run";
import { publicSessionFence } from "@/platform/auth/public-session-fence";

type SessionActions = ReturnType<PublicSessionRun["actions"]>;
type PublicSession = PublicSessionState & SessionActions;
const Context = createContext<PublicSession>({
  ...initialPublicSession,
  login: async () => false,
  logout: async () => false,
  restore: async () => {},
});
export const usePublicSession = () => useContext(Context);

export function PublicSessionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const currentPath = useRef(pathname);
  currentPath.current = pathname;
  const [state, setState] = useState<PublicSessionState>(initialPublicSession);
  const [run] = useState(
    () =>
      new PublicSessionRun(
        {
          pathname: () => currentPath.current,
          request: apiRequest,
          changed: setState,
        },
        publicSessionFence(),
      ),
  );
  useEffect(() => {
    const stop = run.activate(pathname);
    const actions = run.actions(pathname);
    const focus = () => {
      void actions.restore(false);
    };
    window.addEventListener("focus", focus);
    return () => {
      window.removeEventListener("focus", focus);
      stop();
    };
  }, [pathname, run]);
  const session = visiblePublicSession(state, pathname);
  const actions = run.actions(pathname);
  return (
    <Context.Provider value={{ ...session, ...actions }}>
      {children}
    </Context.Provider>
  );
}
