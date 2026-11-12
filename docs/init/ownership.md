# 模板与应用的扩展边界

## 模板已经提供

- `apps/web` 与 `apps/admin`：独立的 Next.js 页面入口、主题覆盖、路由聚合和接入层目录。
- `packages/ui`、`theme`、`config`、`utils`：无业务依赖的组件、样式、配置读取及展示格式化。
- `tooling` 与 `scripts`：基础 TypeScript/ESLint 配置、根环境启动器和跨包引用检查。

各应用通过 `workspace:*` 依赖公共包，只使用它们公开的 `exports`。公共包不导入应用代码。修改公共包后，应验证所有受影响的应用。

## 应用按实际需求实现

`apps/<端>/src/features` 放功能代码，`src/app` 放页面；本端组件、hooks 和客户端 Store 留在对应应用。当前业务已在各端 `src/platform/api` 和 `src/platform/auth` 实现请求、会话与授权适配，`@common/api-contracts` 维护本仓生成的契约类型和无业务HTTP客户端；管理端会话、权限状态与业务提交门禁不放入公共包。以仓库 README、package.json 和 docs/engineering 的当前记录为准，不再将这些目录描述为空模板。

应用继续各自维护缓存、表单和业务状态。当前 `pnpm check` 已包含契约快照/生成类型核对、包边界、lint、类型检查、多模块业务测试与格式检查；生产构建另行运行。业务测试覆盖范围以工程说明和测试源码为准，绿灯不替代真实浏览器、后端服务与供应商的端到端验收。

## 文档位置

应用build还生成各自standalone发布包，TypeScript打包与校验工具由本仓维护；20项文件系统测试与专用类型检查纳入check。产物完整性/内部依赖核对不等于实际HTTP或浏览器验收，详见[独立发布说明](../engineering/standalone-release.md)。

基础架构说明集中在 `docs/init/`，技能说明放在 `skills/`。新增应用专属文档时可使用 `docs/<应用名>/`，并在根 README 文档索引登记。新增公共包或环境字段时，同步更新对应说明和示例。
