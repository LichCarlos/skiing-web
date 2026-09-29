# 依赖维护与升级

项目使用唯一 `pnpm-lock.yaml` 锁定工作空间依赖。根 `package.json` 要求 Node.js 22.14+、pnpm 11.19.0；两个应用使用相同的 Next.js、React 与 React DOM 版本。

## 当前依赖基线

| 依赖                          | 固定版本        | 使用位置           |
| ----------------------------- | --------------- | ------------------ |
| Next.js                       | 16.3.5          | Web、Admin         |
| React / React DOM             | 19.2.8          | Web、Admin         |
| Tailwind CSS                  | 4.3.3           | Web、Admin         |
| shadcn CLI                    | 4.21.0          | 两端组件生成配置   |
| Ant Design                    | 6.6.5           | Admin              |
| Zustand                       | 5.0.15          | 两端预留状态能力   |
| `@ant-design/nextjs-registry` | 1.3.0           | Admin SSR 样式注册 |
| `@ant-design/cssinjs`         | 2.1.2           | Admin 样式引擎     |
| ESLint / Prettier             | 10.11.0 / 3.9.9 | 基础检查与格式化   |

`@common/ui` 的组件源码保存在仓库内，不依赖单独发布的构建产物。当前基础 UI 使用 shadcn/ui 与 Ant Design 6，其他组件按实际需求添加。

## 安装与升级

- 在项目根执行 `pnpm install --frozen-lockfile`。内部依赖使用 `workspace:*`，新增外部直接依赖固定具体版本。
- `pnpm-workspace.yaml` 开启 `strictPeerDependencies`、关闭 `autoInstallPeers`。遇到不兼容的 peer，应选择兼容版本并验证，而不是关闭检查。
- 新增或升级依赖时，核对其 peerDependencies、官方迁移说明和当前使用的 API；同步更新 manifest 与锁文件。
- 管理端升级 AntD 相关依赖时，检查首屏 SSR 样式、主题覆盖、表单、弹窗和反馈消息。
- 公共包变更需验证所有消费者；应用依赖变更至少验证对应应用。运行 `typecheck` 或 `build` 前先停止同一应用的开发服务。

更新后可在项目根执行：

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm why -r antd
pnpm why -r @ant-design/cssinjs
```

`pnpm check` 的 ESLint 部分目前只做语法解析；具体规则见 [代码检查与格式化](code-quality.md)。检查结果记录到 [验证范围](validation.md)。
