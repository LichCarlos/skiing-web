# 独立源码导出与冷安装

2026-11-03 已在 `D:/linji-source-export/20261103/run-01/web` 完成555文件快照的全新store冻结安装、完整check（1909业务、20发布、8项导出测试）、官网/Admin双强制构建（0缓存）与两份standalone发布包校验。[本仓验证摘要](../validation/source-export-20261103.json)绑定源码清单、模块实际路径、日志摘要及Build ID；未启动Next或浏览器。官网1360文件，Admin1952文件，构建结果不计作运行验收。

在本仓执行 `pnpm source:export <新建绝对目录>`，生成仅含 Web 仓库源码的副本。仓库内部保留官网/Admin workspace；不打包 Backend、App 或父目录依赖，不启动任何服务。脚本只需 Node 22 与 Git；目标父目录须已存在，目标目录不得存在。

```powershell
pnpm test:source-export
pnpm source:export D:/linji-source-validation/web
```

导出 Git 跟踪及未忽略的未跟踪文件，包含当前未提交修改/新增源码，排除工作树已删除项。排除 .git、node_modules、.next/.turbo、构建及测试产物、日志、环境凭证和本机 Agent 设置；保留 .env.example 模板，拒绝私钥文件。不是 Git 提交、远程发布或内容密钥扫描。

源文件禁止链接；源和目标必须分离，解析 Windows 长路径与目标父目录 junction 后再检查。不会覆盖既有目录或递归删除失败副本。复制后重读源文件及集合校验，变动时失败并保留诊断副本，重试使用新目录；不宣称并发写入下的原子快照。

.source-export.json 为每个文件记录路径、字节数及 SHA-256，并绑定本仓包管理器和 OpenAPI 摘要。sourceSha256 按路径排序，取 `sha256<TAB>bytes<TAB>path<LF>` 串的 SHA-256；该清单不包含本机源码绝对路径或部署凭证。

在副本自身目录独立执行，使用从未使用的新 store 和构建缓存路径：

```powershell
Remove-Item Env:NODE_PATH -ErrorAction SilentlyContinue
$env:NODE_OPTIONS='--max-old-space-size=1536'
$env:VITEST_MAX_WORKERS='1'
pnpm install --frozen-lockfile --store-dir D:/linji-source-validation/stores/web
pnpm check
pnpm build --force --concurrency=1 --cache-dir=D:/linji-source-validation/turbo-cache
pnpm release:verify web apps/web/.next/release
pnpm release:verify admin apps/admin/.next/release
```

新增八项 Node CLI 黑盒测试已接入 pnpm check，且两份导出脚本纳入 typecheck:release。测试校验实际文件/摘要、未提交源码/删除、过滤、覆盖/越界、junction 和凭证拒绝。测试创建独立临时 Git 仓库，清理前验证限定的临时路径。

NEXT_PUBLIC 地址在构建时绑定，真实使用按 [README](../../README.md) 配置；测试地址不可当作正式地址。验证副本的 Next/TypeScript realpath 应位于副本自身依赖树，并记录新 store 的初始不存在、工具版本与全部命令退出码。这里的构建及发布包验证不证明 Next 服务、Cookie、浏览器/RSC或生产环境已验收；既有启动限制与 [浏览器待验步骤](independent-start-validation.md) 保持。

## 接收源码前的独立完整性校验

2026-11-04新增 `pnpm source:verify <源码副本绝对路径> <外部可信SHA-256>`。校验器只使用Node内置模块，不需要Git、依赖、原目录或其他仓库；三个仓库各自维护入口。请先校验完整、尚未安装依赖或写入.env的源码副本，之后再冻结安装。

```powershell
# 在可信的本仓目录执行；摘要从交付方的独立可信渠道取得。
pnpm source:verify D:/delivery/web <sourceSha256>

# 已信任此校验器代码时，可直接用Node运行，无需pnpm安装依赖。
node --experimental-strip-types scripts/export-source.ts --verify D:/delivery/web <sourceSha256>
```

它核对formatVersion、必需文件、严格排序且唯一的相对路径、文件大小/摘要、源清单总摘要、packageName/packageManager及OpenAPI元数据，拒绝链接、越界路径、缺失、增加或修改的文件。校验不执行被校验目录中的产品代码，也不写入或删除文件。所有文件都须列入清单；安装后生成的node_modules、构建产物或.env会导致文件集合检查失败，不能用该命令校验已配置的运行目录。

摘要必须另行保存，不能从收到的待校验清单自动取值；重新计算被篡改清单不能通过原外部摘要。自带脚本不是信任根：收到不可信交付时应先用已信任的本仓校验器，不能先执行对方脚本。该方式校验已知摘要下的完整性，不提供数字签名、发布者认证、内容密钥扫描、原子文件系统快照或实际启动证明。导出快照不含Git历史，交付后是否初始化新Git仓库由接收方决定。

新增12项CLI回归与既有8项导出回归一起纳入 `pnpm test:source-export`/`pnpm check`。CI在本地完成导出、外部记录的摘要核对与tar归档后，配置上传源码及独立摘要元数据；尚未运行远程CI，配置不是已发布证据。

## 2026-11-04 实际源码包与冷安装复验

源码工具现为20项CLI黑盒回归，其中新增12项独立校验；只依赖Node/Git的导出和只依赖Node的校验均通过，包管理器脚本可选使用pnpm。实际源码归档为 `D:/linji-source-verify/20261104/web-source.tar.gz`，独立摘要元数据为同目录 `web-source-metadata.json`。

本仓冻结点：711文件，sourceSha256=`a388d80420a8335b2b0cb6292858f7d8d73ac6b2ec3c2da22d5f0db9fe26feec`，tar.gz SHA-256=`96b507f288cfc6aed5902cd63e4746542e60638f97a705683f97d8a2a42c0de8`。压缩包先验证、解包后再验证，在 `D:/linji-source-verify/20261104/cold/web` 使用首次不存在的独立store冻结安装。模块实际路径与源文件摘要均有记录；未借用父目录或其他仓库代码。归档是本轮代码及预先说明文档的冻结快照，最终README/结果报告在校验后增加，不会回写已封存压缩包。

冷副本完整验证：Backend1271单测+20源码工具、173HTTP框架、build/编译后OpenAPI；Web3045业务+20源码工具+20发布工具、官网/Admin双强制构建（0缓存）及独立包校验；App1217业务+20源码工具+10产物工具、Doctor20/20、三平台导出/导出后类型及88文件封存迁移校验，均通过。外部验收编排首次在Web成功冷安装后从workspace根误定位Next，实际应从apps/web解析；修正后只从模块核对续跑，未重复已通过命令，原记录保留。Web下载警告随日志保留；App首次新store冻结安装因依赖下载超时以1退出，随后在同一专用部分store降低并发为4、下载超时延长至180秒仍反复超时/连接重置，经核对进程身份后中止本次安装；最后以npmmirror、并发2及原锁完整性校验续装通过。未更改锁文件/源码或借用其他依赖；首轮失败、中止及恢复日志均保留，不将前两次安装记为通过。详见[本仓冷验报告](../validation/source-verify-20261104.json)。源码压缩包是验收冻结点的不可变快照，最终结果README/报告在其后归档；已逐文件核对冻结内容与原仓/冷副本匹配，产品源码、依赖和契约一致。三仓OpenAPI1.51.1/143操作和24迁移保持；本轮未修改业务API/数据库，未重跑上一轮845数据库测试。只验证独立安装/构建/导出，不计生产监听、浏览器/设备、真实模型/存储、Kafka/容器或远程CI；CI源码归档/上传仅本地配置。Windows Kafka AccessDenied未解决，35秒用例未运行；D-49/D-50/D-09待决，父目录遗留依赖清理与先前服务启动拒绝未重试，Docker未启动/重启/借用WSL，整体目标未完成。
