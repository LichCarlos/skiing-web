# Web 工程实践来源

本页只记录已采用的项目规则与代码落点，不复制上游 Skill 文档。

| 来源                                                                                                                                                                                                                              | 版本/提交                                            | 查阅日期                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------- |
| [Vercel React Best Practices](https://www.skills.sh/vercel-react-best-practices)，[上游 SKILL.md](https://github.com/vercel-labs/agent-skills/blob/063bee94c3f4df8453406c830b0a7df0f2860278/skills/react-best-practices/SKILL.md) | `1.0.0` / `063bee94c3f4df8453406c830b0a7df0f2860278` | 2026-10-27（上游提交 2026-08-28） |

## 工程落点

2026-11-03 官网会话落点：交互 Provider 保留在官网 Client Component，读取/凭证编排位于本端 platform/auth，公共包不承载会话；路由首帧隐藏旧身份、焦点读取取消、同步提交门禁和结果未知核对已有53项新增回归，见[工程说明](public-session-lifecycle.md)。本轮查阅安装版 Next.js 16.3.5 的 use-client/use-pathname 文档，位置为 apps/web/node_modules/next/dist/docs/01-app/03-api-reference；没有将旧版经验当作当前API。上表技能的上游提交仍为原审计版本，本轮未重新审查或宣称升级。

- App Router 页面边界在 `apps/web/src/app/` 与 `apps/admin/src/app/`；默认使用 Server Components，交互需求明确时再引入 Client Components。
- API DTO/VO 由 `contracts/openapi.json` 固定版本并生成到 `packages/api-contracts/src/openapi.ts`；两个 Next 应用通过仓库内部 `@common/api-contracts/openapi` 使用类型。
- `packages/api-contracts/src/client.ts` 集中处理 JSON envelope、字段级错误、traceId、取消和 API base path 校验；Web/Admin 从各自配置懒初始化 client。具体测试以 package.json 和当前源码为准，官网雪场/动态/知识页面及 Admin 账号、雪场、收益、文章、项目知识、社区审核等页面已使用该 API 层；各页面浏览器成功态和组件级 API 集成测试仍缺。
- 管理端的菜单隐藏不作为授权；当前已有 Cookie session 登录/恢复、`management:portal:enter` 门禁和按权限过滤导航，并接入账号、角色/授权、字典、字段、资产、商家/全局雪场管理页面。页面入口控制不替代后端 API 的授权和数据范围检查。

## 当前状态核对（2026-11-04）

官网首页、雪场目录/详情、动态与评论、知识与收藏已接 API；管理端已包含账号/角色/权限目录、字典/字段、资产、商家与全局雪场、收益、文章、项目知识、社区审核、系统配置、Outbox、工作台及 AI 来源运维/会话审计。功能状态和测试边界见 README 中各专项说明，不能用此列表代替逐页浏览器验收。

当前契约为 OpenAPI 1.51.1 / 143 操作。本仓未改产品代码；3045 项业务测试、两应用无缓存构建和 standalone 检查见[工程证据](../validation/owned-asset-access-20261104.json)。最新全业务后端数据库回归及与当前源码的对应关系见[回归证据](../validation/full-database-regression-20261104.json)。

本次只依据本仓代码校正早期“全局字段、AI 运维/审计尚未接入”的陈旧描述；上游技能版本和查阅日期保持。浏览器关键交互、生产环境和远程 CI 仍待验，构建及 HTTP 框架测试不能证明浏览器流程完成。
