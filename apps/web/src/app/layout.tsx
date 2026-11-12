import type { Metadata } from "next";
import { toCssVariables } from "@common/theme";
import { appTheme } from "@/config/theme";
import { PublicSessionProvider } from "@/platform/auth/public-session";
import { SiteConfigProvider } from "@/features/site-config/site-config";
import "@/styles/globals.css";
export const metadata: Metadata = {
  title: "凛迹雪客 · 滑雪场指南与雪友社区",
  description: "发现雪场、规划冬日行程，与懂雪的人一起享受每一个雪季。",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" style={toCssVariables(appTheme)}>
      <body>
        <PublicSessionProvider>
          <SiteConfigProvider>{children}</SiteConfigProvider>
        </PublicSessionProvider>
      </body>
    </html>
  );
}
