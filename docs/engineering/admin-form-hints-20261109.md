# 2026-11-09 字典与字段管理表单说明

数据字典的类型和字典项、字段管理的字段定义和分组，其新建/编辑表单均在各项控件下增加 `Typography.Text` 小字说明。两页页头补充配置用途。提示解释稳定键、显示名与保存值、父级、排序、默认候选、公开检索、数据类型、字典引用、JSON 格式、校验规则及各字段开关。

使用管理端本地 `components/form-hint.tsx` 统一渲染 Ant Design `Typography.Text type="secondary"`，13px字号、1.6行高及原有辅助文字颜色；通过 Form.Item 的 extra 放置，沿用组件提供的字段说明关联。字段开关区改为自适应网格，保证说明正常换行。权限、校验、业务提交、API和数据库无变化。

验证脚本 `scripts/admin-form-hints-browser.mjs` 通过真实管理员会话打开新建及有现存记录的编辑弹窗，在1440/768/390/320px检查每个配置项均有 Typography 说明、13px字号、说明未超出弹窗及字段说明关联，并截图弹窗顶部与底部、取消关闭。不提交配置，不新建测试字典或字段。

首次回归测试发现两份生命周期测试的 Ant Design mock 未提供新增 Typography 导出，已补齐 mock 后重新执行全部管理端测试。运行代码使用真实 Ant Design 组件，未用替代标签绕过组件要求。

发布与验证见[汇总](../validation/admin-form-hints-release-20261109.json)、[本地生产构建](../validation/admin-form-hints-local-20261109/report.json)、[正式 HTTPS](../validation/admin-form-hints-live-20261109/report.json)。

北京时间13:50已部署，构建 `2Lq_NrIMq9o_Fk4rfZlaK`，管理端 PID1530515。136文件2714项测试、lint、TypeScript、边界、生产构建及2492文件/21链接运行包校验通过；格式与设计检测通过。候选包9页面和42静态资源检查通过。

本地与正式验收各检查六类弹窗、四种宽度共24组，覆盖新建/编辑字典类型、新建/编辑字典项、新建字段及分组。当前无可编辑字段/分组记录，未为验收新增配置；编辑字段与分组的说明代码与新建共用。页面错误和业务写请求均为0，完成后退出。已查看桌面及手机截图，长表单底部操作可通过正常滚动访问。

仅部署管理端。发布源码副本继续保留正式 dashboard CSS，不混入其本地无关改动。回滚入口 `python3 /opt/linji/releases/20261109-admin-form-hints/rollback-admin.py`，恢复上一正式 `/opt/linji/releases/20261109-admin-filters/admin`。
