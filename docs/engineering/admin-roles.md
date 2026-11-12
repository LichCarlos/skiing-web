# 角色管理与授权页面

2026-11-03 角色读取与授权目录续验：当前角色读取/授权目录与隐藏在途门禁见[续验说明](role-read-validation.md)，下方较早数量/未验范围为历史。

状态：2026-10-31，ADM-07/ADM-08 已接既有 API；真实浏览器与后端成功交互仍待验收。后端授权规则和 OpenAPI 1.44.0 保持原契约。

## 页面与数据

`/admin/system/roles` 使用 `ManagedRolePageVO`，支持关键词、状态、固定每页 20 条、空页返回及失败重试。`/admin/system/roles/[id]` 展示最新 `ManagedRoleVO` 的角色键、名称、说明、状态、默认范围、关联数量及资源范围摘要。编辑前另读详情，停用前核实当前状态；不把列表缓存直接作为编辑依据。

`/admin/system/roles/[id]/permissions` 读取授权快照、权限树和权威资源目录；一次 PUT 替换权限编号、资源范围和字段策略。权限树逐项勾选，不隐式授予父级或子级。目录之外的历史编号显式列出，保留或人工移除；历史未知资源只可原样保留或移除。字段策略仍由服务器验证字段定义和授权，页面提交使用 DTO 白名单。

路由服务端等待 `params`，仅接受规范的正 int4 编号；非法参数进入 notFound。详情和授权页面按目标编号隔离组件实例。功能路由由 `features/roles/routes.ts` 定义，通过本端 `config/routes.ts` 聚合。

## 身份、读取与写入

入口要求管理入口和角色查询权限，自定义角色按 grant 工作。授权页另要求 system_admin 和 assign，保存还需 update。默认范围配置与授权快照的管理员独占规则由后端最终裁决；商家业务身份不参与前端角色键判断。

查询使用独立 RequestLane 与 AbortSignal，迟到成功、错误及 finally 不覆盖新请求。会话边界按账号、权限集合、角色集合和目标重挂载；读取和提交前重读 `/auth/me`，快照改变则提示重新读取身份。

RoleWriteGate 在异步表单校验之前同步锁定，随后核实当前身份、入口与动作授权。委派元数据编辑不发送 dataScope；委派新建固定 self。system_admin 表单可以配置默认范围，受保护角色及注册基础角色的最终保护由后端处理。当前 VO 未提供 SystemRoleCode，不通过猜测 `user` 键替代后端保护。

网络、408 或 5xx 等未知写入结果会阻止后续提交。先刷新数据，再显式核对继续；不自动重试未知写入。浏览器内存台账按账号及操作 token 隔离，支持列表、详情、授权页之间导航或守卫重挂载；旧请求完成仅清除自己的标记。卸载后不发 UI 回调。

台账不保证完整刷新、跨标签页、跨设备或进程恢复；不替代服务端幂等、并发版本检查或事务授权。后端依据写事务快照授权，不承诺取消快照建立后发生的全部撤权。

## 验证与实践来源

`pnpm test:admin-roles` 覆盖表单、资源范围、DTO 白名单、树结构、写入竞争、身份变化、未知结果、操作隔离、SSR 会话/控件及动态路由。SSR 和纯模型测试不代表实际点击、网络、焦点、窄屏或浏览器成功流程。

沿用 [skills.sh 实践记录](skills-practices.md)。本阶段另核对本仓安装的 Next.js **16.3.5** 文档（2026-10-31）：

- [Dynamic Route Segments](https://nextjs.org/docs/app/api-reference/file-conventions/dynamic-routes)：异步 params 与服务端动态页，落在两个 `[id]` 页面。
- [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)：路由薄服务端壳与交互功能组件分离。
- [use client](https://nextjs.org/docs/app/api-reference/directives/use-client)：RoleConsole、RoleAuthorizationConsole 与会话组件作为交互边界；服务端不读写浏览器台账。

本阶段不新增依赖、迁移或接口。最终三仓验证与未完成项见项目公共追踪矩阵；日志前缀 `role-console-`，App 导出到 `dist-role-console-validation/`。未提交、推送或部署。

最终结果：角色专项 6 文件/106 项，完整 Web check 579 项及官网/Admin build 通过。Backend 855 单测、88 HTTP、639 真实数据库与 build/OpenAPI；App 183 项、Doctor 20/20、三平台 export 通过；三仓冻结安装及契约一致性通过。参数化测试夹具、可选字段 null 和 React Key 类型适配的初轮失败已修正，日志保留。未新增浏览器点击或成功 API 流程证据。
