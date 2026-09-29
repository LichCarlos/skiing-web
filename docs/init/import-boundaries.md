# 引用规范与操作步骤

## 第一步：使用已有公共组件

两端首页均实际运行以下代码：

```tsx
import { Button, SharedNotice } from "@common/ui";
```

1. 查看 packages/ui/src/components/shared-notice.tsx：只接收 children 并显示内容，不读取应用、接口或状态。
2. 查看 packages/ui/src/index.ts：汇总公共组件出口。它保持服务端中立，不加全局 use client；交互组件在自己的文件声明客户端边界。
3. 查看 packages/ui/package.json：exports 的 "." 指向 src/index.ts。公开入口是包名，不依赖 tsconfig 伪装成跨包路径。
4. 查看 apps/web/package.json 与 apps/admin/package.json：均声明 "@common/ui": "workspace:*"。
5. 查看两端 src/app/page.tsx：使用同一组件，并在页面中标明公共组件源码路径。

修改公共组件后验证两个消费者，不把业务请求、角色判断或应用 Store 放进公共 UI。

## 第二步：应用内部使用 @/

```tsx
import { UsageSteps } from "@/features/foundation/usage-steps";
import { routes } from "@/config/routes";
import styles from "@/styles/page.module.css";
```

每个应用在自己的 tsconfig.json 中设置 `"@/*": ["./src/*"]`。web 与 admin 的相同导入名分别解析到自身目录。要修改当前端教程，打开 apps/<端>/src/features/foundation/usage-steps.tsx；无需修改另一个端。

应用 src 中的 JS/TS 模块统一使用 @/，不使用多套顶级别名或相对源码导入。公共包不使用应用的 @/；它们内部用同包相对路径，例如 UI 按钮从 ../lib/utils 引用 cn。公共包内部不通过自己的根出口引用自身，避免引入循环。

## 第三步：明确公开边界

| 场景       | 写法                                                           |
| ---------- | -------------------------------------------------------------- |
| 跨包组件   | import { Button } from "@common/ui"                            |
| 跨包工具   | import { formatNumber } from "@common/utils"                   |
| 公共主题   | import { createTheme } from "@common/theme"                    |
| 环境读取   | 从 @common/config/public 或 @common/config/server 明确选择     |
| 公共样式   | @import "@common/ui/styles"                                    |
| 应用内模块 | import { UsageSteps } from "@/features/foundation/usage-steps" |
| 公共包内部 | import { cn } from "../lib/utils"                              |

样式和服务端配置保留明确的子入口，不全部混入根 barrel。尤其不能把 server-only 配置从客户端入口重导出。

UI 为 shadcn 生成代码保留少量显式组件子入口；项目页面统一从根入口引用组件。新增组件时同步 index.ts；只有确实需要子入口时才添加对应 exports，禁止 "./components/*" 这类自动公开所有源码的通配符。

CSS @import 不使用 TypeScript @/ 别名；同包 CSS 相对路径允许。Tailwind @source 指向公共包源码用于收集类名，这是构建扫描配置，不是跨包运行时导入。

`@common/*` 是本项目已存在的 workspace 包名前缀。导入示例只使用实际存在且已公开的包入口；新增公共包时先创建包、声明 `exports`，再在使用方声明 `workspace:*` 依赖。

## 第四步：验证规范

```sh
pnpm check:boundaries
pnpm test:boundaries
pnpm check
pnpm build
```

边界回归测试在临时副本中运行，不修改工作目录源码。它验证正常引用，以及跨端、深层源码、未知包、未声明依赖、别名回退、CSS 越界、动态导入和依赖循环等错误。

此检查独立于 ESLint 的应用规则。当前检查范围是 workspace 声明、TypeScript paths/extends、JS/TS 静态 import/export/require/import type、字符串动态 import 和常见带引号 CSS @import。它不等同于沙箱：构建插件、eval、自定义加载器及外部资源加载仍需代码审查；包内文件循环尚不属于 workspace 循环检查。
