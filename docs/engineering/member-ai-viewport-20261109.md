# 2026-11-09 AI 视窗及像素字优化

用户要求优化截图中的两个字，并将 AI 对话改为第四张图的圆角黑边视窗，点击自动滚动。沿用当前已批准的肤色及保留栏目彩色背景范围，本轮仅更新官网。

“活”重绘三点水、顶部撇横和口部，“乐”重绘撇横与左右下笔画；其余字形及 60 列网格、五色覆盖、原生滚动帧不变。位图源改为可维护的字符矩阵。

AI 使用蓝色、32px 圆角、2px 黑边外框，肤色内部阅读面。面板按动态视口留上下16px，桌面左右分栏，手机按需显示历史；短窗口压缩标题辅助文字。历史与消息独立滚动，输入区始终占据面板下部；参考来源按数量收拢，点击展开标题及摘录，避免来源占满消息区。自动定位遵循减少动画偏好。当前对话内再次点击 AI 入口仅滚回面板，避免丢失会话及草稿；新建、切换、删除与分页保留外层滚动位置。

保留已有账号隔离、权限、CSRF、SSE 完成校验和原请求 ID 重试；新增 Ctrl/Command + Enter 发送，中文输入法组合时不提交。新建/列表错误在手机上也可直接看到和刷新。

本地验证：483 项官网单测、类型、lint、依赖边界、OpenAPI 1.54.0 校验通过。浏览器验收脚本 `scripts/member-ai-viewport-browser.mjs`，报告 [member-ai-viewport-20261109](../validation/member-ai-viewport-20261109/report.json) 包含自动定位、长内容、独立历史滚动、输入区位置、手机历史开关、重试与账号退出等场景。测试内容使用本地夹具；正式验收单独记录。

2026-11-09 11:21（北京时间）最终版已部署至 [我的 AI 对话](https://lichcarlos.top/snow/me/ai)。构建 `3sLFeCPr60u7G6ZFAikIZ`，运行目录 `/opt/linji/releases/20261109-member-ai-viewport-final/web`，官网服务 PID 1527046；11:12 初版在真实截图验收后补充来源整体折叠，最终版重新独立导出、Linux 构建和部署。

最终版 Linux 483 项测试、ESLint、TypeScript、边界和生产构建通过；2205 文件和21链接核验、10个候选页面及23个 AI 页面静态资源核验通过。正式 HTTPS 验收16项记录通过，包括1440×900、390×844面板及输入区边界、真实登录、新建、两轮真实模型流式回复及引用、刷新恢复、手机历史切换、删除自建测试会话及退出。测试会话已确认删除，页面错误为0。[正式报告](../validation/member-ai-viewport-live-20261109/report.json)、[发布汇总](../validation/member-ai-viewport-release-20261109.json)、[桌面截图](../validation/member-ai-viewport-live-20261109/ai-desktop.png)、[手机截图](../validation/member-ai-viewport-live-20261109/ai-mobile.png)。本地6组视窗检查包括320px及390px低高度；浏览器仿真不代替真实手机软键盘硬件验收。

仅重启 `linji-web`，其余运行服务 PID/状态及 API、后台、Nginx 配置哈希不变。未迁移数据库。服务器未承担构建；发布前备份官网单元，候选服务单独端口检查，激活失败自动恢复。最终版运行包 SHA256：`7a7dab5efcad1da54836b76f18f57a7dd90db7bea52f235df5fc7f8e3f98f99e`。

回滚最终版至11:12版：`python3 /opt/linji/releases/20261109-member-ai-viewport-final/rollback-website.py`。如需继续回到11月7日肤色/AI版本，再运行 `python3 /opt/linji/releases/20261109-member-ai-viewport/rollback-website.py`。两脚本均检查当前官网版本，只恢复官网服务，避免覆盖后续版本。
