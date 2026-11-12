# 独立构建与生产浏览器待验步骤

后续工程变更：已启用[standalone发布包](standalone-release.md)，当前标准start命令运行各自.next/release/start.mjs。下方next start只记录旧阶段方式，当前复现应在build后设置HOSTNAME=127.0.0.1与对应PORT，再使用pnpm start:web/start:admin。本轮只验证构建与文件/依赖，不执行生产监听；此前审批拒绝仍有效。

2026-11-02 后端停机生命周期续阶段，本仓业务未变，冻结安装、完整check1459项和两个生产构建通过（均缓存命中）。首次并行检查Windows退出3221226505，随后复验明确V8 Zone内存不足；保留日志shutdown-check*.log。使用安装版本Vitest4.1.2支持的`$env:VITEST_MAX_WORKERS='1'`后运行同一`pnpm check`通过，没有跳过测试或更改校验；`pnpm build`通过。该环境变量只控制当前终端测试并发，可在低内存环境使用，完成后按需`Remove-Item Env:VITEST_MAX_WORKERS`。其他项目进程未停止，仍未重试此前遭拒绝的Next启动。以下独立副本及浏览器边界保持。

2026-11-02，本仓在不含原 node_modules、.next、.turbo 和 .env 的独立源码副本中，使用独立新 store 完成冻结安装、完整 check 1459 项、官网/Admin 两个生产构建。两次 build 均 cache miss、0 cached，Next.js 16.3.5。副本只使用本仓内部 workspace，不依赖父目录或其他仓库代码。

## 当前验收边界

本轮两个本地 Next start 命令被自动审批审查拒绝，仅返回“blocked by policy”，未说明具体原因；没有绕行执行。因此本轮没有生产页面启动、浏览器操作、截图或视觉检查结果。

已新增 [4 场景验收脚本](../../scripts/independent-start-browser.ts)及 `pnpm test:independent-browser`，纳入浏览器脚本 tsconfig 并通过类型检查。其运行结果仍待验，不能计入已通过的 1459 项。脚本不 Mock HTTP 或替代业务 API，场景为公开空数据/390px 首页、匿名后台跳转、管理员 Cookie 登录/汇总/账号/刷新恢复/CSRF退出，以及普通账号注册后的 UI/API 双重拒绝。

## 独立复现

按本仓 [README](../../README.md) 安装 Node/pnpm；准备自己的一次性 Backend，数据库必须为 `linji_isolated_validation`。Backend 使用合成 `isolated_` 前缀管理员，允许下面两个 Origin。此脚本会注册测试账号，需要销毁一次性数据库清理，不能指向已有业务环境。

```powershell
pnpm install --frozen-lockfile --store-dir D:/linji-validation-store/web
$env:NEXT_PUBLIC_WEB_API_BASE_URL='http://localhost:62410/api/v1'
$env:NEXT_PUBLIC_ADMIN_API_BASE_URL='http://localhost:62410/api/v1'
pnpm check
pnpm build
```

API 地址必须在构建时设置，启动环境不能重写已经进入浏览器包的 NEXT_PUBLIC 值。以下为旧阶段的待执行命令记录，不是本轮执行证据；当前入口使用上方standalone说明：

```powershell
pnpm --filter @common/web exec next start --hostname 127.0.0.1 --port 62400
pnpm --filter @common/admin exec next start --hostname 127.0.0.1 --port 62401
```

服务就绪后，在本仓根目录运行；三个 URL 统一使用 localhost，避免 Cookie 因主机名不一致而跨站。Cookie 保持 Secure，不为测试关闭安全属性。本仓使用已有 Playwright；本机须有配套 Chromium，或显式配置 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH。

```powershell
$env:ISOLATED_WEB_ORIGIN='http://localhost:62400'
$env:ISOLATED_ADMIN_ORIGIN='http://localhost:62401'
$env:ISOLATED_API_BASE_URL='http://localhost:62410/api/v1'
$env:ISOLATED_DATABASE_NAME='linji_isolated_validation'
$env:ISOLATED_ADMIN_ACCOUNT='isolated_admin'
$env:ISOLATED_ADMIN_PASSWORD='<合成管理员测试密码>'
pnpm test:independent-browser
```

运行时服务地址限回环并要求专用数据库确认标记；脚本不能从 HTTP 独立证明 Backend 的 DATABASE_URL，执行者必须核对该服务确实连接新建测试库。结果和截图应位于本仓忽略的 test-results/independent-start，而非源码或线上环境。

本轮产品代码、依赖、OpenAPI 未修改。新 package script、脚本和 tsconfig 已同步隔离副本复查。原始安装/完整检查/构建日志为本地忽略文件 `isolated-start-*.log`；远程 CI、部署和其他页面端到端验收仍待完成。
