# 代码检查与格式化

模板只接入 ESLint 与 Prettier 的基础能力，具体规则由对应应用或公共包按需扩展。

## 当前基础

- ESLint 10.11.0：JavaScript / JSX 语法解析；TypeScript / TSX 通过 @typescript-eslint/parser 8.71.0 解析。公共入口为 tooling/eslint-config/base.mjs。
- 不启用 ESLint、Next、React、TypeScript 的推荐规则集，不预设命名、导入排序、复杂度、Hooks、可访问性或业务规则。
- 各端及各公共包的 eslint.config.mjs 引入基础解析配置，再提供空的 rules 对象供当前 workspace 扩展。产物目录和 next-env.d.ts 被忽略。
- Prettier 3.9.9 使用默认配置；根与两个应用的 .prettierrc.json 均为 `{}`。没有额外格式化插件或 ESLint-Prettier 集成插件。
- .editorconfig 只保留 UTF-8、LF 和文件末尾换行，不规定额外缩进风格。

因此当前 lint 通过只代表受检文件能够被解析，并不代表已完成 React Hooks、业务质量或可访问性检查。TypeScript 类型检查和既有依赖边界检查独立保留。

## 如何按应用扩展

在本端 eslint.config.mjs 中维护自己的规则，例如：

```js
import base from "@common/eslint-config";

export default [
  ...base,
  {
    rules: {
      // 按应用需求填写
    },
  },
];
```

需要 React、Next 等插件时，在当前 workspace 声明依赖并核对与 ESLint 10 的 peer 兼容范围，再引入配置。不要直接修改公共解析配置来推行单端规则。

各端在自己的 .prettierrc.json 中填写格式选项，公共包可新增自己的同名文件。Prettier 使用距离目标文件最近的配置，子配置不会自动合并根配置；未配置的选项采用 Prettier 默认值。当前所有配置均为空，无额外格式选项。

## 运行命令

```sh
pnpm lint
pnpm format:check
pnpm format
pnpm --filter @common/admin lint
pnpm exec prettier --check apps/admin
```

根 format / format:check 会分别读取各文件所属的最近配置。模板不安装 Git hooks、不配置远程 CI，也不预设 warning 阻断规则。

参考：[ESLint parser 配置](https://eslint.org/docs/latest/use/configure/parser)、[Prettier 配置](https://prettier.io/docs/configuration)。
