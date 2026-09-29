import { formatNumber } from "@common/utils";

/** 教程属于当前应用；另一个应用维护自己的副本。 */
export function UsageSteps() {
  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <h2 className="text-lg font-semibold">2. 引用当前端的组件</h2>
        <p>这段教程由当前端组件渲染，不引用其他应用的源码。</p>
        <code className="break-all text-sm">
          apps/admin/src/features/foundation/usage-steps.tsx
        </code>
        <pre className="overflow-x-auto rounded-md bg-surface-muted p-3 text-sm">
          <code>
            {'import { UsageSteps } from "@/features/foundation/usage-steps";'}
          </code>
        </pre>
        <p>
          这里的 @/ 只指向
          apps/admin/src。公共包内部使用相对路径，不借用应用别名。
        </p>
      </section>
      <section className="grid gap-2">
        <h2 className="text-lg font-semibold">3. 使用公共工具与本端主题</h2>
        <p>公共 formatNumber 实际输出：{formatNumber(12345.67)}</p>
        <code className="break-all text-sm">packages/utils/src/index.ts</code>
        <pre className="overflow-x-auto rounded-md bg-surface-muted p-3 text-sm">
          <code>{'import { formatNumber } from "@common/utils";'}</code>
        </pre>
        <p>
          默认主题：<code>packages/theme/src/index.ts</code>；本端覆盖：
          <code className="break-all">apps/admin/src/config/theme.ts</code>。
        </p>
        <p className="text-primary">
          这行文字和上方公共按钮都继承当前端主题；修改本端覆盖不会改变另一端。
        </p>
      </section>
      <section className="grid gap-2">
        <h2 className="text-lg font-semibold">4. 配置本端接口地址</h2>
        <p>
          在项目根 .env 配置 NEXT_PUBLIC_ADMIN_API_BASE_URL，通过
          @common/config/public 读取。
        </p>
        <p>
          本端装配入口：
          <code className="break-all">
            apps/admin/src/platform/config/index.ts
          </code>
          。请求、认证与权限由所属组实现，此页不发送业务请求。
        </p>
        <p>跨包统一使用 @common/包名；应用内通过 @/ 定位本端源码。</p>
      </section>
      <section className="grid gap-2">
        <h2 className="text-lg font-semibold">5. 配置检查并验证修改</h2>
        <p>
          本组规则：<code>apps/admin/eslint.config.mjs</code>；格式选项：
          <code>apps/admin/.prettierrc.json</code>
          。目前仅接入基础解析和默认格式化。
        </p>
        <pre className="overflow-x-auto rounded-md bg-surface-muted p-3 text-sm">
          <code>{"pnpm check:boundaries\npnpm check\npnpm build:admin"}</code>
        </pre>
        <p>
          先停止当前端开发服务，再运行类型检查或构建；修改公共包时验证两个端。
        </p>
      </section>
    </div>
  );
}
