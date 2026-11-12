# 管理员重置账号密码

2026-11-02；用户确认 D-48；消费 OpenAPI 1.50.0 的 `ResetManagedPasswordDto`。无新增依赖。新增接口与字段以本仓 `contracts/openapi.json` 为准。

账号列表提供“重置密码”详情入口，详情页展示目标账号/ID、新密码、原因及撤销全部会话的确认。客户端要求 system_admin 角色提示及入口/读取/重置 grants，实际授权由后端受保护身份和事务复核决定；商家不硬编码为代码层身份。

`password-reset-run.ts` 持有同步写锁和 AbortController；提交前两次核对当前身份，并重读目标账号。密码仅提交时局部传递，不进入控制器状态、缓存、URL、持久存储或恢复台账。表单提交立即清空密码/原因。写请求最多一次；网络/408/5xx 后暂停新写入，必须人工核对并显式确认，重新输入才能发起新命令；不读取账号详情推断密码成功，不自动尝试登录。409 为明确冲突，需刷新账号后确认。

204 已确认即显示成功；本人重置清理前端会话并返回登录页。pagehide/卸载取消回调并清空输入；BFCache pageshow 恢复同一实例时保留未知状态。完全卸载不持久化密码、原因或未知台账，跨页面/跨标签页凭证协调仍需后续验收。

浏览器发现 Web 公共 HTTP 客户端没有接受无正文 204，导致真实已提交命令误报未知；`packages/api-contracts/src/client.ts` 已补 204→undefined，空 200 继续报协议错误，新增两项测试。这是官网/Admin 共用无业务 transport 的修复，两端完整 check 与构建都需验证。App 原 transport 已支持 204。

## 独立复现

先按后端工程说明准备专用可销毁库和模拟清单；单独启动 Nest，关闭 Outbox/消费者，并允许管理端 loopback Origin。Web 本仓进程设置 `NEXT_PUBLIC_ADMIN_API_BASE_URL` 后运行 `pnpm dev:admin`，无需父目录 workspace 或跨仓引用。

从外部环境设置 `PASSWORD_BROWSER_FIXTURE_JSON`（清单 JSON）、`PASSWORD_BROWSER_FIXTURE_PASSWORD`、`PASSWORD_BROWSER_WEB_ORIGIN`、`PASSWORD_BROWSER_API_BASE_URL`，必要时指定 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`；本仓运行 `pnpm test:password-browser`。测试只接受 loopback 及专用模拟库标记，无数据库访问。脚本类型检查已纳入 `pnpm typecheck`，无需新增浏览器依赖。

五项测试验证真实登录/API/数据库下的204及目标旧会话401、已提交响应丢失不重放和人工核对、自定义角色即使持有 grant 仍隐藏/403、390px布局、本人重置返回登录。响应丢失通过 Playwright 在真实204后主动断网注入；成功审计与零有效会话另由后端 verify 断言。产物在忽略的 `test-results/password-reset/`，无截图凭证输入。

首次浏览器2/5，204修复后最终5/5通过，持久审计验证通过；失败与通过日志均保留。运行的是Next开发服务，构建通过不等同生产服务运行验收；不覆盖所有账号管理动作、跨标签页和原生App。

实现位置：`features/users/password-reset-panel.tsx`、`password-reset-run.ts` 和账号详情/列表；控制器专项及 HTTP transport 回归纳入完整 check。Next 16.3.5 的安装版 `use-client.md`、`use-router.md` 已在修改前查阅，采用本端 Client Component 和既有 session-provider。
