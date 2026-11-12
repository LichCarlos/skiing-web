# Web 本地开发教程

## 准备独立工作目录

使用本仓 README 的克隆与冻结安装步骤，Node 22.16.0 或兼容更新 22.x，pnpm 11.19.0。`pnpm-workspace.yaml` 只管理本仓 apps/packages/tooling；Backend 和 App 不是 workspace 成员。父目录即使存在旧 node_modules，也不能成为本仓的隐式依赖。

复制根 `.env.example` 为 `.env`。`scripts/run.mjs` 在启动 Turbo 前读取它；进程已设置的变量优先。公开 API 地址必须含协议与完整 `/api/v1` 路径，不能含账号密码。用本地 API 联调时，先在后端配置官网/管理端的 Origin。

## 启动与访问

```bash
pnpm dev:web
# 另开终端
pnpm dev:admin
```

默认官网 3000，管理端 3001，后端 8080。开发 `.env` 的两个 basePath 留空。游客可浏览公开内容；管理端登录必须使用后端已有且有权限的账号。

Browser Network 面板应看到请求发往配置的独立 API。浏览器使用 Cookie、CSRF 和 Web Locks 协调会话；测试时保持 localhost/127.0.0.1 一致，不复制 token 到 localStorage。不要把生产管理员密码写进调试脚本。

## 跟踪一个功能

1. 从 `apps/web/src/app` 或 `apps/admin/src/app` 找到 route/page。
2. 到同端 `src/features/<业务域>` 找到页面组件、状态模型、响应校验与测试。
3. HTTP、会话、权限、地址装配通过本端 `src/platform`；路由通过 `src/config/routes.ts` 聚合。
4. 通用类型来自 `@common/api-contracts`；真正无业务的展示组件才放 packages/ui。

优先阅读附近已有实现。新页面同时考虑加载、空态、无权限、请求失败、过期会话和保存后的重新读取；管理端表单规则用 Text 小字说明，菜单可见性按前端映射与有效权限判断。后端继续做最终授权。

## 修改字典与字段

“文章分类”“雪场适合标签”和已启用选择型字段，是业务允许的分类目标。配置项使用下拉选择，自动关联字典标识和分组；已有节点可以通过关系图、树与弹窗管理。这里配置的是实体的扩展字段和选项，不执行任意 SQL 建表。

跟踪入口：管理端 `features/dictionaries`、`features/custom-fields`，对应后端 platform-administration。新增映射时一起维护权限条件、填写规则、无数据状态与实际 API 返回校验。不得只在界面造一个没有后端实体对应的节点。

## 内容与 AI 调试

个人中心是社区笔记入口，提交后根据状态进入审核；文章和项目知识由对应管理流程维护。编辑器只有一个外框，正文、源码和预览共享内容。图片不限制固定张数，但仍受单图大小、类型、资产权限和正文/请求长度限制。

AI 通过后端 SSE 返回消息与引用，前端不能直接调用带 Key 的供应商接口。调试顺序为会话权限 → HTTP/SSE 状态 → 请求取消与重试 → 历史恢复 → 引用跳转。真实模型测试可能计费，普通交互测试优先使用现有可控夹具。

## 检查与提交

```bash
pnpm openapi:verify
pnpm check:boundaries
pnpm lint
pnpm typecheck
pnpm exec vitest run --config apps/web/vitest.config.ts
pnpm exec vitest run --config apps/admin/vitest.config.ts
pnpm build:web
pnpm build:admin
```

改公共包需检查两个消费者。完整 `pnpm check` 还包括工具测试与格式检查；格式修正使用 `pnpm exec prettier --write <改动文件>`，避免无关全仓重排。UI 交互变化再运行适用的浏览器验证，区分 mock API 与真实 API 的证据。

契约更新按[三仓协作流程](learning-roadmap.md)执行。提交前 stage 明确路径，再运行 `node scripts/check-repository.mjs` 和 Gitleaks，见[仓库安全](repository-security.md)。

## 常见问题

| 现象                         | 检查与处理                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| 提示 API 地址未配置          | 确认 `.env` 在本仓根，变量名对应当前应用，重启 dev                                  |
| 页面能开但 API/Cookie 失败   | 核对 API URL、WEB_ORIGINS、协议、同站策略、CSRF、浏览器存储和代理；先看实际响应     |
| 管理端按钮跳到 Nginx 默认页  | 核对构建 basePath 与代理路径，原生链接/表单须使用本端路径装配，不能漏 `/snow-admin` |
| 菜单缺少某项                 | 查当前账号权限和商家绑定，检查服务端返回；不要硬写角色名绕开                        |
| 保存后显示旧数据             | 核对写操作后的状态恢复/重新读取、请求归属和会话切换；不要删除权限校验               |
| OpenAPI SHA 或类型失败       | 同步后端快照与锁，再生成类型；不可手改生成类型                                      |
| Windows 构建无法在服务器启动 | 使用 Linux 匹配架构重新安装和构建，别复制宿主 node_modules                          |
| standalone 打包提示目标存在  | 打包器保护已有目录；使用新的 release 目录，不删除不明产物                           |

更多工程约束见 [docs/init](../init/architecture.md)；生产配置见[部署教程](deployment.md)。
