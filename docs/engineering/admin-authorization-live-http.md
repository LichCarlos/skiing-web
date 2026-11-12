# 管理端生产模型与授权真实HTTP联调

2026-11-03 工作台汇总读取与联调：当前管理套件31项，新增四项工作台生产读取器场景；新库及后置持久核对通过，见[本轮范围](dashboard-live-http.md)和[证据](../validation/dashboard-lifecycle-20261103.json)。以下27项及更早内容为历史范围，不累计重复运行次数。

2026-11-03 项目知识与事件运维联调：当前套件27项，新增四项项目知识与两项事件重试，最终目录D:/linji-content-http/20261103/final/linji-admin-http-owyISh；客户端和后置持久核对通过，见[本轮范围](content-events-live-http.md)及[证据](../validation/content-events-http-20261103.json)。以下为历史21项及更早阶段，不累计测试数。

2026-11-03 RAG来源真实HTTP续验：当前套件为21项，新增六项[来源管理与恢复核对](rag-source-live-http.md)，已在全新临时库完成客户端及后置持久验证。最终目录 D:/linji-rag-http/20261103/verified/linji-admin-http-MFQwEY；原始HTTP字段白名单另行断言。见[本轮证据](../validation/rag-source-http-20261103.json)。以下保留历史十五/十二/十一等阶段，各次不累计。

2026-11-03 AI审计增量：现行套件十五项，新增[会话元数据、受审计正文和即时撤权](ai-audit-lifecycle.md)三项；自定义角色使用user:self范围，跨用户404、游客排除、存储引用数组/BigInt精度、成功访问审计及消息完整性已由实际编译Nest/PostgreSQL和后置断言验证。最终目录 D:/linji-audit-lifecycle/20261103/runs/linji-admin-http-kExJVJ，十五项与后置核对通过，本次服务已停止。首轮十四项通过，一项旧CSRF缓存断言失败，保留于同级linji-admin-http-W1Z0OV并正常停止；修正测试只允许可选的一次准确CSRF拒绝及一次成功刷新，生产客户端/鉴权保持。见[本轮证据](../validation/ai-audit-lifecycle-20261103.json)。以下为此前阶段，不累计重复测试。

2026-11-03 操作日志增量：现行套件十二项，新增[身份复核及日志生产读取器](operation-log-lifecycle.md)一项，连接编译Nest和全新临时PostgreSQL，核对全部筛选条件、分页、公开投影和普通账号403。十二项、后置持久核对、结构复验与停止确认均通过；目录 D:/linji-operation-logs/20261103/runs/linji-admin-http-mBbvld，OpenAPI1.51.0/143操作、24迁移。见[本轮摘要](../validation/operation-log-lifecycle-20261103.json)。以下保留此前十一/十/九项记录，不累计重复测试。

2026-11-03 字典增量：现行套件十一项，新增生产字典列表/详情读取器一项，实际读取父子层级和disabled子项。目录 D:/linji-dictionary-recovery/20261103/runs/linji-admin-http-SSlHo1 的十一项、后置持久核对及结构复验通过；Node/PostgreSQL已停止。见[本轮摘要](../validation/dictionary-recovery-http-20261103.json)及[字典恢复](dictionary-write-recovery.md)。以下十项及九项保留各历史阶段事实。

末次源码复验：D:/linji-field-recovery/20261103/final/linji-admin-http-6FlrOE 十项与后置持久核对再次通过，两测试服务已停止；源码/日志绑定以本轮 field-recovery-http 摘要为准，重复运行不累计测试数。

2026-11-03 字段恢复增量：现行套件为十项，新增生产字段列表/详情、分组目录/复合键详情读取器联调。十项与后置持久核对已通过，目录为 D:/linji-field-recovery/20261103/runs/linji-admin-http-NdRLcx；本次服务已停止。见[本轮摘要](../validation/field-recovery-http-20261103.json)及[字段恢复边界](field-write-recovery.md)。以下九项记录保留上轮事实，不覆盖原证据。

负责人：Web。状态：九项联调及后端持久验证通过，Next/浏览器页面待验。基线：OpenAPI1.50.2/143操作。

2026-11-03 九项全部通过；Backend后置持久核对、末次结构校验与停止确认也通过。最终运行目录 `D:/linji-admin-http/20261103/runs/linji-admin-http-KS39Eg`，见[本仓摘要](../validation/admin-authorization-http-20261103.json)。初次测试角色缺少现行auth/me所需account:profile:read，登录后复核失败；增加显式测试grant后在新临时库通过，生产会话与授权代码保持不变。

`pnpm test:admin-authorization-http` 是独立opt-in套件，调用本端生产apiRequest、登录/会话、角色授权快照构造器、账号角色目录/绑定模型及商家雪场读取/表单保存流程。API必须显式指向一次性回环Nest服务，夹具库名必须为linji_admin_authorization_validation。套件不导入Backend或数据库代码，不启动其他仓库或Next，不纳入默认离线check。

在独立Backend终端按其README运行专用临时库入口。取得该次ready.json后，在本仓终端设置：

```powershell
$ready=Get-Content '<本次运行目录>/ready.json' -Raw | ConvertFrom-Json
$env:NEXT_PUBLIC_ADMIN_API_BASE_URL=$ready.apiBaseUrl
$env:ADMIN_AUTH_HTTP_FIXTURE_JSON=$ready.fixture | ConvertTo-Json -Depth 20 -Compress
$env:ADMIN_AUTH_HTTP_PASSWORD='<与Backend约定的本次合成账号密码>'
$env:ADMIN_AUTH_HTTP_RESULT_PATH='<本次运行目录>/client-result.json'
$env:NODE_OPTIONS='--max-old-space-size=1536'
$env:VITEST_MAX_WORKERS='1'
pnpm test:admin-authorization-http
if ($LASTEXITCODE -ne 0) { throw 'HTTP套件失败，不得写入passed确认' }
Set-Content -LiteralPath '<本次运行目录>/stop.request' -Value 'passed' -NoNewline
```

服务端另核对持久化并停止，须检查其report.json，不能仅凭客户端退出0断言全链路通过。失败时可在Backend本次目录写failed以结束等待并保存失败记录；重试服务使用新临时目录。本仓结束时退出两份会话并清除内存Cookie，client-result.json的completed仅在现行二十七项全部通过时为true；结果文件仅记录资源ID、拒绝请求traceId及方法/路径/状态，不写密码、Cookie、令牌或请求正文。

现行套件除字典、字段和日志读取外，还覆盖可配置多角色商家身份、本人商家数据过滤、跨商家404、Cookie/CSRF刷新轮换、CanRead/CanWrite并集和真实表单保存、私有/未知字段及伪造归属拒绝、具备授权grant但非system_admin的委派拒绝、多角色范围冲突fail-closed、字段/账号动作即时撤权。角色授权和账号绑定通过既有REST接口完成；商家建档仅是后端测试夹具，D-49仍待确认。

Node transport仅为原生fetch附加测试Origin和按路径隔离的Cookie jar，不替换HTTP响应、生产业务模块或服务。它刻意允许测试回环HTTP承载服务端Secure Cookie，因此只能核对签发标记和线协议，不能证明浏览器会接受Cookie、SameSite/CORS行为、组件点击、React恢复或Next运行。测试中删除access Cookie验证401→真实refresh→重读并核对refresh凭证改变，不声称等待过真实JWT有效期。旧业务测试与独立9项HTTP分别计数，不将服务可启动记为页面验收完成。
