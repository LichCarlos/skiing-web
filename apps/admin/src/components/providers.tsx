"use client";
import { App, ConfigProvider } from "antd";
import { appTheme } from "@/config/theme";
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: appTheme.primary,
          colorTextLightSolid: appTheme.primaryForeground,
          colorText: appTheme.foreground,
          colorBgContainer: appTheme.background,
          colorBorder: appTheme.border,
          colorTextSecondary: appTheme.mutedForeground,
          colorBgLayout: appTheme.muted,
          borderRadius: appTheme.radius,
          fontFamily: appTheme.fontFamily,
        },
      }}
    >
      <App>{children}</App>
    </ConfigProvider>
  );
}
