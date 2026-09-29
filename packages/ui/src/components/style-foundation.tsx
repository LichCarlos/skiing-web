import { Button } from "./button";

/** 无路由和业务依赖，用于两端验证相同的公共样式契约。 */
export function StyleFoundation() {
  return (
    <div className="grid gap-6">
      <section
        aria-labelledby="style-alias-title"
        className="grid gap-3 rounded-lg border border-border-default bg-surface-muted p-4 text-text-main"
      >
        <h2 id="style-alias-title" className="text-lg font-semibold">
          全局语义样式
        </h2>
        <p className="break-all text-sm">
          公共组件源码：packages/ui/src/components/style-foundation.tsx
        </p>
        <p className="text-text-subtle">
          背景、文字、边框和操作色通过别名继承当前端主题。
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <span
            data-testid="action-swatch"
            className="rounded-md bg-action px-3 py-2 text-action-foreground"
          >
            操作色
          </span>
          <Button>公共按钮</Button>
          <Button variant="outline" disabled>
            禁用按钮
          </Button>
        </div>
      </section>
      <p className="break-all text-sm">
        公共按钮源码：packages/ui/src/components/button.tsx；全局样式入口：packages/ui/src/styles/globals.css
      </p>
      <section aria-labelledby="reset-title" className="grid gap-3">
        <h2 id="reset-title" className="text-lg font-semibold">
          浏览器基础样式
        </h2>
        <div data-testid="reset-probe">
          <p>此段落没有浏览器默认外边距。</p>
          <ul role="list">
            <li>列表已移除默认缩进与圆点，保留列表语义。</li>
          </ul>
        </div>
        <label className="grid max-w-md gap-2">
          文本输入
          <input
            placeholder="验证字体继承与键盘焦点"
            className="min-h-11 rounded-md border border-border-default bg-surface px-3 text-text-main"
          />
        </label>
        <label className="grid max-w-md gap-2">
          原生选择器
          <select
            className="min-h-11 rounded-md border border-border-default bg-surface px-3 text-text-main"
            defaultValue="default"
          >
            <option value="default">保留原生下拉能力</option>
            <option value="other">另一项</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" />
          保留原生勾选能力
        </label>
        <p className="text-sm text-text-subtle">
          可用 Tab 检查焦点。重置不屏蔽用户缩放、系统高对比度或辅助功能。
        </p>
      </section>
    </div>
  );
}
