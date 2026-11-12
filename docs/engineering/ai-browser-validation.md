# AI 管理真实浏览器验收

日期：2026-11-02。适用 ADM-18 / ADM-19，沿用 OpenAPI 1.49.0。[浏览器脚本](../../scripts/ai-operations-browser.ts)只操作 Web 和 HTTP，不导入 Backend/App 源码。

## 独立运行

1. 在后端的专用空数据库中完成 migration、seed 和 `ai-browser-fixture.ts create`，启动完整 Nest 服务。将生成的合成 manifest JSON 作为测试输入传给本仓；不建立跨仓库构建依赖。
2. 本仓独立安装 `pnpm install --frozen-lockfile`，安装匹配浏览器 `pnpm exec playwright install chromium`。在受控机器已有兼容 Chromium 时可显式设置 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`；默认使用 Playwright 自己的浏览器。
3. 在一个 Web 终端设置 `$env:NEXT_PUBLIC_ADMIN_API_BASE_URL='http://localhost:18080/api/v1'` 后执行 `pnpm dev:admin`；后端需允许 `http://localhost:3001`。使用 localhost 保留 Secure Cookie 行为，不关闭 HttpOnly、Origin 或 CSRF 检查。
4. 在另一个 Web 终端设置 `AI_BROWSER_FIXTURE_JSON` 为合成 manifest 全文、`AI_BROWSER_FIXTURE_PASSWORD` 为专用测试密码后执行：

```powershell
$env:AI_BROWSER_WEB_ORIGIN='http://localhost:3001'
$env:AI_BROWSER_API_BASE_URL='http://localhost:18080/api/v1'
pnpm typecheck:ai-browser
pnpm test:ai-browser
```

两个地址只允许 loopback，manifest 必须标记隔离测试数据库。本测试会创建真实来源控制审计与 Outbox，不用于已有业务数据。默认根 `pnpm check` 包含脚本类型检查；需要服务和专用数据库的浏览器测试单独运行。截图位于 `test-results/ai-operations/`，日志与截图忽略入库；不要把真实私有正文用于截图。

## 本轮结果

Playwright 1.62.1 / 显式 Chromium 138.0.7204.23、真实 Next 开发服务和完整 Nest AppModule、独立 PostgreSQL/pgvector：8 项全部通过，无未捕获浏览器运行错误。

| 流程           | 实际验证                                                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 登录与正文审计 | 真实表单登录，access/refresh 为 Secure、HttpOnly、Lax；列表/详情默认无正文，独立原因提交后读取，响应 no-store；不写 localStorage/sessionStorage |
| 授权入口       | 仅元数据权限无正文按钮/请求；普通用户无管理入口；自定义 RAG grants 不绕过保护管理员身份                                                         |
| 正文生命周期   | 重载元数据、实际路由导航、注入 pagehide 后清除正文                                                                                              |
| 延迟正文       | 后端已完成审计，浏览器暂扣响应；清除页面后放行，正文不重新出现，后续主动读取仍可用                                                              |
| 并发版本       | 真实第二次控制操作抢先提交，旧版本 UI 请求得到 409；保留原因并停止提交，手动刷新恢复                                                            |
| RAG 命令       | 人工停用/启用/重建得到真实持久响应；清空分块，重建显示已受理/pending                                                                            |
| 响应丢失       | route.fetch 确认后端已提交后中断响应；前端不重放，保留原因、锁定并要求刷新核对                                                                  |
| 窄屏           | 390px 宽度截图、无整体横向溢出，导航不拉伸成大段空白，默认无正文                                                                                |

同时人工查看四张合成截图，修复窄屏 shell 网格行分配造成的空白，增加 AI 页 CSS Module 的标题、间距和详情布局；状态/来源类型/可见范围改为中文展示。没有新增 API 或更改授权协议。视觉核对是人工检查，不是像素回归测试。

后端 fixture verify 另行断言成功审计、冲突无成功审计、私有内容未复制到日志、最终 disabled/零分块及重建事件存在。响应丢失和 pagehide 是可控注入；本轮没有真实模型、Broker、原生设备或操作系统隐藏测试，重建没有执行供应商索引。测试生产构建的运行流程仍需另验。首次两轮测试定位错误及修复后的日志全部保留。

## 最终回归与清理

Web独立冻结安装、完整check（1432项测试）、浏览器脚本类型检查、最终格式检查及官网/Admin生产构建通过；双应用本轮均重新构建，未复用构建缓存。Backend独立冻结安装、lint/typecheck、128文件1017项单测、4文件126项HTTP与build通过。App本轮无代码/依赖变更，未重跑，沿用此前343项/Doctor20/20/三平台导出证据。三仓契约SHA-256仍一致，无API或migration变化。

一次复跑在pagehide后立即断言遇到React提交时序，改为明确2秒超时的DOM清除等待；持续存在的内容仍会失败。最终8项全部通过。日志保留于各仓`ai-browser-*.log`，包括失败记录；最终后台verify确认控制版本31、人工停用、零分块和累计17个Outbox事件。累计值仅为本轮重复运行的证据，不是业务常量。

清理后独立db:verify通过（23迁移、15索引、18约束）；数据库仅保留seed用户1个/角色3个，业务/审计/Outbox/Inbox/会话/索引为0。seed管理员18条测试登录会话随专用AutoRemove容器一并销毁；自建Web/Backend服务已停止，其他五个原有容器保留。未提交/推送/部署，项目整体未完成。
