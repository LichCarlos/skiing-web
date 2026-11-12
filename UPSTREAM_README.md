# 前端 Monorepo 基础模板

这是可复制到新项目目录的独立模板，开发约定见 [AGENTS.md](AGENTS.md)。采用 Next.js 16 App Router、React 19、Tailwind CSS 4、shadcn/ui（Base UI）、Ant Design 6、Zustand 5，以及 pnpm Workspace + Turborepo。

模板初期使用 shadcn/ui 基础组件与 Ant Design 6 开发页面。其他组件和业务封装按对应应用的实际需求接入。

模板包含 `web`、`admin` 两个最小应用，支持分别开发、构建和启动。它们只共享基础组件、主题、样式重置、环境配置和纯格式化工具；没有共享业务状态或认证系统。

## 快速开始

复制本目录的源码、文档、锁文件和隐藏配置到新的项目目录，排除 `.env`、`.git`、`node_modules`、`.next`、`.turbo` 和类型检查产物。当前目录是独立的 pnpm workspace，不依赖其他项目。

要求 Node.js 22.14+ 和 pnpm 11.19.0。以下命令均在复制后的项目根执行：

```sh
pnpm install --frozen-lockfile
test -f .env || cp .env.example .env
pnpm dev:web
```

此时用户端运行在 3000。需要管理端时，在另一个终端执行 `pnpm dev:admin`；若只想用一个终端同时启动两端，改为执行 `pnpm dev`，不要与单端命令并行重复启动。已有 `.env` 时上述复制命令会保留它。按需修改根 `.env` 中两端的公开 API 基址；空白页面不会发起真实请求，暂时没有后端也能运行。Web 固定使用 `http://localhost:3000`，Admin 固定使用 `http://localhost:3001`。若端口被占用，先停止冲突的本地服务再启动，并核对启动日志与实际访问地址；不要把 Next 自动切换到其他端口视为演示已就绪。默认页面只演示基础装配，不提供登录或模拟业务成功。

## 后续开发前的准备

开始新功能前，先完成以下确认；模板中的预留目录不代表请求、认证或权限已经实现。

1. 确认功能属于 `apps/web` 还是 `apps/admin`，阅读 [架构说明](docs/init/architecture.md)、[扩展边界](docs/init/ownership.md)和对应端现有页面。页面放本端 `src/app`，功能代码放本端 `src/features`；只有两端都需要的无业务基础能力才进入 `packages`。
2. 按快速开始安装依赖、准备根 `.env`，确认 3000/3001 两端能访问。API 基址只由 `@common/config/public` 读取，经本端 `src/platform/config` 使用；真实环境值、密钥和凭证不写入源码或公开变量。环境边界见 [环境与接入层](docs/init/environment.md)。
3. 接入真实业务前，明确接口契约、认证方式、错误码、权限校验边界及数据类型来源，再在本端 `src/platform/request`、`auth`、`permissions`、`errors` 实现。模板不提供默认请求实例或模拟成功的登录流程。
4. 确认要使用的组件和状态范围：通用基础组件放公共 UI，本端业务组件和 Zustand Store 留在本端；Admin 可使用已接入的 Ant Design 6。当前两端执行 `pnpm --filter @common/web exec shadcn add button --dry-run`（Admin 将 `web` 换成 `admin`）时仍无法解析共享 `ui` 别名；使用 CLI 生成新组件前，需先修复该配置并验证干运行通过。已有公共组件可直接使用，手动新增公共组件时要登记公开 `exports` 并更新根出口。
5. 为功能确定所需的业务测试、运行检查和交付方式。当前 `pnpm check` 只覆盖边界、基础 ESLint 解析、类型与格式；测试、CI、部署和监控由对应应用结合实际场景补齐，见 [扩展清单](docs/init/gaps-and-decisions.md)。

## 后续开发规范

- **引用与依赖：**应用内部统一使用指向本端 `src` 的 `@/`；跨包只用已声明的 `@common/*` 包名和公开出口，内部依赖写 `workspace:*`。公共包内部使用同包相对路径；不得跨应用引用、相对跨包或导入其他包的 `src`。新增外部依赖时先确认用途、peer 兼容性并更新唯一锁文件。详见 [引用规范](docs/init/import-boundaries.md)和[依赖维护](docs/init/dependency-maintenance.md)。
- **页面与样式：**功能域维护自己的路由，由本端 `src/config/routes.ts` 聚合；页面布局使用 CSS Modules。公共 reset、语义色和默认主题在 `packages/ui`、`packages/theme`，本端覆盖放 `src/config/theme.ts` 与 `src/styles/aliases.css`；不把业务样式写入公共层。详见 [别名与路由](docs/init/aliases-and-routes.md)及[主题与组件](docs/init/theming.md)。
- **服务端与状态：**默认保持 Server Component；需要交互或浏览器状态时才声明 `use client`。服务端密钥只经 `@common/config/server` 的具名入口读取，不传给客户端。本端 Zustand Store 不放进公共包，也不在服务端请求之间共享用户状态。
- **验证与文档：**修改本端后运行 `pnpm check` 和 `pnpm build:web` 或 `pnpm build:admin`；修改公共包后运行 `pnpm test:boundaries`、`pnpm check`、`pnpm build` 并查看两端页面。运行类型检查或构建前，先停止同一端的开发服务。业务行为须补充本端测试；新增环境字段、公共出口或应用文档时，同步更新对应说明及本 README 索引。

## 目录与职责

```text
project-root/
├── apps/
│   ├── web/                  # 独立用户端：Next 页面、主题、路由、接入层
│   │   └── src/
│   │       ├── app/          # / 与 /foundation 页面、根布局
│   │       ├── features/     # 本端功能域及域内路由
│   │       ├── config/       # 本端主题覆盖与路由聚合
│   │       ├── components/   # 本端组件扩展位置（当前预留）
│   │       ├── hooks/        # 本端 hooks（当前预留）
│   │       ├── platform/     # 地址装配及请求、认证、权限、错误扩展位置
│   │       ├── stores/       # 本端 Zustand 状态（当前预留）
│   │       └── styles/       # 公共样式入口、本端 CSS 别名及 CSS Modules
│   └── admin/                # 同样的独立入口，额外包含 AntD 6 Provider 与预览
├── packages/
│   ├── ui/                   # 公共 Button/SharedNotice、reset、CSS 语义别名
│   ├── theme/                # 默认设计 token、本端覆盖合并、CSS 变量转换
│   ├── config/               # 环境地址读取、校验及公共基础路由
│   └── utils/                # 无业务依赖的数字/日期展示格式化
├── tooling/                  # 共享 TypeScript 配置与最小 ESLint 解析配置
├── scripts/                  # 环境启动器、引用边界检查及其回归测试
├── docs/
│   └── init/                 # 当前模板的架构、使用、维护与验证文档
├── skills/                   # 项目技能资料，目前只有目录说明
├── .env.example / .env       # 根环境字段示例 / 本机配置
├── package.json              # 根命令及包管理器版本
├── pnpm-workspace.yaml       # 工作空间范围与安装策略
├── pnpm-lock.yaml            # 唯一锁文件
└── turbo.json                # 任务依赖与缓存输入
```

这是入口地图；[当前完整目录与阅读指南](docs/init/file-tree.md)逐项列出两端各自的文件、公共包配置、脚本和文档，并标明尚未实现的占位目录。每端都拥有自己的 `src/app`，可以分别构建和部署；根目录没有单一 `src` 入口。

| 想完成的事                            | 先看哪里                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------- |
| 增加本端页面或功能                    | `apps/<端>/src/app/`、`features/<功能域>/`、`config/routes.ts`            |
| 增加两端共用的基础组件                | `packages/ui/src/components/`、`packages/ui/src/index.ts`                 |
| 修改共享默认主题或本端覆盖            | `packages/theme/src/index.ts`、`apps/<端>/src/config/theme.ts`            |
| 修改公共 reset、样式别名或本端样式    | `packages/ui/src/styles/`、`apps/<端>/src/styles/`                        |
| 接入 API 地址、请求、认证、权限和错误 | 根 `.env.example`、`packages/config/src/`、`apps/<端>/src/platform/`      |
| 修改工程规则                          | `tooling/`、本端 `eslint.config.mjs`、`tsconfig.json`、`.prettierrc.json` |
| 查找全部文档与新增端步骤              | 本 README 的文档索引、`docs/init/file-tree.md`、`docs/init/add-app.md`    |

`platform/request`、`auth`、`permissions`、`errors` 和 `stores` 目前只有目录占位，需按实际协议实现。完整边界见 [架构说明](docs/init/architecture.md)与 [扩展边界](docs/init/ownership.md)。

## 常用命令

所有命令都在项目根目录运行，根脚本会先加载 `.env` 再启动 Turbo。

| 命令                                             | 用途                                       |
| ------------------------------------------------ | ------------------------------------------ |
| `pnpm dev:web` / `pnpm dev:admin`                | 分别运行用户端 / 管理端开发服务            |
| `pnpm dev`                                       | 同时运行两端开发服务                       |
| `pnpm build:web` / `pnpm build:admin`            | 分别构建指定应用及其依赖                   |
| `pnpm build`                                     | 构建全部应用                               |
| `pnpm start:web` / `pnpm start:admin`            | 启动对应应用的生产构建，需先 build         |
| `pnpm check`                                     | 依次执行边界、ESLint、TypeScript、格式检查 |
| `pnpm check:boundaries` / `pnpm test:boundaries` | 检查包引用规范 / 运行检查器回归测试        |
| `pnpm lint` / `pnpm typecheck`                   | 单独运行语法解析检查 / 类型检查            |
| `pnpm format:check` / `pnpm format`              | 检查格式 / 写入格式化结果                  |

当前 ESLint 只提供基础语法解析，各应用可独立补充规则；`pnpm check` 不包含业务测试或 `pnpm test:boundaries`。验证某端时运行 `pnpm check` 和对应的 `pnpm build:<端>`；修改公共包时验证所有受影响应用。按需单独运行 `pnpm test:boundaries` 验证边界检查器。

同一端不要同时运行 dev、build 和 typecheck；Next 会生成类型和构建文件。公共包通过源码 exports 供 Next 转译，无单独 dist 构建步骤。生产发布包必须包含所需 workspace 或通过 standalone 或容器方式打包，不能只拷贝 `apps/web` 或 `apps/admin` 源码。

## 跟着页面学习

1. 按快速开始启动对应端，打开首页；每一步都有真实源码路径和导入示例。
2. 第一步修改公共 SharedNotice 或 Button，查看两个端的变化。
3. 第二步修改当前端 UsageSteps，只影响当前端。
4. 第三步修改公共默认主题或本端覆盖，比较作用范围。
5. 第四步找到根环境变量与本端接入层，第五步查看检查入口并验证。
6. 打开 /foundation 进一步检查公共样式、原生控件与本端主题。

所有页面标注的路径都相对于本项目根目录。完整导入规则、增加公共包的流程见 [引用规范与操作步骤](docs/init/import-boundaries.md)，当前能力核对见 [架构核对](docs/init/project-review.md)。

## 公共能力如何使用

```tsx
import { Button } from "@common/ui";
import { formatNumber } from "@common/utils";
import { createTheme } from "@common/theme";

const theme = createTheme({ primary: "#0f766e" });
const display = formatNumber(12345.67);
```

新增公共组件放 `packages/ui/src/components`，按公开导出路径引用。页面、业务表格、角色规则与业务 Store 留在应用。内部依赖统一写 `workspace:*`；禁止相对路径跨包、`src` 深层导入和应用互相依赖。

主题默认值集中在 `packages/theme/src/index.ts`；各端在 `src/config/theme.ts` 覆盖。覆盖会应用到本端全部页面及共享组件，其他端继续使用自己的主题。管理端将同一 token 映射到 Ant Design ConfigProvider。详见主题文档。

## 样式与路径别名

- 全局 CSS 入口：`@common/ui/styles`；公共语义色如 `--surface` / `bg-surface`、`--action` / `bg-action`。
- 单端 CSS：`src/styles/aliases.css` 中的 `--app-*`；页面通过 `@/styles/page.module.css` 引入局部样式。
- 公共页面名称：`@common/config/routes`；本端聚合入口：`@/config/routes`；功能域路径：`@/features/<域>/routes`。
- 应用内部统一使用 `@/* → ./src/*`，包括 components、config、features、platform、styles 等目录；公共包内部使用相对路径。
- 两端访问 `/foundation` 预览样式与路由；首页已有入口。默认端口为 Web 3000、Admin 3001。

详见 [别名与路由](docs/init/aliases-and-routes.md)。本地开发服务运行时不要同时构建或生成该应用的路由类型。

## 全部文档索引

| 文档                                                 | 作用与使用时机                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| [README.md](README.md)                               | 项目总入口、安装运行、后续开发准备与规范、目录和文档索引           |
| [AGENTS.md](AGENTS.md)                               | 开发人员及 Agent 的依赖、配置与业务边界约定                        |
| [架构说明](docs/init/architecture.md)                | 理解应用隔离、共享包职责、服务端/客户端与状态边界                  |
| [主题与组件](docs/init/theming.md)                   | 修改共享主题、本端覆盖和组件样式                                   |
| [环境与接入层](docs/init/environment.md)             | 配置根 .env、公开/服务端变量、地址与接入目录分工                   |
| [新增应用](docs/init/add-app.md)                     | 复制最小应用、改名、配置端口、环境、主题和运行命令                 |
| [扩展边界](docs/init/ownership.md)                   | 公共包与应用各自的实现位置和职责                                   |
| [引用规范与操作步骤](docs/init/import-boundaries.md) | 跨包包名、包内相对路径、本端 @/ 和新增出口的逐步教程               |
| [架构核对](docs/init/project-review.md)              | 已实现的工程能力及对应源码入口                                     |
| [代码检查与格式化](docs/init/code-quality.md)        | ESLint / Prettier 基础接入及应用扩展入口                           |
| [依赖维护](docs/init/dependency-maintenance.md)      | 固定版本、peer 兼容检查与升级验证                                  |
| [验证范围](docs/init/validation.md)                  | 已记录的检查结果、复查命令及未覆盖范围                             |
| [别名与路由](docs/init/aliases-and-routes.md)        | 公共/本端样式、import 别名、类型安全页面路由和浏览器 reset         |
| [当前完整目录](docs/init/file-tree.md)               | 逐文件查看两端、公共包、配置、脚本与预留目录，并按任务定位修改入口 |
| [扩展清单](docs/init/gaps-and-decisions.md)          | 查看尚未实现的能力及其接入位置                                     |
| [共享 Skills](skills/README.md)                      | 项目技能资料的目录规则与使用方式                                   |

当前架构说明集中在 `docs/init/`。新增或移动文档时同步本索引；应用专属文档可放在 `docs/<应用名>/`。

## 已实现与扩展位置

已实现的是可运行的前端基础架构，包含最小装配页和工程静态检查。没有预设后端响应格式、Token/Cookie 协议、权限模型、重试规则或全局业务 Store。真实业务页面、测试、CI、部署与监控需按应用需求补充；当前项目未连接真实后端。
