"use client";

import {
  RouteError,
  type ErrorRecoveryProps,
} from "@/features/route-state/route-state";

export default function GlobalError(props: ErrorRecoveryProps) {
  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>页面暂时无法显示 · 凛迹雪客管理端</title>
        <meta name="robots" content="noindex, nofollow" />
      </head>
      <body style={{ margin: 0, background: "#eef7ff" }}>
        <RouteError {...props} />
      </body>
    </html>
  );
}
