# 官网与管理端路由故障恢复

日期：2026-11-03。负责人：Web；状态：代码已实现，当前阶段完整检查与构建结果见[交付记录](../../../docs/07-交付归档/阶段交付记录.md)。OpenAPI 1.50.2 / 143 操作保持，没有新增业务接口、依赖、迁移或身份规则。

## 问题与行为

两套应用此前只有页面内部的预期错误处理，没有本端路由错误边界、根布局错误界面或自定义 404。组件渲染、布局或 Provider 抛出未预期异常时，用户会看到框架默认界面，缺少项目内恢复入口。

官网与管理端各自新增 app/error.tsx、global-error.tsx、not-found.tsx。管理端另有 admin/error.tsx，在管理布局下处理业务页面渲染错误；根 error.tsx 承接管理布局错误，global-error.tsx 承接根布局错误。各端 features/route-state 独立维护中文文案、原生按钮/链接及 CSS Modules，不跨应用共享业务组件。

兜底不读取或输出 error/message/stack/digest，不自动记录到控制台或发送第三方服务；即使抛出字符串或带异常 getter 的对象，也不需要解析。页面标记 noindex/nofollow，兜底组件不输出业务记录、账号、权限菜单或当前查询参数；管理段边界上方的既有 Guard/Shell 继续负责原有会话与导航。global-error 自带中文 html、head/title、body 和独立样式，颜色与焦点无需正常布局的主题、Ant Design、API 或会话 Provider。

“重新加载页面”只在用户点击时调用当前 Next 版本的 retry，重新获取并渲染该路由；没有挂载时自动重试或 mutation 重放。返回首页/工作台采用本端固定地址的原生文档导航，不依赖已损坏的路由上下文。管理端返回工作台后仍由原 ManagementGuard 和会话恢复流程判断可见功能，错误页自身不展示任何受保护数据。

管理端提示用户核对刚提交的修改。渲染错误不能证明写入失败，重挂载也不能保留所有组件内的未知结果锁；本变更没有补造写入幂等、跨刷新台账或服务器版本条件，恢复后必须先只读核对，再决定是否发起新操作。既有各业务页面的写入门禁继续负责正常处理路径。

## 加载与 404

仅管理端 admin/loading.tsx 增加中性、无私有数据的 role=status、aria-live=polite、aria-busy 加载状态，位于既有管理布局内。客户端 API 的加载/失败/空态仍由各业务页面处理；此文件只覆盖 Next 路由 Suspense，不代表接口请求或会话恢复已经结束。

官网保持原有路由结构与未流式详情读取，没有在根或详情祖先目录增加 loading.tsx。当前 Next 文档明确说明，加载边界开始流式响应后，后续 notFound 可能只能发回 HTTP 200 加 noindex；本次避免引入这一额外变化。404 文案由 not-found.tsx 承接，存在性/公开状态仍由原页面及后端验证。实际 HTTP 状态与流式行为尚需生产运行验收，静态渲染测试不能证明它们。

## 框架依据与验证

查阅本仓安装的 Next.js 16.3.5 文档及 error-boundary 声明/实现；此版本 retry 会刷新路由并清除边界，reset 只清除边界。使用 retry，没有沿用旧版本仅 reset 的恢复方式。官方对应文档：[error](https://nextjs.org/docs/app/api-reference/file-conventions/error)、[loading](https://nextjs.org/docs/app/api-reference/file-conventions/loading)、[not-found](https://nextjs.org/docs/app/api-reference/file-conventions/not-found)、[Vitest](https://nextjs.org/docs/app/guides/testing/vitest)。未升级框架，也未开启 experimental.globalNotFound。

pnpm test:route-state 已纳入 pnpm check，官网 7 项、管理端 9 项通过。采用同步组件 SSR 与直接事件调用，校验敏感异常/任意抛出值的安全文案、无 Provider 依赖、完整根文档、固定原生恢复链接、显式 retry、管理操作核对提示、noindex 404 和可访问加载状态。API/会话/管理 UI Provider 模块设置为导入即失败，证明这些组件不依赖该模块树。

根布局错误文档显式提供 UTF-8 和允许缩放的移动端 viewport，不依赖正常根布局的 head。本仓完整 check 为 1909 项业务测试与 20 项发布测试；末次字符集/viewport 补充后，重新执行 16 项专项、lint/typecheck/format 与双强制构建和发布包校验。两套构建的静态 404 HTML 另核对中文提示、固定返回链接、noindex 及实际链接的 CSS 含对应样式，记录 Build ID 与 HTML/CSS 摘要，见[产物摘要](../validation/route-state-built-pages-20261103.json)。该文件仅绑定本次生成产物，不是运行截图或 HTTP 状态证据。

测试不是实际浏览器、React 错误捕获、Next RSC/客户端路由流式恢复或权限恢复验收。后续应在允许启动生产服务后，覆盖未知 URL、公开记录 404、故障后重试、管理布局/根布局故障，以及异常前已发出写入的只读核对流程。此前生产启动自动审批拒绝与用户不重启 Docker 的限制继续保留。
