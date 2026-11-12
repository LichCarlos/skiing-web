# 官网与管理端独立 Node 发布包

2026-11-03 官网详情分享新增可选构建变量 `NEXT_PUBLIC_WEB_SITE_ORIGIN`，用于生成 canonical/og:url；未配置时省略，必须为实际官网的 HTTP(S) origin。与公开 API 地址一样，在构建前配置，启动时覆盖不能修改已构建产物。见[公开详情说明](public-detail-metadata.md)。当前三仓契约为1.50.2/143操作；下文保留最初发布包阶段的版本记录。

日期：2026-11-02。Next.js 16.3.5、Node 22、pnpm 11.19.0。两端分别生成 standalone 产物，运行时不需要源码、开发依赖、pnpm或其他项目目录；业务数据仍通过 Backend HTTP API。OpenAPI保持1.50.0/143操作。

## 实现与依据

本轮已查阅安装版本 next/dist/docs 的 output、self-hosting 和 environment-variables 文档，应用跟踪根、静态资源补齐及构建变量约定。官方对应说明：[output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)、[self-hosting](https://nextjs.org/docs/app/guides/self-hosting)、[environment variables](https://nextjs.org/docs/app/guides/environment-variables)。版本基线是本地16.3.5，未升级框架。

两个Next配置启用standalone，outputFileTracingRoot限本仓根目录。每个应用build在Next完成后调用TypeScript[打包器](../../scripts/package-standalone.ts)，将跟踪出的运行文件、该应用的static/public、start.mjs及清单写入本应用.next/release。保留pnpm依赖布局，Windows绝对junction映射到已跟踪文件，再改为内部相对链接，不重新收集宿主完整node_modules。

打包拒绝已有目标、源目标重叠、未知应用、另一个应用产物、无法映射的外部链接、环境文件、Git和日志。仓库内目标仅允许本应用.next/release或dist；仓库外使用调用者明确指定的新目录。失败不自动删除目录，部分输出保留，复验选择新目标。目标祖先先解析实际路径，防止链接导致复制回源目录。

release-manifest.json记录应用、Node/Next/平台/架构、Build ID、OpenAPI版本/摘要、文件长度/摘要及链接目标。验证重新计算清单，在实际Next的pnpm依赖上下文解析Next/React/ReactDOM并要求位于包内。清单用于完整性核对，不是数字签名。Turbo把打包器和契约加入构建输入；start任务转发PORT/HOSTNAME/KEEP_ALIVE_TIMEOUT，不再用next start运行standalone配置。

## 独立构建与归档

在Web仓库根目录配置.env或部署环境的公开API地址，然后执行：

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm build:web
pnpm build:admin
pnpm package:web D:/release-20261102/web
pnpm package:admin D:/release-20261102/admin
pnpm release:verify web D:/release-20261102/web
pnpm release:verify admin D:/release-20261102/admin
```

build已分别生成.next/release；package从Next跟踪输出再打包到指定新目录，方便归档，两端无需一起发布。NEXT_PUBLIC地址在构建时固化，修改API地址必须重建；不要向Web构建环境注入数据库、模型凭证、JWT secret或用户密码。环境文件不属于发布包。

Linux生产必须在Linux同架构构建，Windows产物不能用作Linux镜像输入。传输必须保留内部相对符号链接，普通复制/ZIP工具未必满足，复制后须验证。首轮Node Windows cp错误恢复目录链接类型，夹具改为同卷搬移；失败日志保留，不宣称任意归档工具兼容。

[CI](../../.github/workflows/ci.yml)在完整check和双构建后，把两份包分别复制至RUNNER_TEMP，验证、制作保留链接的tar.gz，并上传为两个独立工作流产物。没有推送镜像或部署步骤；远程工作流尚未执行。

## 后续运行条件

以下命令为待执行步骤，本轮未启动生产服务。发布包只需对应平台/架构的Node22，无需安装依赖：

```powershell
$env:HOSTNAME='127.0.0.1'
$env:PORT='3000'
node D:/release-20261102/web/start.mjs
```

管理端另一进程使用PORT=3001和admin/start.mjs。默认官网3000、管理端3001；HOSTNAME未设置时为127.0.0.1。源码模式在build后可使用pnpm start:web/start:admin，它们运行各自.next/release/start.mjs。反向代理/容器显式设置监听地址，避免相同端口并行启动。

仍需HTTPS入口、Backend CORS/可信Origin、Cookie/CSRF及对象存储签名地址，保持已确认的同站不同Origin认证条件。本包不内置Backend代理或数据库；进程管理器直接运行Node并传递SIGTERM。Next可能需要可写缓存，不可直接套用Backend只读文件系统设置。多实例缓存协调、滚动升级/静态资源保留和恢复须另行设计验证。

## 验证与限制

[20项文件系统测试](../../scripts/package-standalone.test.ts)及typecheck:release已纳入check。夹具模拟Next/pnpm和Windows绝对junction，验证两端搬移且源目录改名后仍可解析依赖，以及未知应用、缺少构建/契约不符、环境/日志、内容变化/缺失、平台和目标路径拒绝。夹具server.js会抛错，打包和校验均不执行它。

首轮实际校验错误地从应用层解析React，修正为Next自身的pnpm依赖上下文后通过；失败日志保留。Web冻结安装、完整check（1459项业务测试加20项发布测试）、额外16项边界测试及最终双构建通过，两个构建均0缓存。最终构建缓存放到D盘，避免E盘空间不足；没有清理其他目录。

实际包分别包含Web1356文件/26内部相对链接、Admin1941文件/26链接。D盘首份校验通过后，再将最终构建打包至 `D:/linji-next-standalone/20261102/final/web` 与 `D:/linji-next-standalone/20261102/final/admin`；校验及四个入口语法检查通过，清单与当前.next/release一致。普通文件约19.2/25.6MB，平台win32/x64；结果见standalone-release-日志。

Backend配套冻结安装、完整check（136文件1148单测）、7文件143项HTTP/框架测试及build通过，未复验真实数据库。App冻结安装、完整check（56文件998项）、Doctor20/20及iOS/Android/Web导出通过，产物 `D:/linji-next-standalone/20261102/app-export`，进程退出码0。三端README和共享生命周期记录同步，OpenAPI版本/操作数/摘要保持一致。

本轮仅构建、核对文件/链接/依赖解析和入口语法，未执行start.mjs/server.js或任何生产监听。此前生产启动被自动审批审查拒绝，未绕行；因此真实HTTP/浏览器、OS信号、Linux产物及远程CI仍待验。Docker保持不重启，整体项目尚未完成。
