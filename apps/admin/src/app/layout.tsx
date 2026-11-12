import type { Metadata } from "next";
import { toCssVariables } from "@common/theme";
import { appTheme } from "@/config/theme";
import { Providers } from "@/components/providers";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import "@/styles/globals.css";
export const metadata: Metadata = {
  title: "凛迹雪客管理端",
  description: "凛迹雪客平台管理与运营",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" style={toCssVariables(appTheme)}>
      <head>
        <style id="style-layer-order">
          {"@layer theme, base, antd, components, utilities;"}
        </style>
      </head>
      <body style={{ background: "var(--app-page-bg)" }}>
        <AntdRegistry layer>
          <Providers>{children}</Providers>
        </AntdRegistry>
      </body>
    </html>
  );
}
