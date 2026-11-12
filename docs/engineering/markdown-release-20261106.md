# 富文本与官网更新部署 · 2026-11-06

北京时间16:16，官网 <https://lichcarlos.top/snow>、管理端 <https://lichcarlos.top/snow-admin/login> 已部署新版本。包括此前本地官网视觉更新、知识文章Tiptap编辑、Markdown阅读/图片和文章/雪场逻辑链接。先前“仅本地未部署”为历史状态。

独立冻结源码 `f3f54e6737b78555fc0edfa0242c250fabf82cd88dce77236fc23ca90bf97269`，806文件。外部WSL Linux Node22、Next16.3.5 Webpack双完整生产构建与TypeScript通过；依赖按锁文件冻结安装，未将Windows产物当Linux包。

- 目录：`/opt/linji/releases/20261106-markdown/web` 和 `admin`，各自独立standalone包。
- Build ID：官网 `JR2zt9MJJm1gCPBR9c5Ya`，管理端 `J-ME0ciUWXDwqM7r8jsOx`。
- 所有2161/2505文件指纹在服务器核对，候选端口验证后切换，仅重启本项目API/官网/后台，未改网关。
- OpenAPI1.53.0/151，SHA `a4542563de915963c6a4d05f6fba9582dbcadf908308774e080d406ef51ae309`。
- 17项真实生产HTTPS/API/浏览器检查通过，无mock；含真实登录、Cookie刷新恢复、内容数量和纯文本兼容、新编辑器源文/表格预览/站内链接、手机重排。未提交合成文章或社区内容。
- 后端另有13项克隆库真实HTTP/上传/扫描验证；不把线上未保存预览说成生产写入端到端验收。

回滚入口 `bash /opt/linji/releases/20261106-markdown/rollback-frontends.sh`，仅还原前端unit；新schema/API必须在已有Markdown写入后保留，另行前向修复。没有执行回滚。地图SDK、自动雪场提及与协作仍未实现。

[结构化报告](../validation/markdown-release-20261106.json)。原始证据与截图 `D:/linji-local/20261106/markdown-release`；历史本地报告保留原范围，不修改为线上结果。
