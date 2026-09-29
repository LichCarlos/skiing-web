# 样式、模块与页面路由别名

这里区分三种别名：CSS 语义名称用于样式；import 别名用于定位源码；页面路由名称用于生成链接。它们都不会自动创建域名、重写 URL 或赋予访问权限。

## 全局样式

样式入口为 `@common/ui/styles`。每端只从自己的 `src/styles/globals.css` 引入一次。

| CSS 别名              | 来源 token             | Tailwind 写法              | 用途           |
| --------------------- | ---------------------- | -------------------------- | -------------- |
| `--surface`           | `--background`         | `bg-surface`               | 页面/组件背景  |
| `--surface-muted`     | `--muted`              | `bg-surface-muted`         | 次级区域背景   |
| `--text-main`         | `--foreground`         | `text-text-main`           | 主要文字       |
| `--text-subtle`       | `--muted-foreground`   | `text-text-subtle`         | 辅助文字       |
| `--action`            | `--primary`            | `bg-action`、`text-action` | 主操作色       |
| `--action-foreground` | `--primary-foreground` | `text-action-foreground`   | 主操作上的文字 |
| `--border-default`    | `--border`             | `border-border-default`    | 默认边框       |

实际颜色仍来自 packages/theme；别名不保存第二份色值。已有 shadcn 的 `bg-primary`、`text-foreground` 等继续可用。

每端在 `src/styles/aliases.css` 管理 `--app-page-bg`、`--app-title-color`、`--app-content-width`、`--app-section-gap`。这些名称可以相同，但只在所属应用的构建中生效。当前布局已实际使用它们。整个端的主色仍在 `src/config/theme.ts` 覆盖；业务组件内部用 CSS Modules，不向全局添加裸标签规则。

## 清理浏览器默认样式

Tailwind Preflight 负责基础 margin/padding、box-sizing、标题字号、列表缩进、边框、表格和表单字体。补充 reset 只负责页面高度、字体/色彩、主题勾选色与键盘焦点，不叠加 normalize 或 antd/reset.css。

层叠顺序为 `theme → base → antd → components → utilities`；Admin 的 AntdRegistry 启用 layer，SSR head 提前声明层级。普通未分层 CSS Modules 在正常声明中优先于这些层；不依赖 !important 堆叠来覆盖组件。

保留原生 select 箭头、checkbox/radio 外观、键盘 focus-visible、用户缩放和系统可访问性。这里统一的是可控的浏览器基础 CSS，不保证抹掉浏览器扩展注入、操作系统字体差异、用户强制样式、自动填充或强制高对比度行为。

依据：[Tailwind Preflight](https://tailwindcss.com/docs/preflight)、[Ant Design 样式兼容](https://ant.design/docs/react/compatible-style/)。

## 全局公共包入口

| 导入名称                           | 指向                       |
| ---------------------------------- | -------------------------- |
| `@common/ui/styles`                | 公共全局 CSS               |
| `@common/ui`                       | 公共基础组件               |
| `@common/theme`                    | 主题 token 与转换          |
| `@common/utils`                    | 纯格式化工具               |
| `@common/config/routes`            | 所有应用共有的基础页面名称 |
| `@common/config/public` / `server` | 环境配置读取入口           |

公共模块通过真实 workspace 包与 exports 解析，不在 tsconfig 中将它们映射到跨包 src。样式文件内部的 CSS @import 使用包出口或同目录相对路径，不假设 PostCSS 会读取 TypeScript paths。

## 各端独立的源码别名

别名遵循相同命名约定，具体 paths 写在各端 tsconfig.json，baseUrl 指向当前应用。共享 tooling 只保存编译规则，避免不同构建工具对继承配置中相对路径的解析差异。

应用内部统一使用一个别名：`@/* → ./src/*`。因此 `@/styles`、`@/config`、`@/features` 是同一别名下的本端目录，不再维护多套顶级别名。

```tsx
import styles from "@/styles/page.module.css";
import { routes } from "@/config/routes";
import { UsageSteps } from "@/features/foundation/usage-steps";
```

Web 的 @/ 和 Admin 的 @/ 指向各自 src。边界脚本检查配置及导入后的实际路径，拒绝跨端引用、路径回退和包名遮蔽。公共包内部用相对路径；CSS @import 用包出口或同包相对路径。完整规则与扩展步骤见 [引用规范](import-boundaries.md)。

## 页面路由的三级管理

1. `packages/config/src/routes.ts`：baseRoutes，目前只有各端实际存在的 home `/`。
2. `apps/<端>/src/features/<域>/routes.ts`：所属域自行维护，比如 foundation `/foundation`。
3. `apps/<端>/src/config/routes.ts`：聚合本端域路由，页面通过 @/config/routes 使用。

```tsx
import Link from "next/link";
import { routes } from "@/config/routes";
<Link href={routes.foundation}>查看基础预览</Link>;
```

两端分别启用 typedRoutes，并用 `satisfies Record<string, Route>` 检查路由常量。实际 page.tsx 仍是路由存在的依据；改路径要同步目录与该端常量。不要用 `as Route` 强行跳过校验，不登记尚未实现的登录/账户路由。

动态路由建立真实 `[id]` 页面后再提供参数编码函数；鉴权重定向、菜单权限、跨端域名跳转和业务 API 路径在对应应用中实现。相同 `/foundation` 在两个应用中各自独立，不表示它们共享业务。
