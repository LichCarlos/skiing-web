# 当前项目完整目录与阅读指南

本文件按当前项目的实际目录整理，树中的 `project-root/` 表示项目根目录；目前 `docs/` 下只有 `init/` 分类。树中逐项列出手写源码、配置和文档；省略 `node_modules/`、`.next/`、`.turbo/`、`tsconfig.tsbuildinfo`、Next 自动生成的 `next-env.d.ts` 以及仅用于保留空目录的 `.gitkeep`。标为“预留”的目录目前只有 `.gitkeep`，不代表功能已经实现。根 `.env` 是本机配置文件，此处只说明作用，不展示其内容。项目当前没有 `.git` 目录。

```text
project-root/
├── AGENTS.md                           # 本项目协作边界：仅本地开发；应用和公共包职责
├── README.md                           # 项目入口：安装、命令、使用教程、全部文档索引
├── .editorconfig                       # 基本编辑器缩进、换行约定
├── .env                                # 本地环境变量配置
├── .env.example                        # 根环境变量示例与字段说明
├── .gitignore                          # 忽略本地配置、依赖和构建产物
├── .nvmrc                              # Node.js 主版本
├── .prettierignore                     # Prettier 的产物与非源码排除项
├── .prettierrc.json                    # 根目录最小 Prettier 配置
├── package.json                        # 根命令、包管理器及基础开发依赖
├── pnpm-lock.yaml                      # 工作空间唯一依赖锁文件
├── pnpm-workspace.yaml                 # apps、packages、tooling 范围和安装策略
├── turbo.json                          # dev/build/lint/typecheck 任务及环境缓存输入
│
├── apps/                                # 每个目录是可独立构建和部署的 Next.js 应用
│   ├── web/                             # 用户端；@common/web
│   │   ├── .prettierrc.json             # 本端格式选项扩展入口
│   │   ├── components.json              # 本端 shadcn/ui 生成目标及导入别名
│   │   ├── eslint.config.mjs            # 本端 ESLint 入口；可按应用扩展规则
│   │   ├── next.config.ts               # typedRoutes、公共包转译、Turbopack 根目录
│   │   ├── package.json                 # 本端依赖与 dev/build/start/lint/typecheck 命令
│   │   ├── postcss.config.mjs           # Tailwind CSS 4 的 PostCSS 插件
│   │   ├── tsconfig.json                # @/* 指向本端 src/*；继承公共 Next 配置
│   │   ├── public/                      # 本端静态资源，当前预留
│   │   └── src/
│   │       ├── app/                     # App Router 的页面入口
│   │       │   ├── layout.tsx           # HTML 根布局、公共样式、本端主题 CSS 变量
│   │       │   ├── page.tsx             # / 首页；展示公共组件和分步教程
│   │       │   └── foundation/
│   │       │       └── page.tsx         # /foundation 样式、控件和路由预览
│   │       ├── components/              # 仅用户端使用的组件，当前预留
│   │       ├── config/
│   │       │   ├── routes.ts            # 合并公共基础路径和本端功能域路径
│   │       │   └── theme.ts             # 用户端主题；当前沿用公共默认值
│   │       ├── features/                # 用户端功能域；其余功能按需新增
│   │       │   └── foundation/
│   │       │       ├── routes.ts        # /foundation 路径定义
│   │       │       └── usage-steps.tsx  # 首页后续步骤的教程组件
│   │       ├── hooks/                   # 用户端 hooks，当前预留
│   │       ├── platform/                # 用户端接入层集中位置
│   │       │   ├── auth/                # 登录凭证与会话，当前预留
│   │       │   ├── config/
│   │       │   │   └── index.ts         # 从公共配置取得用户端 API 基址
│   │       │   ├── errors/              # 错误映射与呈现，当前预留
│   │       │   ├── permissions/         # 用户端权限规则，当前预留
│   │       │   └── request/             # 请求客户端，当前预留
│   │       ├── stores/                  # 用户端 Zustand 状态，当前预留
│   │       └── styles/
│   │           ├── aliases.css         # --app-* 用户端样式别名
│   │           ├── globals.css         # 引入公共 CSS 和本端样式别名
│   │           └── page.module.css     # 首页和预览页的局部布局样式
│   │
│   └── admin/                           # 管理端；@common/admin；独立于 web
│       ├── .prettierrc.json             # 本端格式选项扩展入口
│       ├── components.json              # 本端 shadcn/ui 生成目标及导入别名
│       ├── eslint.config.mjs            # 本端 ESLint 入口；可按应用扩展规则
│       ├── next.config.ts               # typedRoutes、公共包转译、Turbopack 根目录
│       ├── package.json                 # 本端依赖；额外包含 Ant Design 6 集成依赖
│       ├── postcss.config.mjs           # Tailwind CSS 4 的 PostCSS 插件
│       ├── tsconfig.json                # @/* 指向管理端自己的 src/*
│       ├── public/                      # 管理端静态资源，当前预留
│       └── src/
│           ├── app/
│           │   ├── layout.tsx           # 根布局、公共样式、主题、AntD 样式注册
│           │   ├── page.tsx             # / 首页；公共组件教程和 AntD 示例
│           │   └── foundation/
│           │       └── page.tsx         # /foundation 样式与 AntD 组件预览
│           ├── components/
│           │   ├── antd-preview.tsx     # AntD 6 控件、消息与弹窗示例
│           │   └── providers.tsx        # AntD ConfigProvider 主题映射
│           ├── config/
│           │   ├── routes.ts            # 管理端基础路径与功能域路径聚合
│           │   └── theme.ts             # 管理端对公共主题的覆盖
│           ├── features/
│           │   └── foundation/
│           │       ├── routes.ts        # /foundation 路径定义
│           │       └── usage-steps.tsx  # 管理端首页分步教程
│           ├── hooks/                   # 管理端 hooks，当前预留
│           ├── platform/
│           │   ├── auth/                # 管理端登录与会话，当前预留
│           │   ├── config/
│           │   │   └── index.ts         # 从公共配置取得管理端 API 基址
│           │   ├── errors/              # 管理端错误处理，当前预留
│           │   ├── permissions/         # 管理端权限规则，当前预留
│           │   └── request/             # 管理端请求客户端，当前预留
│           ├── stores/                  # 管理端 Zustand 状态，当前预留
│           └── styles/
│               ├── aliases.css         # --app-* 管理端样式别名
│               ├── globals.css         # 公共 CSS 和管理端样式入口
│               └── page.module.css     # 管理端页面局部布局样式
│
├── packages/                            # 仅放可以被多个应用复用的无业务基础能力
│   ├── ui/                              # @common/ui；公共组件与样式
│   │   ├── components.json              # 公共 shadcn/ui 组件生成配置
│   │   ├── eslint.config.mjs            # 本包 ESLint 基础解析入口
│   │   ├── package.json                 # 公共组件及 CSS 的显式 exports
│   │   ├── tsconfig.json                # 公共 UI 包类型检查配置
│   │   └── src/
│   │       ├── index.ts                # Button、SharedNotice、StyleFoundation 统一出口
│   │       ├── components/
│   │       │   ├── button.tsx           # 公共基础按钮
│   │       │   ├── shared-notice.tsx    # 公共公告；只渲染传入内容
│   │       │   └── style-foundation.tsx # 无业务样式和原生控件预览
│   │       ├── lib/
│   │       │   └── utils.ts             # cn：合并组件 className
│   │       └── styles/
│   │           ├── aliases.css         # 公共语义 CSS 变量及 Tailwind 映射
│   │           ├── globals.css         # @common/ui/styles 唯一 CSS 出口与层顺序
│   │           └── reset.css           # 浏览器默认样式的基础统一处理
│   ├── theme/                           # @common/theme；设计 token
│   │   ├── eslint.config.mjs            # 本包 ESLint 入口
│   │   ├── package.json                 # 主题包的公开出口及依赖
│   │   ├── tsconfig.json                # 主题包类型检查配置
│   │   └── src/
│   │       └── index.ts                # 默认 token、覆盖合并、CSS 变量转换
│   ├── config/                          # @common/config；环境地址与基础路由
│   │   ├── eslint.config.mjs            # 本包 ESLint 入口
│   │   ├── package.json                 # ./public、./server、./routes 显式出口
│   │   ├── tsconfig.json                # 配置包类型检查配置
│   │   └── src/
│   │       ├── public.ts               # Web/Admin 的公开 API 基址读取
│   │       ├── routes.ts               # 所有端都有的 / 基础路径名称
│   │       ├── server.ts               # server-only 服务端配置扩展位置
│   │       └── url.ts                  # 包内 HTTP(S) 基址校验，不对外导出
│   └── utils/                           # @common/utils；纯展示格式化
│       ├── eslint.config.mjs            # 本包 ESLint 入口
│       ├── package.json                 # 工具包公开出口及依赖
│       ├── tsconfig.json                # 工具包类型检查配置
│       └── src/
│           └── index.ts                # formatNumber、formatDate
│
├── tooling/                             # 被各 workspace 继承的最小开发配置
│   ├── eslint-config/                   # @common/eslint-config
│   │   ├── base.mjs                     # JS/TS/TSX 语法解析与生成目录排除
│   │   └── package.json                 # ESLint 配置包依赖和公开出口
│   └── typescript-config/               # @common/typescript-config
│       ├── base.json                    # 严格 TypeScript 基础编译选项
│       ├── next.json                    # 两端继承的 Next.js 编译选项
│       └── package.json                 # 两份 TS 配置的公开出口
│
├── scripts/
│   ├── run.mjs                          # 加载根 .env 后执行 Turbo 任务
│   ├── check-boundaries.mjs             # 检查 workspace 依赖与跨包导入边界
│   └── check-boundaries.test.mjs        # 导入边界检查器的回归测试
├── skills/
│   └── README.md                        # 项目技能目录说明；当前没有预装技能
└── docs/
    └── init/
        ├── add-app.md                  # 新增独立应用的步骤
        ├── aliases-and-routes.md       # import、CSS、路由别名及 reset 约定
        ├── architecture.md             # 应用、公共包、状态与服务端边界
        ├── code-quality.md             # 最小 ESLint/Prettier 与应用扩展方式
        ├── dependency-maintenance.md   # 锁定依赖、升级和 peer 兼容性处理
        ├── environment.md              # 根环境变量、公开/服务端边界
        ├── file-tree.md                # 当前这份逐文件目录与阅读指南
        ├── gaps-and-decisions.md       # 尚未实现的能力与接入位置
        ├── import-boundaries.md        # 跨包、本端、包内导入规则与教程
        ├── ownership.md                # 模板与应用的扩展边界
        ├── project-review.md           # 当前架构能力与源码入口
        ├── theming.md                  # 默认主题、本端覆盖与组件使用
        └── validation.md               # 已执行验证及其范围
```

## 从哪里开始读

1. **第一次运行：**先读 `README.md`，再看 `package.json` 和 `.env.example`。根命令通过 `scripts/run.mjs` 加载根环境文件，然后调用 Turbo。`pnpm dev:web` 与 `pnpm dev:admin` 分别运行两个应用。
2. **理解应用隔离：**读 `docs/init/architecture.md` 与对应端的 `src/app/layout.tsx`。每端拥有自己的 `app/`、主题、路由和接入层；管理端额外装配 Ant Design 6。
3. **开发页面：**在所属端的 `src/features/<功能域>/` 放功能代码，在该域的 `routes.ts` 定义路径，再经本端 `src/config/routes.ts` 聚合；真实页面放所属端 `src/app/`。应用内部通过 `@/` 引用自己的 `src/`。
4. **复用基础能力：**读 `docs/init/import-boundaries.md`。两端首页均通过 `import { Button, SharedNotice } from "@common/ui"` 使用 `packages/ui/src/components/` 中的同一份公共组件；新增公开组件时更新 `packages/ui/src/index.ts`。公共包内部使用相对路径。
5. **改主题或样式：**读 `docs/init/theming.md` 与 `docs/init/aliases-and-routes.md`。共享默认 token 在 `packages/theme/src/index.ts`，单端覆盖在 `apps/<端>/src/config/theme.ts`；公共 reset 与语义别名在 `packages/ui/src/styles/`，单端 `--app-*` 在自己的 `src/styles/aliases.css`。
6. **接入真实业务：**读 `docs/init/environment.md`、`docs/init/ownership.md` 和 `docs/init/gaps-and-decisions.md`。`platform/config/index.ts` 已为各端接好地址读取；`request/`、`auth/`、`permissions/`、`errors/` 与 `stores/` 仍是预留位置，协议和规则在对应应用中实现。

跨 workspace 只通过 `@common/*` 包名及该包 `package.json` 的公开 `exports` 引用；每个使用方在自己的 `package.json` 声明 `workspace:*`。`@common/*` 是当前工作空间包的实际命名前缀，导入时仍须以包的公开 `exports` 为准。
