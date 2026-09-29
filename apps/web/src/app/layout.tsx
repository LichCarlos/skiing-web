import type { Metadata } from "next";
import { toCssVariables } from "@common/theme";
import { appTheme } from "@/config/theme";
import "@/styles/globals.css";
export const metadata: Metadata = {
  title: "前端基础模板 · Web",
  description: "独立应用与共享基础库",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" style={toCssVariables(appTheme)}>
      <body style={{ background: "var(--app-page-bg)" }}>{children}</body>
    </html>
  );
}
