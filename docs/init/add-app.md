# 新增应用

以下以增加 portal 为例，所有根命令在项目根执行。

1. 复制 `apps/web` 为 `apps/portal`，只复制源码及配置，排除 node_modules、.next、next-env.d.ts、tsbuildinfo 和临时产物。不要直接复制运行中的目录。
2. 修改 package.json 的 name 为 `@common/portal`；dev/start 改用未占用端口，如 3002。公共依赖继续使用 workspace:*。
3. 更新页面元数据、首页文案、src/config/theme.ts 和应用说明；保留独立 src/app 入口。检查本端 config/routes 与 features/<域>/routes，复制的 foundation 路由仍对应真实 page.tsx。检查本端 tsconfig.json 的源码别名仍指向 ./src，不映射到被复制应用的目录。
4. 根 .env.example 新增 NEXT_PUBLIC_PORTAL_API_BASE_URL；公共 config/public.ts 新增具名 getter，静态读取 `process.env.NEXT_PUBLIC_PORTAL_API_BASE_URL` 并调用同目录 validateHttpUrl。本端 platform/config 只引用该 getter。
5. 根 package.json 添加下面的便捷命令。workspace 的 apps/* 和 Turbo 无需逐端枚举，`pnpm dev` 与 `pnpm build` 会自动纳入新应用。

```json
{
  "dev:portal": "node scripts/run.mjs dev --filter=@common/portal",
  "build:portal": "node scripts/run.mjs build --filter=@common/portal...",
  "start:portal": "node scripts/run.mjs start --filter=@common/portal"
}
```

6. 执行 `pnpm install` 更新锁文件，随后 `pnpm check`、`pnpm build:portal`，检查默认主题和本端覆盖均生效。
7. 配置本端 eslint.config.mjs 和 .prettierrc.json（见 [代码检查与格式化](code-quality.md)），并补齐 platform 模块、业务功能与测试/CI/部署配置；可在 docs/portal 记录应用协议，并更新根 README 文档索引和命令表。

若新端需要 Ant Design 6，可参照 admin 的依赖、根样式 Registry 和 Providers 接入；不要引用 admin 的源码。

## 独立构建与部署边界

应用可分别构建，部署仍需包含它依赖的公共包。可以采用完整 workspace 构建上下文、Turbo 裁剪或 Next standalone 等方案。具体容器、平台、健康检查、环境注入、资产复制和回滚策略由应用实现并验证。模板不附带生产部署凭据或默认发布流水线。

应用更新与共享包更新应按真实依赖确定需要重建哪些端；分别部署不代表可以忽略公共组件的兼容性。
