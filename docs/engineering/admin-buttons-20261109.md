# 2026-11-09 管理端按钮文字对比度修复

截图中的“新建文章”“新建项目知识”文字和按钮底色均为蓝色。正式站浏览器复现的正常对比度为 1:1，悬停仅约 1.49:1，按钮文案无法辨认。

根因是管理端 `globals.css` 的全局 `a` 规则位于 `components` 层，覆盖前面的 `antd` 层。Ant Design 带 href 的 Button 实际渲染为 a，因而丢失主按钮白色文字。原生 button 登录按钮未受影响。

本轮只将普通链接规则限定为 `a:where(:not(.ant-btn))`。各类 Ant Design 链接按钮的正常、悬停、按下和禁用配色继续由组件主题控制；保留原有键盘焦点、权限、导航和提交逻辑。没有全局强制白色文字，避免影响普通、危险及文字按钮。

验收脚本 `scripts/admin-button-contrast-browser.mjs` 使用真实管理员会话读取文章、项目知识和全局雪场列表，在桌面测量正常、悬停、键盘聚焦、按下状态，以及 390px 手机状态，并检查可见焦点。按下测试在目标外释放鼠标，不触发创建；全程仅认证与业务读取，无内容写入。

源码副本与上一正式管理端比较，运行代码仅 `apps/admin/src/styles/globals.css` 变化。工作区已有 dashboard.module.css 改动保留在本地，发布副本继续使用正式文件。

验证与部署记录在[发布汇总](../validation/admin-buttons-release-20261109.json)、[修复前测量](../validation/admin-buttons-before-20261109/report.json)、[本地生产构建测量](../validation/admin-buttons-local-20261109/report.json)、[正式 HTTPS 测量](../validation/admin-buttons-live-20261109/report.json)。

北京时间12:47已上线，构建 `5HGEZwO8HV6_KKwvS4_bE`，管理端 PID1529147、NRestarts0。Linux 管理端136文件2714项测试、lint、TypeScript、依赖边界、生产构建与2505文件/21链接的运行包验证通过；样式格式与设计检测通过。服务器候选验证9页面和42静态资源成功。

本地和正式 HTTPS 各16项颜色采样均通过，主按钮白字在正常/聚焦/手机状态为5.69:1，悬停8.45:1，按下11.14:1；普通雪场按钮正常14.81:1。三类按钮均有键盘焦点。已查看桌面截图与手机按钮截图，文字完整；页面脚本错误0、业务写请求0，验收后退出。仅管理端服务变化，其他服务PID/状态及官网、API、Nginx配置哈希保持不变，无数据库迁移。

仅部署管理端，回滚入口：`python3 /opt/linji/releases/20261109-admin-buttons/rollback-admin.py`。脚本先检查当前仍为本次版本，再恢复上一版本 `/opt/linji/releases/20261109-admin-navigation/admin`。
