# 模板与应用的扩展边界

## 模板已经提供

- `apps/web` 与 `apps/admin`：独立的 Next.js 页面入口、主题覆盖、路由聚合和接入层目录。
- `packages/ui`、`theme`、`config`、`utils`：无业务依赖的组件、样式、配置读取及展示格式化。
- `tooling` 与 `scripts`：基础 TypeScript/ESLint 配置、根环境启动器和跨包引用检查。

各应用通过 `workspace:*` 依赖公共包，只使用它们公开的 `exports`。公共包不导入应用代码。修改公共包后，应验证所有受影响的应用。

## 应用按实际需求实现

`apps/<端>/src/features` 放功能代码，`src/app` 放页面；本端组件、hooks 和 Zustand Store 留在对应应用。`src/platform/config` 已接入本端 API 基址；`request`、`auth`、`permissions`、`errors` 目前为空，需要结合实际接口与会话协议实现。模板不预设响应结构、凭证存储方式、角色规则或业务状态。

应用还需根据自身需求决定数据契约、缓存、表单、国际化、测试、部署和监控方式。`pnpm check` 只包含边界、ESLint 解析、TypeScript 和格式检查，不能代替业务测试。

## 文档位置

基础架构说明集中在 `docs/init/`，技能说明放在 `skills/`。新增应用专属文档时可使用 `docs/<应用名>/`，并在根 README 文档索引登记。新增公共包或环境字段时，同步更新对应说明和示例。
