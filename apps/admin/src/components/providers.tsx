"use client";
import { App, ConfigProvider } from "antd";
import { useSyncExternalStore } from "react";
import zhCN from "antd/locale/zh_CN";
import { adminComponentTheme } from "@/config/theme";
import { SessionProvider } from "@/platform/auth/session-provider";

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(callback: () => void) {
  const media = window.matchMedia(reducedMotionQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
function motionSnapshot() {
  return window.matchMedia(reducedMotionQuery).matches;
}
const serverMotionSnapshot = () => false;
const reducedMotionTheme = {
  ...adminComponentTheme,
  token: { ...adminComponentTheme.token, motion: false },
};
export function Providers({ children }: { children: React.ReactNode }) {
  const reducedMotion = useSyncExternalStore(
    subscribeMotion,
    motionSnapshot,
    serverMotionSnapshot,
  );
  return (
    <ConfigProvider
      locale={zhCN}
      theme={reducedMotion ? reducedMotionTheme : adminComponentTheme}
    >
      <SessionProvider>
        <App>{children}</App>
      </SessionProvider>
    </ConfigProvider>
  );
}
