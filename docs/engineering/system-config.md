# 管理配置与官网政策页面

2026-11-03 系统配置完整读取与恢复续验：系统配置完整九字段VO/分页/筛选/保存回执校验、本地及结束身份复核、账号/商家隔离、隐藏取消清空正文/搜索/编辑器与显式恢复、查询键隐藏旧页、发送前共享账本仲裁及核对代次隔离已补。新增37项、管理配置115项及官网公开38项通过。真实管理HTTP77项（新增配置2项）及后置核对通过：默认六项、名称0→1→2、旧版本409、实际提交响应丢失后的人工读取核对且无重写、政策字面文本保存、匿名七字段投影/revision变化、复制grants非管理员拒绝、读取期真实退出与显式登录恢复均验。最终两条配置/版本2与1、三条仅版本元数据的成功审计精确匹配，总Outbox53保持；原业务断言保持，临时服务已停止。当前契约1.51.1，见[本轮说明](admin-config-read-lifecycle.md)。下方配置78项/旧版本与验收限制为历史记录。

## 2026-11-03 官网公开配置读取续验

现行OpenAPI1.50.0 / 143操作，对应WEB-08/API-M11。本轮修改官网Provider及公开读取；下方2026-11-01部分保留管理配置页面的历史实现与验收数量。没有新增产品接口、DTO/VO、配置项、依赖、迁移或跨仓引用；Backend仍独占数据库，官网只请求既有GET /public/config。

14项失败先复现：九种无效成功体、额外非公开字段、两类取消边界、切换页面时旧配置进入新正文，以及公开401触发凭证刷新。新增独立site-config-api模块，按已确认目录校验名称50、标语200、介绍10000、邮箱254、政策/协议各30000个Unicode码点；可空值必须null或非空字符串，revision要求SHA-256十六进制。只提取七个固定公开字段，未知字段不进入Provider状态；不依赖TypeScript类型断言验证网络数据。邮箱格式仍由后端管理写入负责，本页只按既定长度和文本类型读取。

公共HTTP客户端增加内部请求选项skipAuthRefresh，公开配置显式启用；该选项在fetch前剥离，不进入HTTP报文，也不改变默认受保护接口的Cookie/CSRF/401刷新行为。共享包只增加无业务的请求策略，不保存官网状态，不配置其他应用身份。公开GET仍使用原有地址装配、no-store和AbortSignal，不新增数据库或模型直连。

SiteConfigRun管理当前路径读取生命周期、同步单飞与AbortController。路径变化/卸载取消本轮，旧成功、旧错误、旧finally均不能覆盖或释放新读取；旧清理和重试即使返回同一路径也因lifetime不同而失效。手动重试只读取公开数据，没有写入重放。每次开始清空旧正文，错误只呈现安全通用提示；页面访问期间不自动轮询、窗口聚焦刷新或无限重试。

Provider保留客户端pathname读取与useEffect装配，但正文/品牌先通过visibleConfig检查状态归属路径；新路径渲染而effect尚未执行时也只展示加载及默认品牌，避免旧配置瞬间进入新政策页。处理器同步复核最新pathname，阻止旧页面按钮在cleanup前开始请求。关于、隐私、协议继续纯文本显示、保留换行、邮箱链接与未发布提示，页脚链接保持。

专项公开配置5文件38项、共享客户端15项通过，较原有公开4项和客户端14项净增35项。新增覆盖协议15、生命周期13、Provider路由投影1、真实回环HTTP5及共享传输1。回环使用Node原生HTTP、fetch、生产客户端及reader/生命周期；验证合成响应包解析、固定投影、无效体拒绝、401不刷新、未完成JSON取消关闭和人工重试。它不运行Nest/PostgreSQL，不证明真实后端或浏览器Cookie；Provider测试明确模拟React状态/effect时间，纯模型和SSR也不能替代hydration、点击或视觉验收。

首轮typecheck发现测试读取mock.calls时未判空，补齐检查后由完整check复验；原始14项失败和类型错误日志均保留，日志前缀public-config-。本仓独立冻结安装、完整check（26次Vitest合计1494项业务加20项发布测试，含包边界/lint/typecheck/format）、官网/Admin双无缓存构建和standalone打包校验均通过，进程退出0。Backend配套1192单测/156HTTP及build、App1151项/Doctor20/20及三平台导出、三仓冻结安装均通过，完整证据见共享阶段记录。Docker只读查询返回Linux引擎管道不存在，按用户决定不重启；新增RAG/授权数据库、真实浏览器/设备和整体交付继续待验。没有重试被拒绝的Next生产/Expo开发服务，也没有提交、推送或部署。

独立复现：

```powershell
pnpm install --frozen-lockfile
pnpm test:system-config
pnpm test:api-client
pnpm check
pnpm build --cache-dir=D:/linji-public-config/20261103/turbo-cache --concurrency=1
```

2026-11-03实现前实际查阅本仓Next.js16.3.5的`apps/web/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-pathname.md`、`01-app/01-getting-started/05-server-and-client-components.md`及`06-fetching-data.md`。落地为客户端路径/effect边界、保留服务器与客户端责任、HTTP no-store；没有因官方文档允许Server Component查询ORM而改变本项目后端独占数据库的要求。原有skills.sh工程实践记录继续有效，未新增Skill。

## 2026-11-01 管理配置页面与首次官网接入

2026-11-01；沿用已确认的 API-M11，当前 OpenAPI 1.46.0。Web 是独立仓库，消费本仓 contracts/openapi.json 并生成本地类型，不导入 Backend 或 App 业务代码。本轮只修改管理配置页面，没有新增接口、依赖或数据库迁移。

管理端 `/admin/system/config` 仅允许具有管理入口与配置读取权限的系统管理员。会话 loading、匿名、不可用与无权限分别处理；账号、角色键或 grants 改变时重新挂载页面并取消旧请求，旧响应不能发布到新身份视图。读取前访问 `/auth/me` 复核身份和权限，写入前另复核 update grant；最终授权仍由后端决定，前端预读不承诺即时取消所有在途撤权。

目录支持名称/键搜索、清空、偏移分页、页大小切换、空页返回和错误重试，展示摘要、版本与更新时间。打开编辑器后重新读取最新配置，不使用列表缓存作为编辑原本。现有协议没有配置详情 GET：使用已有目录查询按键搜索，再精确匹配唯一配置键；目录不完整、重复或无匹配时拒绝编辑。只支持六个已定版的文本键：name 50、tagline 200、about 10000、contactEmail 254、privacyPolicy/termsOfService 各 30000 字（均有 `site.` 前缀）。正文按 Unicode 码点计数，trim 后非空，邮箱另校验格式，不执行 HTML。

保存先验证 DTO，再重读配置及定义，与打开时的完整快照比较；未变化才提交原始 expectedVersion 和 value，不自动替换版本号。同步门禁在异步校验前占用，防止双击和重入。预读发现变化或服务端返回409时保留输入并锁定保存，用户明确选择“刷新配置并重新编辑”后读取新原本。服务端 expectedVersion 仍负责预读与写入之间的并发冲突控制。

写请求发出后若网络异常、408、5xx 或返回的键/版本/内容不匹配，则按账号在当前浏览器内存登记待核对操作，禁止自动重放。台账只存配置键，不保存政策正文；同一页面树内重挂载仍保留，在途写入不能确认清除。完整刷新、关闭页面和其他标签页不共享该台账，不能将其视为持久幂等机制。明确4xx业务失败清除本次记录。

未知结果恢复要求先重新读取目标版本/时间和目录，再人工确认。待核对期间可打开只读编辑器查看完整正文，也可关闭编辑器；保存保持锁定，避免核对流程被自身门禁阻塞。读取后的“我已核对，继续操作”只释放本地门禁，不判定原请求成功。请求失败展示安全提示及可用 traceId，不直接展示未知服务端异常正文。

官网新增 `/about`、`/privacy`、`/terms` 和全局信息链接，首页及雪场/知识/动态列表与详情的品牌名称、首页标语消费配置。站点内 Provider 在页面路径变化时访问 `GET /public/config`，cache=no-store，取消旧请求以防旧响应覆盖新页面。正文仅 React 纯文本，保留换行并允许长内容换行，邮箱使用 mailto；未发布和请求失败分别显示明确提示及重试，不写占位法律条款。

管理端 5 文件78项验证覆盖 transport、原版本提交、30000 emoji、邮箱/偏移、定义白名单、401/403/409、身份变化、取消、写入竞争、未知结果台账和 SSR 会话门禁；其中70项为本轮新增，原8项保留。公开4项 SSR 验证未发布、缺介绍/邮箱、脚本字符串转义和联系链接。`pnpm test:system-config` 已纳入 check。测试以可控请求替身、状态模型及 SSR 为主；真实浏览器点击、真实 API 成功保存和视觉 QA 仍待验收，不能用单测替代。

实现前查阅本地 Next.js 文档 `next/dist/docs/01-app/01-getting-started/06-fetching-data.md` 与 `01-app/03-api-reference/02-components/link.md`（2026-10-30）。服务端状态在各自应用内维护，公共包仅增加生成的契约类型。

本轮验证：`pnpm check` 完整1234项、契约/包边界/lint/typecheck/格式检查以及 `pnpm build` 官网/Admin均通过。专项与完整日志为 `config-pages-tests-verified.log`、`config-pages-check.log`、`config-pages-build.log`，初轮失败及复验日志保留。三仓OpenAPI1.46.0 SHA-256均为 `e18e8cd888793a76fac80c6be22161f930485694a7eac95c42f8865439d52de6`。Backend/App本轮业务代码无变更，未重新运行其全套测试；本轮没有安装新依赖、写数据库或启动生产服务。
