# 首次公开推送前 README 归档

归档日期：2026-11-12。下文保留原阶段叙述，当前安装、版本与状态以仓库根 README 为准。

---

# 凛迹雪客 Web

2026-11-12 17:23已部署：[写作框留白修复与官网设计审查](docs/engineering/member-writing-spacing-20261112.md)。移除正文居中限宽，桌面正文与外框左右各26px（含边框），483项测试及17组本地/正式浏览器检查通过。[发布报告](docs/validation/member-writing-spacing-release-20261112.json)。

2026-11-12 15:38已部署：[桌面管理端权限导航与填写说明](docs/engineering/admin-navigation-text-20261109.md)，左侧使用前端路由映射与权限/商家绑定条件筛选，菜单分组可展开收起；全局段落及表单说明统一使用 Ant Design Text，补充实际填写规则。与节点拖拽一同发布，2751项测试和41项最终包浏览器检查通过。[发布验收](docs/validation/admin-desktop-config-release-20261112.json)。

2026-11-09：[字典与字段拖拽创建](docs/engineering/admin-node-drag-20261109.md)，两处管理可拖入节点并通过弹窗填表，自动带入业务、分组或父级；已有字典项目支持拖动调整父级，手机可点按同名按钮操作。

2026-11-09 17:15：[字典与实体关系图已部署](docs/engineering/admin-dictionary-graph-20261109.md)，React Flow 节点映射现有实体、分组、字段和字典，Ant Design Tree 管理项目层级；手机使用关系树，节点可进入精确编辑。2735项测试、Linux生产构建与30项最终包浏览器验收通过。

2026-11-09 14:29：[分类字段下拉选择已部署](docs/engineering/admin-category-select-20261109.md)，按真实业务字段选择分类目标，自动匹配字典标识，扩展字段绑定使用已启用字典下拉。2723项管理端测试与正式四种屏宽验收通过。

2026-11-09 13:50 字典与字段管理已补充 Ant Design Typography.Text 小字说明，覆盖类型、字典项、字段定义和分组配置，含填写示例、生效及公开条件。2714项管理端测试、生产构建及24组正式弹窗/屏宽检查通过。[说明与验收](docs/engineering/admin-form-hints-20261109.md)。

2026-11-09 13:16 管理端筛选布局已优化上线：消息任务、操作日志、AI会话审计及RAG来源统一顶部标签、网格筛选和独立操作行，小屏单列。2714项管理端测试与Linux构建通过；[实施和验收](docs/engineering/admin-filters-20261109.md)、[字典与字段功能解读](docs/engineering/dictionaries-and-fields-guide.md)。

2026-11-09 12:47 管理端按钮文字修复已上线：修复全局链接色覆盖 Ant Design 链接按钮，主按钮恢复白字，正常对比度5.69:1；正常/悬停/按下/聚焦及手机效果已验。2714项管理端测试、Linux生产构建及16项正式颜色采样通过。[修复说明](docs/engineering/admin-buttons-20261109.md)、[发布汇总](docs/validation/admin-buttons-release-20261109.json)。

2026-11-09 11:21 已上线：[AI 视窗与像素字优化](docs/engineering/member-ai-viewport-20261109.md)。蓝色圆角黑边单视窗、入口自动定位、内部消息与历史滚动、固定输入区和手机历史展开；优化“活／乐”像素笔画。483 项 Linux 官网测试、18 项本地浏览器检查及16项正式HTTPS记录通过，含两轮真实 AI 回复、手机布局与历史切换。[发布验收](docs/validation/member-ai-viewport-release-20261109.json)。

2026-11-07 22:04 已上线：[官网肤色与个人 AI 对话](docs/engineering/member-ai-release-20261107.md)。个人中心及原白底区域使用参考色 `#F4E9E1`，保留首页及栏目色；[我的 AI 对话](https://lichcarlos.top/snow/me/ai)支持真实连续提问、流式回复、站内引用及历史恢复。483 项 Linux 官网测试、生产构建和 11 项正式 HTTPS 检查通过，两轮真实模型对话已验。仅官网服务更新，[发布与回滚](docs/engineering/member-ai-release-20261107.md)、[验收报告](docs/validation/member-ai-release-20261107.json)。下方“尚未部署”为此前本地阶段。

2026-11-07 本地新增：[肤色背景与个人 AI 对话](docs/engineering/member-ai-warm-surface-20261107.md)。官网原白底及个人中心使用参考色 `#F4E9E1`，首页及栏目原色保留；个人中心支持 Web AI 历史、新建、连续提问及流式重试。483 项官网测试、生产构建及 11 项浏览器检查通过，AI 回复使用本地模拟验证。**尚未部署，真实模型对话待上线验收**。[浏览器报告](docs/validation/member-ai-20261107/report.json)。

2026-11-07 13:04 个人中心已上线：[进入个人中心](https://lichcarlos.top/snow/me)。登录后侧栏不再显示用户名，入口改为个人中心；支持 Tiptap 写笔记、本人内容管理和分类收藏，管理员审核后公开，修改已公开内容重新待审。官网 470 项、API 1525 单测/178 HTTP 及克隆真实流程通过；正式域名登录、写作、收藏、手机布局和退出已验。[实现与回滚](docs/engineering/member-center-20261107.md)、[验收记录](docs/validation/member-center-20261107.json)。原有大方格五色过渡保留。

2026-11-07 11:53 首页大方格与五色过渡已上线：80列改60列，边长增大约33%，红黄蓝绿紫系统色，粗像素字形；修复桌面转手机的开场空白。457项测试、Linux构建与线上桌面/手机验收通过。[实现与回滚](docs/engineering/larger-grid-five-colors-20261107.md)、[验收记录](docs/validation/larger-grid-five-colors-20261107.json)。

2026-11-07 11:23 官网路由与可读性修复已上线：三处原生筛选和错误恢复链接保留`/snow`，雪场信息区黄底黑字，全官网隐藏滚动条并保留滚动。457项官网测试、Linux生产构建与47项路由检查通过。[实现与回滚](docs/engineering/route-contrast-scrollbars-20261107.md)、[验收记录](docs/validation/route-contrast-scrollbars-20261107.json)。

2026-11-07 10:33 登录页文字优化已上线：删除登录/注册检测状态文字DOM，“第一次来？ 立即注册”，切换入口15px、辅助说明13px，底部居中分组。451项官网测试、Linux生产构建及6组线上尺寸验收通过。[实现与回滚](docs/engineering/auth-footer-type-20261107.md)、[验收记录](docs/validation/auth-footer-type-20261107.json)。

2026-11-07 10:12 最新官网更新已上线：推荐雪场5个、删除导航确认状态DOM、方格增大20%、马赛克仅红蓝黄紫四种实色。450项官网测试、Linux生产构建与线上桌面/手机验收通过。[实现与回滚](docs/engineering/five-resorts-coarse-grid-20261107.md)、[验收记录](docs/validation/five-resorts-coarse-grid-20261107.json)。

2026-11-07 09:34 官网滚动修复已部署：全画布及导航纯色、网格页脚随栏目变色、逐句像素开场、逐卡停留和统一桌面面板高度。[实现与回滚](docs/engineering/scroll-canvas-repair-20261107.md)、[线上验收](docs/validation/scroll-canvas-repair-20261107.json)。449项官网测试、Linux生产构建与线上检查通过。

2026-11-06 官网交互更新：黄色仅首页；蓝绿红导航与雪场/知识/社区目录对应，详情白底；首页上下100px阅读缓冲；纯蓝黑框雪山展示及黄色标语；所有官网页面网格品牌页脚，登录改底部文字切换。446项官网测试与Linux生产构建通过，已部署；[实现说明](docs/engineering/route-colors-grid-footer-20261106.md)、[验收报告](docs/validation/route-colors-grid-footer-20261106.json)。此条覆盖下方全站黄底和中央图标切换的历史说明。

2026-11-06 20:59 最新官网已上线：黄色网格开场、滚动渐出与雪山展开；登录/注册恢复左右互换，图片40%/表单60%，整张卡片中央固定指定双箭头，注册新增确认密码。此条替代20:04的固定左右布局说明。430项官网测试、Linux生产构建与4组线上登录/注册尺寸验收通过。[实现与发布](docs/engineering/home-grid-auth-swap-20261106.md)、[验收记录](docs/validation/home-grid-auth-swap-20261106.json)。仅更新官网。

2026-11-06 20:04 登录/注册卡片优化已上线：固定同尺寸卡片、图片/表单2:3、固定居中单图标切换（登录蓝色/注册白色），注册成功回登录。430项官网测试及Linux生产构建通过，6组真实HTTPS尺寸与加载前后无尺寸跳变验证通过。[实现与发布](docs/engineering/public-auth-page-20261106.md#2026-11-06-固定卡片与单图标切换已上线)、[验收记录](docs/validation/auth-card-20261106.json)。仅官网更新。

2026-11-06 18:13 登录页高度修复已上线：`100vh`兼容回退＋`100dvh`，去掉照片固定最小高度，按视口分配页头/卡片/页脚；常见桌面登录无滚动条，极短屏保留表单内部滚动。[11组真实HTTPS尺寸验证](docs/validation/auth-viewport-20261106.json)通过，430项官网测试及Linux生产构建通过；本轮仅官网CSS更新，后台/API/App未改。

2026-11-06 17:55 最新发布：[官网独立登录页与体验更新](docs/engineering/public-auth-release-20261106.md)已上线至[登录页](https://lichcarlos.top/snow/login)和[官网](https://lichcarlos.top/snow)。Linux生产构建、430项官网测试、真实HTTPS登录/刷新恢复/退出及手机布局验证通过；仅官网服务更新，管理端/API/数据库结构/Nginx未改，APK未更新。下面“本地未部署”为各阶段历史状态。

2026-11-06 增量：[官网与社区体验优化](docs/engineering/community-ui-20261106.md)，有限像素揭幕、目录错峰、相册横滑/大图/键盘和社区雪场链接；官网部分已包含在上述发布，后台/App部分未由本轮发布。

2026-11-06 官网新增：[独立登录／注册页](docs/engineering/public-auth-page-20261106.md)，蓝底红线Waves、滑雪摄影和桌面左右切换，手机精简表单；移除顶部展开登录。**现已部署，APK未变**。

2026-11-06 最新线上发布：[富文本与官网更新](docs/engineering/markdown-release-20261106.md)。官网/管理端均已部署，17项真实HTTPS浏览器检查通过，含Tiptap源文/表格预览和站内链接；未提交合成业务内容。OpenAPI1.53.0。此前“仅本地、未部署”为历史状态。

2026-11-06 最新本地增量：[Tiptap/Markdown编辑与阅读](docs/engineering/markdown-editor.md)。包含知识编辑、社区审核阅读、Asset正文图片与受控链接，OpenAPI1.53.0。**未部署、未更新APK**；以下线上记录属于此前版本。

2026-11-06 较早本地增量：[参考站风格官网UI](docs/engineering/units-ui-local-20261106.md)已实现常驻侧栏、展开目录、黑框圆角撞色和推荐雪场纵滚横移；此增量**未部署**，下面的线上部署记录是此前版本。当时未涉及后台/App及Markdown；后续富文本实现见上方最新记录。地图SDK仍未接入。

2026-11-06 最新部署：精修官网与管理端已更新至[官网](https://lichcarlos.top/snow)和[管理端](https://lichcarlos.top/snow-admin/login)，58 项真实 HTTPS 页面/登录/响应式与品质专项检查全部通过。两端完整 Linux 生产构建、TypeScript 与 standalone 校验通过；后端/数据库/Nginx 未改，APK 仍为 11-05 的 1.0.1。见[本轮发布说明](docs/engineering/ui-release-20261106.md)和[部署报告](docs/validation/ui-release-20261106.json)，含服务器构建资源事件与回滚入口。

本轮 UI 精修研究 Linear、Vercel、Carbon 等团队的方法，核查并安装 GitHub 设计 Skills，优化官网首屏、阅读节奏及后台导航/统计层级，保留蓝色主体与红黄橙撞色。见[设计研究与实施](docs/engineering/ui-design-research-20261106.md)和[当时本地验证](docs/validation/ui-design-research-20261106.json)；其中“未部署”已由上述发布替代。

品质目标追加为 Awwwards / Webby / FWA 参照级：本轮 3055 项应用测试、双生产构建和 57 项浏览器/专项检查通过；[自检与参赛缺口](docs/engineering/award-quality-review-20261106.md)明确区分工程通过与获奖判断，不声称已获外部品质认证。

2026-11-05 最新交付：官网与管理端采用蓝色主体、红黄橙多巴胺撞色，已更新至线上服务。本地双生产构建及类型检查、3052 项测试、35 项隔离浏览器检查通过；另有 7 项真实线上检查通过，含管理员登录与刷新恢复会话。详见[发布说明](docs/engineering/dopamine-release.md)及[验证报告](docs/validation/dopamine-release-20261105.json)。管理端 Linux 构建采用编译后分阶段 generate，服务器重复类型检查因换页中止，具体边界见报告。

此前全端 UI 优化：[官网与管理端说明](docs/engineering/project-ui-system.md)、[官网规范](apps/web/DESIGN.md)。当时未发布及[冰蓝主题验证](docs/validation/ice-theme-20261105.json)为历史状态，已由上述新主题部署替代。

此前管理端组件样式优化涵盖分组导航、表格/表单/弹窗主题、登录与工作台、响应式布局，已包含在上述新主题部署中。[组件选型与实现说明](docs/engineering/admin-ui-system.md)、[界面规范](apps/admin/DESIGN.md)与[当时验证记录](docs/validation/admin-ui-20261105.json)。

2026-11-05部署增量：[同域子路径部署](docs/engineering/server-path-deployment.md)。官网https://lichcarlos.top/snow、后台https://lichcarlos.top/snow-admin/login已上线，双Linux构建、lint/typecheck、子路径专项及真实浏览器登录恢复通过。以下旧阶段“未部署”仅为历史结论。

2026-11-05 收尾：五项闭环实现已交付。Backend1494单测/177框架HTTP/865真实DB、8项真实服务场景通过；Web3062业务测试及双生产构建通过；App1238测试、三平台导出及4项Android实操通过。完整浏览器、iOS/真机与新增依赖真实Kafka仍待验；构建和API测试不代替完整三端点击验收。 详见[本轮报告](docs/validation/business-closure-20261105.json)。

2026-11-05 当前基线 **OpenAPI 1.52.0 / 151 操作**。管理端账号详情新增商家资料与扩展字段；雪场发布/下架支持原因，RAG控制台显示固定失败码。官网新增 `/catalog` 三实体公开组合查询。两应用继续各自维护业务与认证边界。 [工程说明](docs/engineering/business-closure.md)与[本轮结果](docs/validation/business-closure-20261105.json)分别记录实现和验收。以下2026-11-04测试计数是历史，不能代替本轮复验。

独立的Next.js/TypeScript仓库，包含官网apps/web和商家/系统管理后台apps/admin；基于LichCarlos/nextjs_init扩展。本仓内部workspace不跨backend或app引用源码。核对日期：2026-11-04。

上一阶段OpenAPI **1.51.1 / 143操作**。最近独立冻结安装/check通过，3045业务测试、20源码工具与20发布工具通过；双无缓存构建和standalone产物检查通过。[产品报告](docs/validation/admin-asset-read-authorization-20261104.json)与[本轮文档核对](docs/validation/document-lifecycle-20261104.json)分别记录范围；本轮已重新冻结安装/check和双无缓存构建，见[本轮证据](docs/validation/five-source-kafka-rag-20261104.json)。

[本仓文档索引](docs/README.md)包含全部初始化/工程说明；[历史README](docs/history/README-20261104.md)保留旧阶段数据。目标浏览器的完整流程、生产HTTPS/代理、多实例和远程CI待验，构建成功不代表页面已完成目标平台验收。此前生产服务启动被自动审批审查拒绝，未重试。当前改动未提交、推送或发布。

本轮补充[RAG回填CLI验收报告](docs/validation/rag-backfill-cli-20261104.json)：8项真实PG/BGE-M3用例通过，三仓独立工程检查与构建/导出复验通过；未改产品接口、schema、前端行为或依赖。

本轮补充[Android原生模拟器验收](docs/validation/android-emulator-20261104.json)：11项场景通过，包括SecureStore进程重启/退出、真实RAG对话及历史引用、文章收藏与资料更新；三仓25条工程命令全部通过。Android真机、iOS与签名包仍待验。

最新专项：[SDK58原生上传修复](docs/validation/native-upload-20261104.json)。App使用Blob兼容文件替代旧URI multipart，头像实际上传/扫描/存储及账号绑定通过；多图社区完整原生链仍待验。三仓工程复验通过，失败与资源限制保留。

## 仓库内容

| 路径                     | 职责                                    |
| ------------------------ | --------------------------------------- |
| `apps/web`               | 面向游客和用户的官网                    |
| `apps/admin`             | 面向商家和系统管理员的管理端            |
| `packages/api-contracts` | OpenAPI 快照、生成类型和 HTTP transport |
| `packages/ui`            | Web 与 Admin 共用的 UI 源码             |
| `packages/config`        | 前端运行时配置读取                      |
| `packages/theme`         | 主题 token                              |
| `packages/utils`         | 无 UI 的通用工具                        |
| `tooling`                | TypeScript、lint 等开发配置             |
| `contracts`              | 从 Backend 发布过来的 OpenAPI 快照      |
| `docs`                   | 本仓库的初始化和工程实践说明            |

`apps/web` 与 `apps/admin` 共享本仓库内的包，但不会跨仓库导入源码。部署必须以本仓库
根目录为构建上下文，不能只上传 `apps/web` 或 `apps/admin`。

## 技术栈

- Next.js App Router、React、TypeScript
- pnpm workspace、Turbo
- Ant Design（管理端）和仓库内 UI 组件
- OpenAPI TypeScript 类型生成
- Oxlint、Prettier、Vitest

## 环境要求

- Node.js 22，版本基线见 `.nvmrc`
- pnpm 11.19.0
- 可访问的 Backend API，默认地址为 `http://localhost:8080/api/v1`

## 快速开始

在本仓库根目录执行：

```powershell
Copy-Item .env.example .env
pnpm install --frozen-lockfile
pnpm dev:web
```

- 官网：`http://localhost:3000`
- 管理端：另开终端执行 `pnpm dev:admin`，地址为 `http://localhost:3001`

`.env` 必须放在本仓库根目录。`NEXT_PUBLIC_*` 会进入浏览器构建产物，只能配置公开的
API 地址，不能放置 API key、数据库密码、JWT secret 或其他凭证。

## 环境变量

```dotenv
NEXT_PUBLIC_WEB_API_BASE_URL=http://localhost:8080/api/v1
NEXT_PUBLIC_ADMIN_API_BASE_URL=http://localhost:8080/api/v1
```

如果官网和管理端使用不同的 API 网关，分别修改两个地址即可。认证凭证由 Backend 的
HttpOnly Cookie、Origin/CSRF与客户端会话协调管理，前端不保存服务端密钥。

浏览器会话要求支持Web Locks的HTTPS/localhost、可用站点存储及同站不同Origin的Backend；将官网/后台Origin加入后端WEB_ORIGINS。不能混用localhost与127.0.0.1。前端不在浏览器存储access/refresh令牌，写请求带credentials并通过Origin/CSRF校验。同Origin代理与跨站部署不作为已支持路径。

## 常用命令

| 命令                                  | 用途                                       |
| ------------------------------------- | ------------------------------------------ |
| `pnpm dev:web`                        | 启动官网开发服务                           |
| `pnpm dev:admin`                      | 启动管理端开发服务                         |
| `pnpm build:web`                      | 构建官网及其 workspace 依赖                |
| `pnpm build:admin`                    | 构建管理端及其 workspace 依赖              |
| `pnpm package:web 目标`               | 将官网构建打包到新目录                     |
| `pnpm package:admin 目标`             | 将管理端构建打包到新目录                   |
| `pnpm release:verify web或admin 目标` | 验证发布包及内部依赖                       |
| `pnpm check`                          | OpenAPI、边界、lint、类型、测试和格式检查  |
| `pnpm test:admin-assets`              | 运行图片库/上传与读取恢复专项测试          |
| `pnpm test:api-client`                | 运行公共 API client 单测                   |
| `pnpm test:boundaries`                | 运行 workspace 边界测试                    |
| `pnpm openapi:verify`                 | 校验 OpenAPI 快照、锁文件和生成类型        |
| `pnpm openapi:generate`               | 根据 `contracts/openapi.json` 重新生成类型 |
| `pnpm format`                         | 格式化仓库文件                             |

## 前后端契约

Backend 仓库生成并发布 Swagger/OpenAPI；本仓库只保存消费侧快照，不复制 Backend 的
DTO、Entity 或业务代码。更新接口时按以下顺序操作：

1. 在 Backend 生成新的 `contracts/openapi.json`。
2. 将快照和对应的 `contracts/openapi.lock.json` 同步到本仓库。
3. 执行 `pnpm openapi:generate`。
4. 执行 `pnpm check`，确认版本、SHA-256 和生成类型一致。

当前快照版本为 `1.51.1`，SHA-256 为
`e5570e24af7bf5670cda3914591924f3c0d4321248c01ce0e7d2a95bd34745a8`，包含认证、系统管理、Asset、雪场与公开标签、文章/项目知识管理、商家收益查询、管理员收益录入/CSV 导入、收藏、社区动态/评论、社区审核、系统配置/公开投影、操作日志/事件查询重试、RAG 来源运维、AI 会话审计及管理员重置密码接口。完整接口清单以 `contracts/openapi.json` 为准；缺少的页面或未实现接口以项目契约追踪矩阵登记，未实现功能不得在页面中伪造成功状态。

## 权限边界

- 官网面向游客和普通用户。
- 管理端面向商家与系统管理员。
- 商家页面只展示本人商家范围内允许访问的滑雪场和收益数据。
- 系统管理员拥有整套系统的管理入口，包括 RBAC、数据字典和字段配置。
- 菜单隐藏只改善体验，不能替代 Backend 的认证、授权和数据范围校验。

当前管理端已有登录/会话恢复、权限控制导航及账号、角色授权、权限目录、字典、字段、资产、雪场、收益、文章、项目知识、社区审核、RAG 来源运维和 AI 会话审计页面。商家收益只读查询与系统管理员收益单条录入/CSV 导入已接当前 OpenAPI；页面入口隐藏不代替服务端授权。生产构建与自动化检查不等于登录后真实 API 工作流已完成，浏览器联调状态以契约追踪矩阵为准。

## 质量与 CI

- [账号管理与操作恢复](docs/engineering/admin-users.md)：完整角色目录、初始密码、最新目标、动作授权与未知写入核对。

- [权限目录管理工作流](docs/engineering/admin-permission-catalog.md)：最新详情、树表与父级、写入门禁、恢复台账和验收边界。

- [管理端字典请求与层级](docs/engineering/admin-dictionaries.md)：独立详情、请求取消、父级选择和写入核对。

- [官网社区与详情恢复](docs/engineering/community-recovery.md)：游标、评论分页及错误/空页处理。

- [官网知识目录](docs/engineering/public-knowledge-directory.md)：独立失败恢复、筛选与分页。

- [官网雪场筛选](docs/engineering/resort-directory.md)：组合条件、分页/重试保留、窄屏与缺少配置时的失败恢复。
- [官网公开列表边界](docs/engineering/public-directory-validation.md)：三类列表/两类目录的投影、分页校验、匿名读取和正文超时。
- [商家工作台](docs/engineering/merchant-dashboard.md)：雪场与收益面板、独立授权、请求取消和既有角色授权升级。
- [收益查询与维护](docs/engineering/revenue-pages.md)：金额字符串、筛选/取消、每日趋势及验收边界。
- [角色授权资源范围编辑](docs/engineering/role-resource-scopes.md)：资源目录、新增范围、历史兼容和测试边界。
- [管理端图片库与上传](docs/engineering/asset-library.md)：权限、选择复核、取消、上传与测试边界。
- [文章动态字段表单](docs/engineering/article-custom-fields.md)：字段目录与动态控件。

- [官网首页内容接入](docs/engineering/public-homepage.md)：雪场、知识、动态并发读取、独立降级、请求时渲染及测试边界。
- [公开详情分享信息](docs/engineering/public-detail-metadata.md)：公开域名、规范链接、标题摘要、错误索引策略与验证边界。
- [官网详情与评论边界](docs/engineering/public-detail-validation.md)：完整公开VO投影、评论局部恢复和雪场扩展字段展示。
- [管理端图片选择生命周期](docs/engineering/media-picker-lifecycle.md)：响应投影、身份校验、取消与迟到结果隔离及上传边界。
- [管理端路由权限与账号详情](docs/engineering/management-access.md)：页面权限、导航一致性、测试证据及验收限制。
- [AI 运维与会话审计](docs/engineering/ai-operations-pages.md)：RAG 来源授权操作和最少元数据、受审计正文读取。

角色默认数据范围仅 system_admin 可以配置。普通角色资料编辑省略 dataScope，新建角色固定 self；`pnpm test:admin-roles` 已加入 check，服务端授权仍是最终边界。

GitHub Actions 配置在 `.github/workflows/ci.yml`，会执行 frozen install、契约校验、
`pnpm check` 和全 workspace build。首次推送到自己的仓库时，将 `origin` 配置为项目
Web 仓库；模板仓库只保留为 `upstream`。

## 独立发布原则

- [2026-11-09 管理端新建/编辑/返回链接前缀修复](docs/engineering/admin-navigation-prefix-20261109.md)

- [2026-11-09 单框写作优化与知识库流程](docs/engineering/member-writing-20261109.md)

- 在本仓库根目录执行 Git、pnpm、构建和部署命令。
- 不从父目录读取 package.json、pnpm lockfile 或源码。
- `.env`、构建产物、缓存和用户上传文件不提交。
- 生产构建必须注入正确的公开 API 地址，并由 Backend 配置 CORS、认证和权限。

- [全局雪场管理页面](docs/engineering/global-resort-pages.md)

- [官网会话与凭证操作生命周期](docs/engineering/public-session-lifecycle.md)

- [管理端登录与会话生命周期](docs/engineering/admin-session-lifecycle.md)

源码接收校验：在安装依赖/创建.env前运行 `pnpm source:verify <副本绝对路径> <外部可信sourceSha256>`，或直接用Node运行校验器。详见[独立源码导出与冷安装](docs/engineering/source-export.md)。

standalone运行包与构建地址、目标平台要求见[独立发布](docs/engineering/standalone-release.md)。NEXT_PUBLIC_WEB_SITE_ORIGIN可选，仅用于官网canonical等分享元数据，也必须在构建前配置。API地址变更后重建；同OS/架构产物使用Node22运行start.mjs，不能依赖启动变量改写浏览器API配置。
