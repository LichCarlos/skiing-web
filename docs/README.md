# Web 文档索引

## 当前教程入口（2026-11-12）

- [三仓协作与技术学习路线](guide/learning-roadmap.md)
- [本地开发教程](guide/development.md)
- [部署与发布教程](guide/deployment.md)
- [公开仓库与 SDK / 凭证边界](guide/repository-security.md)
- [文章图片不设固定数量上限](engineering/article-images-20261112.md)

以下为历次工程与验收记录，状态按各自日期理解。

2026-11-12 17:23：[写作框留白修复与官网设计审查](engineering/member-writing-spacing-20261112.md)已部署；[正式验收](validation/member-writing-spacing-live-20261112/report.json)、[发布报告](validation/member-writing-spacing-release-20261112.json)、[独立检测证据](validation/design-evidence-20261112/assessment-b.md)。

2026-11-12 15:38：[权限导航与表单规则说明](engineering/admin-navigation-text-20261109.md)及节点拖拽已部署，桌面分组菜单、统一模块映射、商家绑定条件、Text说明及字段规则；[发布验收](validation/admin-desktop-config-release-20261112.json)、[正式表单检查](validation/admin-navigation-text-live-20261112/report.json)。

2026-11-09：[字典与字段拖拽创建](engineering/admin-node-drag-20261109.md)，包含节点拖入、表单上下文、字典父级调整及手机操作说明。

2026-11-09：[字典与实体可视化管理](engineering/admin-dictionary-graph-20261109.md)，17:15已部署；库选型、真实数据库关系映射、节点编辑和树形操作；[发布汇总](validation/admin-dictionary-graph-release-20261109.json)、[正式验收](validation/admin-dictionary-graph-live-20261109/report.json)。

2026-11-09：[分类字段下拉选择](engineering/admin-category-select-20261109.md)，14:29已部署；[正式验收](validation/admin-category-select-live-20261109/report.json)、[发布汇总](validation/admin-category-select-release-20261109.json)。

2026-11-09：[字典与字段管理小字说明](engineering/admin-form-hints-20261109.md)，13:50已部署；[正式弹窗验收](validation/admin-form-hints-live-20261109/report.json)、[发布汇总](validation/admin-form-hints-release-20261109.json)。

2026-11-09：[管理端筛选布局优化](engineering/admin-filters-20261109.md)，13:16已部署；[正式验收](validation/admin-filters-live-20261109/report.json)、[发布汇总](validation/admin-filters-release-20261109.json)。另见[数据字典与字段管理使用说明](engineering/dictionaries-and-fields-guide.md)。

2026-11-09：[管理端按钮文字修复](engineering/admin-buttons-20261109.md)，12:47已部署；[正式颜色与状态验收](validation/admin-buttons-live-20261109/report.json)、[发布汇总](validation/admin-buttons-release-20261109.json)。

2026-11-09：[管理端原生链接前缀修复](engineering/admin-navigation-prefix-20261109.md)，12:28已部署；[正式点击验收](validation/admin-navigation-live-20261109/report.json)、[发布汇总](validation/admin-navigation-release-20261109.json)。

2026-11-09：[单框写作与知识库流程](engineering/member-writing-20261109.md)，11:46已部署；[正式验收](validation/member-writing-live-20261109/report.json)、[发布汇总](validation/member-writing-release-20261109.json)、[本地验收](validation/member-writing-20261109/report.json)。

2026-11-09：[AI 视窗与像素字优化](engineering/member-ai-viewport-20261109.md)、[浏览器验收](validation/member-ai-viewport-20261109/report.json)。已于11:21上线，[正式验收](validation/member-ai-viewport-live-20261109/report.json)、[发布与回滚汇总](validation/member-ai-viewport-release-20261109.json)。

- [2026-11-07 官网肤色与 AI 对话上线](engineering/member-ai-release-20261107.md)、[发布报告](validation/member-ai-release-20261107.json)、[真实浏览器报告](validation/member-ai-live-20261107/report.json)：22:04 已部署，仅更新官网；两轮真实模型连续对话、站内引用、历史恢复、退出及手机布局已验，含完整指纹与回滚。

- [2026-11-07 肤色背景与个人 AI 对话](engineering/member-ai-warm-surface-20261107.md)、[浏览器报告](validation/member-ai-20261107/report.json)：官网肤色主题、AI 用户页面、流式重试与账号隔离；483 项测试与生产构建通过。**本地实现，尚未部署，真实模型对话待上线验收**。

- [2026-11-07 个人中心与笔记发布](engineering/member-center-20261107.md)、[验收记录](validation/member-center-20261107.json)：13:04 官网/API 已部署，Tiptap 写作、本人管理、分类收藏及管理员审核；含克隆全流程、正式 HTTPS 与手机截图、备份及回滚。

- [2026-11-07 放大像素网格与五色过渡](engineering/larger-grid-five-colors-20261107.md)、[验收记录](validation/larger-grid-five-colors-20261107.json)：11:53已部署；60列粗网格、红黄蓝绿紫覆盖及切屏状态修复。457项测试、生产构建、线上截图与回滚。

- [2026-11-07 官网筛选路径、雪场配色与隐藏滚动条](engineering/route-contrast-scrollbars-20261107.md)、[验收记录](validation/route-contrast-scrollbars-20261107.json)：11:23已部署；原生表单补齐前缀、黄黑卡片、全局及内部滚动条隐藏。含457项测试、47项路由检查、桌面/手机截图与回滚。

- [2026-11-07 登录页状态文字与底部排版](engineering/auth-footer-type-20261107.md)、[验收记录](validation/auth-footer-type-20261107.json)：10:33已部署；删除检测文字DOM、立即注册入口、统一辅助文字。含451项测试、6组线上尺寸检查、截图与回滚。

- [2026-11-07 推荐雪场、导航稳定与四色像素方格](engineering/five-resorts-coarse-grid-20261107.md)、[验收记录](validation/five-resorts-coarse-grid-20261107.json)：10:12已部署；5个推荐雪场、删除导航确认状态DOM、放大方格、四色实色过渡。含450项测试、线上截图与回滚。

- [2026-11-07 官网画布、像素开场与整屏停留修复](engineering/scroll-canvas-repair-20261107.md)、[验收报告](validation/scroll-canvas-repair-20261107.json)：已部署，含线上截图、构建验证和回滚信息。

- [2026-11-06 官网栏目颜色、滚动留停与网格品牌页脚](engineering/route-colors-grid-footer-20261106.md)、[验收报告](validation/route-colors-grid-footer-20261106.json)：首页黄、目录蓝绿红、正文白；100px进出缓冲，登录文字切换，统一品牌页脚。已部署，446项官网测试与生产构建通过。

- [2026-11-06 黄色网格首页与登录左右切换](engineering/home-grid-auth-swap-20261106.md)、[验收记录](validation/home-grid-auth-swap-20261106.json)：20:59已上线；登录/注册40:60平移互换，中央指定图标不动，确认密码；本条替代20:04固定左右布局。430项官网测试、生产构建与线上响应式通过。

- [2026-11-06 固定登录/注册卡片与单图标切换](engineering/public-auth-page-20261106.md#2026-11-06-固定卡片与单图标切换已上线)、[验收记录](validation/auth-card-20261106.json)：20:04已上线，2:3布局，6组真实HTTPS尺寸一致，无加载跳变；本条替代下方旧的桌面换位布局。

- [2026-11-06 登录页视口高度修复](engineering/public-auth-page-20261106.md#2026-11-06-视口高度修复已上线)、[验证结果](validation/auth-viewport-20261106.json)：已部署，页面随实际视口满屏，桌面登录无滚动条，极短屏表单内滚动保持操作可达。

- [2026-11-06 官网登录页与体验更新线上发布](engineering/public-auth-release-20261106.md)、[报告](validation/public-auth-release-20261106.json)：17:55仅更新官网，430项测试与真实HTTPS登录/刷新/退出、响应式通过；后台/API/App未发布。以下本地报告保留原阶段验证边界。

- [2026-11-06 React Bits 取舍与官网/社区体验本地优化](engineering/community-ui-20261106.md)：首页有限像素揭幕、目录错峰、相册大图和社区雪场跳转；[12项本地浏览器验证](validation/community-ui-20261106/report.json)，官网部分已包含在最新发布。

- [2026-11-06 官网独立登录／注册页](engineering/public-auth-page-20261106.md)：Waves蓝底红线、桌面照片与表单换位、手机精简；已完成上述线上发布。

- [2026-11-06 富文本与官网更新线上发布](engineering/markdown-release-20261106.md)、[报告](validation/markdown-release-20261106.json)：本轮已部署，17项真实线上检查通过；以下仅本地描述为历史。

- [2026-11-06 Tiptap / Markdown](engineering/markdown-editor.md) - local scope and [validation](validation/markdown-20261106.json).

- [2026-11-06 参考站风格官网本地实现](engineering/units-ui-local-20261106.md)：侧栏/目录、黑框撞色与纵滚横移；[浏览器报告](validation/units-ui-20261106/report.json)。**仅本地，未部署；地图与Markdown业务仍待确认**。

- [2026-11-06 UI 精修线上部署](engineering/ui-release-20261106.md)、[部署报告](validation/ui-release-20261106.json)：官网/后台已上线，58 项真实 HTTPS 检查通过，包含构建资源事件及回滚；APK 未更新。

- [2026-11-06 网页设计方法与 GitHub Skills 研究及实施](engineering/ui-design-research-20261106.md)、[验证报告](validation/ui-design-research-20261106.json)：官网与后台本地精修，未重新部署，不更新 APK。
- [Awwwards / Webby / FWA 品质目标与自检边界](engineering/award-quality-review-20261106.md)：记录第二阶段改进、真实验收与仍缺素材/内容，非获奖声明。

- [最新蓝色与红黄橙主题部署](engineering/dopamine-release.md)和[验证报告](validation/dopamine-release-20261105.json)：官网与后台已更新，真实登录和刷新恢复会话通过。
- [此前冰蓝/白主题验证](validation/ice-theme-20261105.json)：历史阶段记录，已由上述版本替代。

- [2026-11-05 UI 验证结果](validation/project-ui-20261105.json)
- [官网、后台与移动端 UI 优化](engineering/project-ui-system.md)
- [官网界面规范](../apps/web/DESIGN.md)

- [管理端样式与通用组件库选型](engineering/admin-ui-system.md)
- [管理端界面规范](../apps/admin/DESIGN.md)
- [2026-11-05 管理端样式验证](validation/admin-ui-20261105.json)

- [2026-11-05同域子路径部署](engineering/server-path-deployment.md)：官网/后台已上线，子路径专项、lint/typecheck、Linux双构建和真实浏览器登录恢复通过。

2026-11-05 收尾：五项闭环实现已交付。Backend1494单测/177框架HTTP/865真实DB、8项真实服务场景通过；Web3062业务测试及双生产构建通过；App1238测试、三平台导出及4项Android实操通过。完整浏览器、iOS/真机与新增依赖真实Kafka仍待验；构建和API测试不代替完整三端点击验收。 详见[本轮报告](validation/business-closure-20261105.json)。

- [2026-11-05 业务闭环工程说明](engineering/business-closure.md)
- [本轮验收报告](validation/business-closure-20261105.json)

维护：本仓库维护者。核对：2026-11-04。[独立启动与检查](../README.md)。工程说明通常记录指定日期的专项，旧版本/计数适用于当时范围；当前产品结果以README和对应验收报告为准。

## 初始化与边界

- [新增应用](init/add-app.md)
- [样式、模块与页面路由别名](init/aliases-and-routes.md)
- [架构说明](init/architecture.md)
- [代码检查与格式化](init/code-quality.md)
- [依赖维护与升级](init/dependency-maintenance.md)
- [环境配置与接入层](init/environment.md)
- [当前项目完整目录与阅读指南](init/file-tree.md)
- [扩展清单](init/gaps-and-decisions.md)
- [引用规范与操作步骤](init/import-boundaries.md)
- [模板与应用的扩展边界](init/ownership.md)
- [架构核对](init/project-review.md)
- [主题与组件](init/theming.md)
- [验证范围](init/validation.md)

## 工程与专项

- [账号管理读取边界与恢复](engineering/account-read-validation.md)
- [管理端文章列表与编辑流程](engineering/admin-articles.md)
- [资产管理列表、详情与停用](engineering/admin-assets.md)
- [管理端生产模型与授权真实HTTP联调](engineering/admin-authorization-live-http.md)
- [社区审核页面与操作核对](engineering/admin-community-moderation.md)
- [系统配置完整读取与保存恢复](engineering/admin-config-read-lifecycle.md)
- [管理端字段配置](engineering/admin-custom-fields.md)
- [管理端字典层级与请求生命周期](engineering/admin-dictionaries.md)
- [管理员重置账号密码](engineering/admin-password-reset.md)
- [权限目录管理工作流](engineering/admin-permission-catalog.md)
- [管理端项目知识列表与编辑](engineering/admin-project-knowledge.md)
- [收益维护完整读取与页面恢复](engineering/admin-revenue-read-lifecycle.md)
- [角色管理与授权页面](engineering/admin-roles.md)
- [管理端登录与会话生命周期](engineering/admin-session-lifecycle.md)
- [账号管理页面与操作恢复](engineering/admin-users.md)
- [AI 会话审计读取与正文生命周期](engineering/ai-audit-lifecycle.md)
- [AI 管理真实浏览器验收](engineering/ai-browser-validation.md)
- [AI 运维管理页面](engineering/ai-operations-pages.md)
- [管理端文章动态字段表单](engineering/article-custom-fields.md)
- [官网文章收藏与用户会话](engineering/article-favorites.md)
- [文章管理完整读取与生命周期](engineering/article-read-lifecycle-validation.md)
- [媒体管理完整读取与生命周期验证](engineering/asset-admin-read-validation.md)
- [管理端图片选择与上传](engineering/asset-library.md)
- [社区审核读取与生命周期验证](engineering/community-read-lifecycle-validation.md)
- [官网社区的游标与评论恢复](engineering/community-recovery.md)
- [项目知识与事件重试真实 HTTP 联调](engineering/content-events-live-http.md)
- [动态字段完整响应与页面生命周期](engineering/custom-field-read-validation.md)
- [工作台汇总读取与真实 HTTP 验证](engineering/dashboard-live-http.md)
- [管理端全局工作台](engineering/dashboard-summary.md)
- [字典管理回执与页面生命周期](engineering/dictionary-command-lifecycle.md)
- [字典管理写入恢复与读取核对](engineering/dictionary-write-recovery.md)
- [事件运维读取与重试恢复](engineering/event-read-recovery.md)
- [字段管理写入恢复](engineering/field-write-recovery.md)
- [全局雪场管理页面](engineering/global-resort-pages.md)
- [全局雪场完整读取与生命周期验证](engineering/global-resort-read-validation.md)
- [独立构建与生产浏览器待验步骤](engineering/independent-start-validation.md)
- [登录限流反馈](engineering/login-rate-limit.md)
- [管理端路由与账号详情](engineering/management-access.md)
- [管理端图片选择与上传生命周期](engineering/media-picker-lifecycle.md)
- [商家经营概览读取与授权生命周期](engineering/merchant-dashboard-lifecycle.md)
- [商家工作台](engineering/merchant-dashboard.md)
- [商家雪场列表与编辑流程](engineering/merchant-resort-pages.md)
- [商家雪场完整读取、复审与生命周期](engineering/merchant-resort-read-validation.md)
- [商家收益明细读取与恢复](engineering/merchant-revenue-lifecycle.md)
- [操作日志读取、身份隔离与响应校验](engineering/operation-log-lifecycle.md)
- [操作日志页面](engineering/operation-logs.md)
- [消息任务管理页面](engineering/outbox-events.md)
- [权限目录读取与维护联调](engineering/permission-catalog-read-validation.md)
- [项目知识完整读取与生命周期验证](engineering/project-knowledge-read-validation.md)
- [官网公开内容真实 HTTP 验收](engineering/public-content-live-http.md)
- [公开详情页分享信息](engineering/public-detail-metadata.md)
- [官网详情、评论与公开扩展字段](engineering/public-detail-validation.md)
- [官网公开列表响应与请求边界](engineering/public-directory-validation.md)
- [官网首页内容接入](engineering/public-homepage.md)
- [官网知识目录的筛选与失败恢复](engineering/public-knowledge-directory.md)
- [官网会话读取与凭证操作](engineering/public-session-lifecycle.md)
- [RAG 来源读取与命令核对](engineering/rag-source-lifecycle.md)
- [RAG 来源管理真实 HTTP 联调](engineering/rag-source-live-http.md)
- [官网雪场组合筛选与失败恢复](engineering/resort-directory.md)
- [收益页面与请求恢复](engineering/revenue-pages.md)
- [管理员收益核对与 CSV 任务联调](engineering/revenue-recovery-live-http.md)
- [角色读取与授权目录校验](engineering/role-read-validation.md)
- [角色授权资源范围编辑](engineering/role-resource-scopes.md)
- [官网与管理端路由故障恢复](engineering/route-state-recovery.md)
- [Web 工程实践来源](engineering/skills-practices.md)
- [独立源码导出与冷安装](engineering/source-export.md)
- [官网与管理端独立 Node 发布包](engineering/standalone-release.md)
- [管理配置与官网政策页面](engineering/system-config.md)

## 历史快照

- [历史快照：web/README.md](history/README-20261104.md)

## RAG回填专项

- [真实回填与三仓工程报告](validation/rag-backfill-cli-20261104.json)

## Android原生模拟器专项

- [11项真实原生流程及三仓工程报告](validation/android-emulator-20261104.json)

## SDK58原生图片上传修复

- [真实头像上传与三仓复验](validation/native-upload-20261104.json)

## 当前验收入口

- [五类公开来源真实消息/模型与三仓工程报告](validation/five-source-kafka-rag-20261104.json)

- [最近产品验收报告](validation/admin-asset-read-authorization-20261104.json)
- [本轮文档整理核对](validation/document-lifecycle-20261104.json)

validation中的其他日期报告和外部冻结目录是原始阶段证据；不得覆盖旧报告冒充复验。发布、上传及远程CI状态见独立README。
