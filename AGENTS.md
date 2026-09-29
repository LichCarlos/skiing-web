# 前端 Monorepo 基础模板

## 当前项目操作范围

本项目仅在本地维护。允许本地编辑、安装依赖、运行和验证；未经明确授权，不配置远程仓库、不推送代码、不创建 PR/MR、不发布或部署。

本目录是独立工作空间。先读 README.md、docs/init/architecture.md 和 docs/init/ownership.md。

- apps/* 是独立 Next.js 应用，每端拥有 src/app；禁止应用之间互相引用。
- packages/* 只放无业务的基础组件、主题、环境配置和纯工具，不放登录状态、权限或业务 Store。
- 内部依赖使用 workspace:*，仅通过包名和公开 exports 引入。
- 所有地址来源为项目根 .env 或部署环境变量；仅 packages/config 读取地址环境变量。
- 各端 src/platform 集中承载地址装配、请求、认证、权限及错误适配。具体协议由对应应用实现。
- 全局 reset 与主题在 packages/ui 和 packages/theme，各端覆盖放 src/config/theme.ts；页面样式使用 CSS Modules。
- docs/init 存放当前模板的全部说明文档；后续按业务在 docs 下另建分类。skills 是项目技能资料目录，不会自动注册到个人工具。
- 不擅自实现示例鉴权、持久化凭证或业务规则。测试、CI 和部署按应用需求补充。
- 修改公共包后检查所有消费者；新文档必须同步 README 文档索引。

## 样式与路由约定

- 公共 CSS 从 @common/ui/styles 引入，语义别名在公共 styles/aliases.css；单端 --app-* 放各端 styles/aliases.css。
- baseRoutes 只包含所有端真实存在的基础页面。各功能域维护 features/<域>/routes.ts，经本端 config/routes.ts 聚合，由 @/config/routes 引用；保持 typedRoutes 检查。
- 本端 import 别名在各自 tsconfig.json 中定义并基于本端 baseUrl 解析；共享 tooling 只保留编译规则。禁止用 paths 映射到其他端或绕过公共包 exports。
- 样式层顺序为 theme、base、antd、components、utilities。保留焦点、缩放、原生表单操作，不全局 all:unset。

## 检查工具边界

- ESLint 公共包只提供语法解析与产物排除，具体规则/插件在对应 workspace 配置。
- Prettier 使用空配置与默认行为，各应用按需扩展；不擅自加入推荐规则集或格式化插件。
- 两端只保留 Zustand 依赖与状态扩展目录，不预置 UI Store 或无实际用途的 Provider。

## 模块引用规范

- 跨 workspace 通过 @common 包名及显式公开 exports 引用，必须声明 workspace:*。UI 组件优先从 @common/ui 根入口导入。
- 应用 src 内部统一使用 @/；只指向本端 src。公共包内部使用相对路径，不从自身根出口反向导入，不借用应用别名。
- 禁止跨应用引用、跨包相对路径、src 深层导入、未声明依赖和 workspace 依赖循环。CSS 同包相对导入、Tailwind @source 扫描属于明确允许的样式处理方式。
