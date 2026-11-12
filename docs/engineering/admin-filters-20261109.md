# 2026-11-09 管理端查询筛选布局优化

截图中的消息任务页缺少管理端页面容器，标题、说明和 inline 筛选表单贴边，控件在换行时没有上下间距。操作日志存在相同问题；AI 会话审计、RAG 来源运维同样沿用 inline 筛选且缺少统一间距。

四个列表统一使用管理端本地查询样式：标题说明区、白色筛选面板、标签在控件上方、自适应列数、操作按钮独占一行，小屏单列。保留时间原生输入、本地时区、秒级精度、查询/重置/刷新、权限及业务写入门禁。普通状态选择增加“全部”提示。运行代码变动仅公共管理端 CSS 及四个查询列表组件。

隔离 Linux 的136文件2714项管理端测试、lint、TypeScript、依赖边界、生产构建及运行包校验通过；设计检测无发现、修改文件格式通过。浏览器使用正式账号读取列表，不保存业务内容。四页分别测试1440/1100/768/390/320px共20组布局，检查标签位置、控件宽度、操作行及页面无横向溢出。另验证事件精确条件、秒级本地时间转UTC、重置和非法起止时间提示。

北京时间13:16部署至 `/opt/linji/releases/20261109-admin-filters/admin`，构建 `GocKO-d2wyskFZt9Fw4Xk`。仅 `linji-admin` 服务切换；其他服务PID/状态及官网、API、Nginx配置哈希不变，无数据库迁移。发布副本保留上一正式 dashboard CSS，未发布其无关本地改动。

证据：[修复前](../validation/admin-filters-before-20261109/report.json)、[本地生产构建](../validation/admin-filters-local-20261109/report.json)、[正式 HTTPS](../validation/admin-filters-live-20261109/report.json)、[发布汇总](../validation/admin-filters-release-20261109.json)。浏览器验收后退出会话，所有业务写请求应为0。

回滚：`python3 /opt/linji/releases/20261109-admin-filters/rollback-admin.py`，检查当前版本后恢复上一正式管理端 `/opt/linji/releases/20261109-admin-buttons/admin`。

另提供[数据字典和字段管理使用说明](dictionaries-and-fields-guide.md)，解释两类配置、字典引用、草稿启用、字段权限及公开检索。
