# 管理端路由与账号详情

2026-10-29；使用现有 OpenAPI 1.27.0，接口和数据模型未变更。

## 入口与页面权限

`apps/admin/src/platform/auth/access.ts` 是本端页面可见性判定入口。所有管理页面都要求 `management:portal:enter`，再匹配页面对应的 API grant。未知路径、无效 ID 和多余路径段拒绝进入。商家范围由后端身份上下文和数据范围校验，不按 `RoleKey=merchant` 判断。

| 页面                 | 必需 grant（另需 portal）                                                       |
| -------------------- | ------------------------------------------------------------------------------- |
| 账号列表/详情        | `system:user:list`                                                              |
| 角色列表             | `system:role:list`                                                              |
| 角色授权编辑         | `system:role:list`、`system:permission:assign`，并且 system_admin               |
| 权限目录             | `system:permission:list`；目录写入按钮按 create/update/delete 权限控制          |
| 字典、字段           | `system:dict:list`、`system:field:list`（各自页面）                             |
| 商家雪场列表         | `resort:merchant:list`                                                          |
| 商家雪场创建/编辑    | list 加对应 create/update grant                                                 |
| 全局雪场列表         | `content:resort:list-all`                                                       |
| 全局雪场创建/编辑    | list-all 加对应 create-all/update-all grant                                     |
| 文章、社区审核、资产 | 各自 `content:article:manage`、`content:dynamic:moderate`、`content:asset:list` |
| 项目知识             | system_admin 加 list/create/update；编辑还需 list 来读取原稿                    |
| 商家收益             | `revenue:merchant:list`                                                         |
| 收益维护             | system_admin 加 `revenue:system:upsert`                                         |

角色授权保存仍由后端额外验证 `system:role:update`、授权数据范围与最后管理员保护等条件；页面入口不是 API 授权替代。后台表单还可能调用字典/字段/Asset API，各 API 继续独立校验权限。

本次修复了已有业务页面未注册到前端门禁、角色/项目知识路径前缀过宽和权限目录使用旧树权限的问题。权限目录页面实际调用 `/admin/permissions`，因此采用该 API 的 `system:permission:list`；不再要求无关的角色授权权限。

`features/auth/management-modules.ts` 同时供侧栏和工作台使用，按同一门禁函数筛选入口。现已包含资产与全局雪场。没有可访问模块时显示明确空状态，工作台统计 API-M01 仍未实现。

## 账号详情 ADM-06

账号列表中的账号名称链接到 `/admin/system/users/[id]`。服务端页面先检查正整数安全 ID，再渲染本端 Client Component；组件请求现有 `GET /admin/users/:id`，后端 `user` DataScope 决定是否返回。

页面明确展示 VO 的账号 ID、账号、昵称、启停状态、创建时间、全部关联角色及角色状态、商家资料或未关联状态。只选取这些字段渲染，React 文本转义；不渲染响应对象、密码、token 或审计 metadata。支持加载、刷新、重试、401/403/404/服务错误和 traceId。404 不区分不存在与超出数据范围。

切换账号时 ManagementGuard 用当前 userId 重建管理子树；详情路径变化时也重建组件。请求清理会 Abort，并在 Promise 完成时检查取消信号，避免离开页面后写入旧账号或旧详情结果。

## 验证与限制

2026-10-29 角色范围补充：沿用 OpenAPI 1.28.0。角色表单复用 `canConfigureRoleAuthorization`；只有 system_admin 可以编辑默认数据范围。普通角色管理员仍可维护获准的角色资料，PATCH 请求显式省略 dataScope，新建请求固定 self；提示说明限制。`features/roles/role-form.ts` 只负责本端请求体构造，后端仍独立强制授权，并在保存事务核对身份。新增 3 项请求体测试并接入 `test:admin-roles`、check 与既有 CI，验证省略范围、强制 self、不序列化新建状态与系统管理员范围选择；尚无真实浏览器点击/API 验收。

`pnpm check` 纳入 `test:admin-auth` 和 `test:admin-users`。路由测试遍历实际管理目录的全部 25 个 page.tsx，分别检查已授权、无 portal、仅 portal、创建/编辑缺写权限、非法路径和自定义商家角色。账号详情测试检查 transport 及取消参数、成功/空关联/错误渲染、转义和敏感扩展字段不展示。渲染测试使用 React SSR，不能证明浏览器 hydration、点击或真实 API 成功流程。

三端 frozen install、Backend 312 单测/53 HTTP 测试与 build、App 40 测试/Doctor 20/20/三平台导出、Web 55 测试/全量检查与官网/Admin 构建均通过。

浏览器成功态验收未完成。本机已有 Admin 开发进程（3001）被保留；独立测试构建/启动命令被自动审批策略拒绝，未提供更具体原因，未尝试绕过。测试辅助服务及临时浏览器页均已关闭，临时测试代码已移除。真实 PostgreSQL 数据范围/最后管理员并发与浏览器端到端联调仍待完成。
