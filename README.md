# 凛迹雪客 · skiing-web

凛迹雪客的服务官网与桌面管理端。一个 pnpm workspace 中包含两个独立 Next.js 应用，分别启动、构建和发布，共用无业务基础包；所有业务数据与权限来自 [skiing-backend](https://github.com/LichCarlos/skiing-backend)。移动应用见 [skiing-app](https://github.com/LichCarlos/skiing-app)。

在线入口：[官网](https://lichcarlos.top/snow) · [个人中心](https://lichcarlos.top/snow/me) · [管理端](https://lichcarlos.top/snow-admin/login)。后台需使用获授权账号。

## 项目能做什么

- 官网：雪场目录、知识文章、社区动态、收藏、个人中心、单框富文本写作及 AI 流式对话。
- 管理端：雪场/文章/知识/社区审核、资产、用户/角色/权限、商家与收益、系统配置、AI/RAG 运行管理。
- 字典与字段：React Flow 关系图、树节点、拖拽创建、上下文表单和填写规则；导航按权限与商家绑定显示。
- 视觉：新粗野主义官网、肤色内容背景、AI 对话视窗；管理端以桌面交互为目标。

## 当前版本与验证边界

2026-11-12：官网、管理端与 API 已部署“每篇内容不限制图片张数”的更新，保留单图大小、格式、归属、扫描及内容长度校验。官网 484 项、管理端 2752 项业务测试及 Linux 构建通过；150 张图片浏览器交互与隔离数据库链路已验证。详见[图片更新记录](docs/engineering/article-images-20261112.md)。App 源码同步，未为此更新重打 APK。

当前 OpenAPI **1.55.0**；快照摘要以 `contracts/openapi.lock.json` 为准。历史文档的测试数、待办和“未部署”描述属于当时阶段，不能覆盖当前说明。GitHub 首次推送后的远程 CI 状态须以 Actions 为准。

## 从哪里开始

| 目标                          | 教程                                              |
| ----------------------------- | ------------------------------------------------- |
| 了解三仓架构与学习顺序        | [技术学习路线](docs/guide/learning-roadmap.md)    |
| 安装、启动、开发与调试        | [本地开发教程](docs/guide/development.md)         |
| Linux 构建、Nginx、更新与回滚 | [部署教程](docs/guide/deployment.md)              |
| GitHub 管理、SDK 排除与凭证   | [仓库安全管理](docs/guide/repository-security.md) |
| 查阅业务实现与历次验收        | [文档索引](docs/README.md)                        |

## 技术栈与目录

Next.js **16.3.5**、React **19.2.8**、TypeScript **5.9.3**、Ant Design **6.6.5**、React Flow **12.12.1**、Tiptap **3.33.0**、Tailwind CSS **4**、CSS Modules、Vitest、Playwright、Turbo。精确依赖见各 package.json 与锁文件。

```text
apps/web/                 官网（默认 3000）
apps/admin/               管理端（默认 3001）
packages/api-contracts/   OpenAPI 类型和公共 HTTP 基础
packages/config/          地址读取与校验
packages/ui/              无业务 UI / Markdown 展示
packages/theme/           主题与 token
packages/utils/           纯展示工具
tooling/                  共享 ESLint / TS 配置
contracts/                OpenAPI 快照与摘要锁
scripts/                  边界、打包、验证与浏览器工具
docs/                     教程、架构、工程记录和验收
```

应用之间不互相导入业务。公共包使用 `@common/*` 及显式 exports；请求、会话和权限放在本端 `src/platform`，业务放 `src/features`。完整边界见 [architecture](docs/init/architecture.md) 与 [ownership](docs/init/ownership.md)。

## 快速开始

需要 Node.js **22.16.0 或兼容的更新 22.x**（最低 22.14.0）、pnpm **11.19.0**。在独立目录执行，不在三个仓库的共同父目录安装依赖。

```bash
git clone https://github.com/LichCarlos/skiing-web.git
cd skiing-web
npm install --global pnpm@11.19.0
pnpm install --frozen-lockfile
```

复制 `.env.example` 为本仓根目录 `.env`（PowerShell：`Copy-Item .env.example .env`；Bash：`cp .env.example .env`）。本地使用：

```dotenv
NEXT_PUBLIC_WEB_API_BASE_URL=http://localhost:8080/api/v1
NEXT_PUBLIC_ADMIN_API_BASE_URL=http://localhost:8080/api/v1
NEXT_PUBLIC_WEB_SITE_ORIGIN=http://localhost:3000
NEXT_PUBLIC_WEB_BASE_PATH=
NEXT_PUBLIC_ADMIN_BASE_PATH=
```

先按后端教程准备 API，并将 `http://localhost:3000,http://localhost:3001` 加入后端 `WEB_ORIGINS`。

```bash
pnpm dev:web
# 另一个终端，在同一仓库根执行
pnpm dev:admin
```

访问 [官网本地入口](http://localhost:3000) 和 [管理端本地入口](http://localhost:3001)。管理员由后端初次 seed 创建，前端没有内置通用管理员密码。生产配置带 `/snow` 与 `/snow-admin` 前缀时，不要将本地根路径与生产路径混用。

## 常用检查与构建

| 命令                                                        | 用途                                                     |
| ----------------------------------------------------------- | -------------------------------------------------------- |
| `pnpm check`                                                | 契约、依赖边界、lint、类型、业务/打包/源码工具与格式检查 |
| `pnpm test:boundaries`                                      | workspace 边界检查器自身测试                             |
| `pnpm exec vitest run --config apps/web/vitest.config.ts`   | 官网业务测试                                             |
| `pnpm exec vitest run --config apps/admin/vitest.config.ts` | 管理端业务测试                                           |
| `pnpm build:web` / `pnpm build:admin`                       | 分别构建并生成 standalone 包                             |
| `pnpm start:web` / `pnpm start:admin`                       | 启动已构建的本端发布包                                   |
| `pnpm openapi:verify` / `pnpm openapi:generate`             | 校验契约 / 生成类型                                      |
| `pnpm source:export <新目录>`                               | 生成脱离开发机的源码交付副本                             |
| `node scripts/check-repository.mjs`                         | 检查已暂存/跟踪文件的公开边界                            |

生产 Linux 必须在 Linux 的匹配架构构建，不能上传 Windows node_modules。API 地址和 basePath 在构建时固化，改运行时环境变量不能替换旧浏览器包中的地址。详见[部署步骤](docs/guide/deployment.md)。

## 权限、内容与 AI

登录会话经本端 platform 层管理，浏览器使用 Cookie/CSRF，不把 access/refresh token 存入 localStorage。前端决定可见入口，后端验证每个请求的权限和数据范围。文章/知识管理与用户动态是不同发布流程，详见[字典与字段使用说明](docs/engineering/dictionaries-and-fields-guide.md)。

Web AI 入口在个人中心，支持历史、新建、连续提问、SSE、站内引用及错误重试。Chat/Embedding Key 只配置于后端。服务上线不代表真机、容量、全量语料和灾备全部验收。

## GitHub 与历史

`origin` 对应本仓库；`upstream` 保留初始 Next 模板来源。源码、锁文件与测试进入 Git；SDK、依赖、真实配置、签名、安装包、模型和备份留在仓库外。CI 执行检查和构建，不自动部署生产。详见[安全管理](docs/guide/repository-security.md)。

此前滚动 README 已归档为[首次公开推送前记录](docs/history/readme-before-publication-20261112.md)，便于追溯阶段结论。
