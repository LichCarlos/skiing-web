# 主题与组件

## 共享默认主题与本端覆盖

1. 共享默认值：`packages/theme/src/index.ts` 的 defaultTheme。
2. 应用覆盖：`apps/<端>/src/config/theme.ts` 调用 createTheme。
3. 根 layout 在 html 上注入 CSS 变量，SSR 首次输出即包含正确主题。
4. Tailwind 语义色由公共 globals.css 的 `@theme inline` 映射，CSS Modules 同样使用这些变量。
5. Admin Providers 将相同 appTheme 映射到 Ant Design token，弹层位于 body 下也继承本端主题。

```ts
import { createTheme } from "@common/theme";
export const appTheme = createTheme({ primary: "#0f766e", radius: 6 });
```

Admin 默认覆盖为紫色，用于直观看到单端覆盖；Web 使用默认蓝色。修改共享默认值影响未覆盖的端；修改本端配置只影响本端。设置主色时同时检查 primaryForeground 的文字对比度。模板不自动生成深色主题或颜色算法。

## 样式边界

公共 globals.css 引入 Tailwind Preflight，统一浏览器默认样式。每端根布局只引入本端 styles/globals.css 一次。该入口显式扫描公共 UI 的 Tailwind 类，避免开发时出现类名但生产 CSS 缺失。

全局只放 reset、主题和必要基础规则；页面布局及局部覆盖用 `.module.css`。使用 `bg-primary`、`text-foreground` 等语义类，避免组件硬编码品牌色。Ant Design 组件优先通过 ConfigProvider token/components 覆盖，避免全局选择器直接改内部 DOM。

两套 UI 的职责保持清楚：通用轻量组件放共享 UI；管理端表格和表单使用 AntD 6，业务封装留在 Admin。其他组件按实际页面需要添加。共享 UI 不依赖 antd，因此 Web 不被迫加载后台组件库。

## 增加 shadcn/ui 组件

两端与 packages/ui 都包含匹配的 components.json。在应用目录运行已固定的 CLI：

```sh
cd apps/web
pnpm exec shadcn add input
```

CLI 按别名将基础组件放入公共 UI，业务 block 放入当前应用。执行后检查修改的依赖、样式 token 和源码；本模板的主题唯一来源是 theme 包，如 CLI 添加新的颜色变量，将其同步纳入 theme 的类型与 CSS 映射，避免产生另一套品牌默认值。新增组件或 hooks 后，在公共包 exports 显式登记所需出口，并将组件重导出到 src/index.ts。CLI 生成的包内自引用应改为相对路径，应用引用改为 @common/ui 根入口，然后执行边界检查。不要使用通配符将整个源码目录自动公开。

导入示例：`import { Button } from "@common/ui"`。本端需有额外语义时在本端 components 包装它，公共组件不读取本端 Store 或权限。

公共调整后执行 `pnpm check` 和两端构建，并检查实际页面、响应式和可访问性。共享 token 只覆盖模板映射的基础项；新组件额外的语义 token 需随组件补齐。

## 样式与路由别名补充

全局入口现在使用 `@common/ui/styles`。公共语义名称、各端 `--app-*` 覆盖、层叠顺序和源码别名见 [样式与路由别名](aliases-and-routes.md)。页面布局示例位于各端 `src/styles/page.module.css`；两端 `/foundation` 可以直接验证 reset、主题别名与原生控件。
