# 官网公开内容真实 HTTP 验收

日期：2026-11-03。负责人：Web/Backend；状态：验收入口已实现，实际结果以本阶段交付记录为准。基线 OpenAPI 1.50.2 / 143 操作，没有新增业务协议、模型或迁移。

## 验收边界

既有公开详情测试使用真实 Node fetch 和合成 API，未证明官网生产读取器与实际 Nest/Prisma/PostgreSQL 响应匹配。本套件运行官网本仓 apiRequest、匿名读取器、完整 VO 投影与分享元数据函数，连接单独启动的编译后 Nest 服务和临时 PostgreSQL 17/pgvector。没有替换 fetch、API、业务服务或数据库仓储。

后端专用夹具仅在明确确认的回环 linji_public_content_validation 库运行，先核对实际 current_database() 和全新 seed 状态，再直接建立合成测试资料：4 雪场、5 文章、4 动态、3 条 ready 图片元数据、21 条可见及 2 条不公开评论。包含草稿/隐藏/撤回/删除、停用分类、商家私有联系方式与 IsPublic=false 字段。图片没有实体对象，S3 适配器仅使用合成密钥在本地生成 900 秒签名，测试不下载图片，不计对象存储/扫描验收。

八项真实 HTTP 用例检查三类完整公开详情、零/空值和签名相册、后端原始 wire 的私有字段排除、评论 20+1 和空页/稳定次序、非公开详情及评论拒绝、登录用户收藏与匿名读取隔离、分享元数据成功且不嵌入临时签名图片。注册、登录、两次收藏及退出通过既有 HTTP 协议完成；数据准备使用无浏览器 Origin 的原生 token 分支，凭证仅在测试进程内存中，不计浏览器 Cookie/CSRF 验收。数据库终验核对两条收藏归属、无有效读者会话、原始业务数量不变和无 Outbox 写入。

不启动 Next，不验证 RSC、React 请求去重、路由 HTTP 状态、浏览器 Cookie/CSRF、页面交互、图片下载或实际分享抓取。元数据函数通过真实 HTTP 获取数据，并不代表实际 head/HTML 已验收。原生 App 与管理端浏览器不在本套件范围。

## 两仓各自执行

后端先独立冻结安装、check/build，准备官方 PostgreSQL 17 和 pgvector。运行本仓的 test:native-public-http：

```powershell
$env:LINJI_NATIVE_PG_ROOT='D:/linji-native-postgres/20261103/runtime/pgsql'
$env:LINJI_NATIVE_PG_OUTPUT='D:/linji-public-live/20261103/runs'
pnpm test:native-public-http
```

该命令只操作 Backend 和本次 mkdtemp 目录，不启动或读取 Web/App。初始化独立 SCRAM 集群、23 项迁移、双 seed、前置 db:verify、夹具，再启动 dist/main.js。仅 PostgreSQL 绑定回环；API 沿用现有 main 的默认监听行为，客户端使用打印的 127.0.0.1 地址。NODE_ENV=test 和显式开关停用异步 worker，没有用 OPENAPI_EXPORT 模拟运行，也不要求 Docker/Kafka/模型/存储服务。服务日志只在本次目录收集并脱敏，初始化密码文件使用后移除，不保存连接串或凭证。

Backend 打印 ready.json 后，在 Web 仓库另一个终端执行：

```powershell
$taskReady=Get-Content -LiteralPath '<本次完整目录>/ready.json' -Raw | ConvertFrom-Json
$env:NEXT_PUBLIC_WEB_API_BASE_URL=$taskReady.apiBaseUrl
$env:PUBLIC_CONTENT_HTTP_FIXTURE_JSON=$taskReady.fixture | ConvertTo-Json -Depth 6 -Compress
pnpm test:web-public-http
```

前端仅取得 HTTP 地址和合成资源编号，没有数据库/存储/管理员凭证、后端代码导入或依赖。两个项目各自锁文件/命令/测试配置保持独立。测试配置只收集此 opt-in 文件，常规 pnpm check 不会意外访问服务或注册账号。每次验收使用全新夹具；重复执行旧夹具会因固定合成账号已存在失败，不能当作可自动重试写入的示例。

只有 Web 测试命令退出 0 后，才在已完成测试的 Web 终端或第三个终端手动确认；不要中断正在等待的 Backend 进程。在 Web 测试命令后立即核对退出码并写入本次目录：

```powershell
if ($LASTEXITCODE -ne 0) { throw 'HTTP 验收未通过，不写成功确认' }
Set-Content -LiteralPath '<本次完整目录>/stop.request' -Value 'passed' -Encoding utf8
```

这是验收人员确认，不是脚本自动证明测试通过；必须同时留存 Web 测试日志。后端随后进行持久断言与末次 db:verify，再停止本次 Node 子进程和本次 PG 数据目录；超时 15 分钟、API 意外退出、错误确认或断言失败也会执行清理，并返回失败。不得因中途存在 ready.json 判断通过。

后端通过标准为 report.completed、report.stopped、report.serverStopped 全部 true，前后 db:verify 与 fixture-verify 通过，且独立 Web 八项测试退出 0。Windows 精确终止测试子进程不是生产 SIGTERM 排空验收；宿主强杀时 finally 不能保证运行，人工清理只能针对该次 report/data 路径，禁止结束系统全部 Node/Postgres。

## 本次结果与剩余工作

末次8项全部通过，运行目录D:/linji-public-live/20261103/runs/linji-public-http-nrXLFC。23迁移、双seed、前后db:verify与fixture-verify通过；report.completed/stopped/serverStopped全为true，两端口无监听，PID与初始化密码文件不存在。首轮esssiU亦成功并停止；末次将测试地址统一经本端配置读取、隐藏动态评论断言收紧为404后使用全新库复验，两个结果不累加为16项独立覆盖。脱敏步骤与末次测试日志摘要见[本仓验收摘要](../validation/public-content-http-20261103.json)，三仓常规复验结果见共享阶段记录。没有修改生产业务读取代码；本阶段交付的是可复现验收入口与真实链路证据。

官方 PostgreSQL/pgvector 来源沿用[隔离数据库说明](../../../backend/docs/engineering/native-postgres-validation.md)。Next 依据为安装版 16.3.5 Vitest 文档：异步 Server Component 仍需要真正 E2E，本套件不扩展其覆盖声明。现有浏览器启动自动审批拒绝、Docker 不重启、D-49/D-50/D-51 待确认继续保留。
