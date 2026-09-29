# 验证范围

以下是当前源码基线已有的验证记录。依赖、公共包或应用入口变化后，应重新运行对应检查；业务功能需要自己的测试。

| 检查                             | 已记录结果          | 范围                                                                      |
| -------------------------------- | ------------------- | ------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | 通过                | 使用根锁文件安装，依赖 peer 检查通过                                      |
| `pnpm check`                     | 通过                | 包边界、ESLint 基础解析、TypeScript 和 Prettier                           |
| `pnpm test:boundaries`           | 16 个用例通过       | 验证跨端、跨包、未声明依赖、别名越界和循环依赖等边界                      |
| `pnpm build`                     | Web 与 Admin 均通过 | 首页、`/foundation` 与默认 404 构建                                       |
| 浏览器检查                       | Chromium 下页面正常 | 两端首页和预览页、共享组件、主题、AntD 样式与交互；375px 下无页面横向溢出 |
| 文档链接                         | 通过                | 本地 Markdown 文件目标存在                                                |

重新验证时，在项目根运行：

```sh
pnpm install --frozen-lockfile
pnpm test:boundaries
pnpm check
pnpm build
```

同一应用的开发服务与 `typecheck`、`build` 不要并行运行，因为 Next.js 会生成路由类型和构建文件。浏览器结果只覆盖已检查的 Chromium 页面；这里没有真实后端、认证、业务流程、Safari/Firefox、真机或部署验证。
