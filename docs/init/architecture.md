# 架构说明

## 应用是交付边界

`apps/web` 与 `apps/admin` 各自拥有 package.json、Next 配置、src/app、public 和本端配置。两端通过不同端口、不同进程开发和运行，可以分别构建和部署，也可以连接不同后端地址。仓库共用不代表共享进程、会话、权限或业务模型。

## 共享包边界

| 包               | 可以包含                                       | 不应包含                           |
| ---------------- | ---------------------------------------------- | ---------------------------------- |
| `@common/ui`     | Button、基础输入、无业务展示、cn、reset        | 用户查询、角色判断、业务请求       |
| `@common/theme`  | 颜色、圆角、字体、token 转换                   | 按客户身份推断权限或主题           |
| `@common/config` | 明确命名的地址读取、格式校验、server-only 入口 | Token 单例、自动续期、业务服务调用 |
| `@common/utils`  | 展示用数字、日期 format                        | 金额结算、交易精度、状态流转       |

依赖方向是应用 → 公共包 → 更底层公共包，公共包不可引用应用。新增抽象先确认多个真实消费者，避免把单端模块提前搬入公共包。公共包改动仍可能影响样式、类型和构建，应验证所有消费者；“没有业务逻辑”不代表“不会产生回归”。

内部包统一 `workspace:*`，通过 package.json exports 引用。`pnpm check:boundaries` 检查内部版本、应用依赖、静态导入/导出及字符串形式的动态导入的包边界。脚本拒绝动态拼接模块路径，也检查 workspace 依赖循环、未知依赖、别名越界与显式出口。业务语义、浏览器运行时加载和复杂构建插件仍需代码审查，不把静态检查当作完整隔离证明。

## React 与状态

默认使用 Server Component；仅交互组件、Provider 和需要浏览器状态的模块声明 `use client`。环境密钥只在 server-only 模块读取。不得把服务端配置整体序列化给 Client Component。

两端保留 Zustand 依赖和空的 `src/stores` 目录，不预设状态或 Store Provider。各应用按需求建立本端 Store；服务端请求之间不得共享用户状态，Server Component 不读写浏览器 Store。持久化与 hydration 策略按应用需求实现。

## 工具链

pnpm 管理 workspace 与唯一锁文件；Turbo 管理任务依赖和缓存。根启动器先加载环境，再启动 Turbo。TypeScript 与 ESLint 的公共解析配置放 tooling。ESLint 不预置推荐规则，各应用在本端配置中扩展；Prettier 使用默认格式化选项。详见 [代码检查与格式化](code-quality.md)。

公共库源码由 Next 的 transpilePackages 编译；它们不是可脱离源码直接发布的 npm 构建产物。新增独立发布的库时，需补齐打包与版本策略。

## 技术选型说明

管理端使用 Ant Design 6，通过 Next 样式 Registry 接入 SSR。初期页面由共享 shadcn/ui 基础组件与本端 Ant Design 6 组件支撑；其他组件库及业务封装按对应应用的实际需求选择，并按 [依赖维护](dependency-maintenance.md) 验证兼容性。

shadcn/ui 采用可维护源码与 components.json 的模式，共享 Button 基于 Base UI，组件源码保存在本仓。参考 [shadcn Monorepo 文档](https://ui.shadcn.com/docs/monorepo)和 [Ant Design Next.js 文档](https://ant.design/docs/react/use-with-next/)。
