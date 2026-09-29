# 架构核对

本页对照当前源码检查基础模板的能力与入口。完整目录见 [文件树](file-tree.md)，扩展位置见 [扩展边界](ownership.md)。

| 项目       | 当前实现                                              | 入口                                                                                           |
| ---------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 独立应用   | Web 与 Admin 各有自己的 Next.js `src/app`、主题和路由 | `apps/web/`、`apps/admin/`                                                                     |
| 公共组件   | Button、SharedNotice、StyleFoundation 由统一出口导出  | `packages/ui/src/index.ts`                                                                     |
| 样式与主题 | 公共 reset、语义别名和默认 token；各端可以覆盖        | `packages/ui/src/styles/`、`packages/theme/src/index.ts`、各端 `src/config/theme.ts`           |
| 环境地址   | 根 `.env` 加载；各端公开 API 基址按调用校验           | `scripts/run.mjs`、`packages/config/src/public.ts`、各端 `src/platform/config/index.ts`        |
| 路由与引用 | typedRoutes、应用内 `@/`、跨包公开 `exports`          | 各端 `next.config.ts`、`tsconfig.json`、`src/config/routes.ts`、`scripts/check-boundaries.mjs` |
| 工程检查   | ESLint 基础解析、TypeScript、Prettier、包边界检查     | `tooling/`、根 `package.json`                                                                  |

`request`、`auth`、`permissions`、`errors` 和 `stores` 仍是扩展目录；模板没有真实后端协议或业务测试。其他未覆盖内容见 [扩展清单](gaps-and-decisions.md)。

在项目根运行 `pnpm check:boundaries`、`pnpm test:boundaries`、`pnpm check` 和 `pnpm build` 可以复查基础工程；构建与类型生成不要和同一应用的开发服务并行。此前检查结果与覆盖范围见 [验证范围](validation.md)。
