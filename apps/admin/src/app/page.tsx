import Link from "next/link";
import { Button, SharedNotice } from "@common/ui";
import { routes } from "@/config/routes";
import { UsageSteps } from "@/features/foundation/usage-steps";
import styles from "@/styles/page.module.css";
import { AntdPreview } from "@/components/antd-preview";
export default function Page() {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <p>FRONTEND / ADMIN</p>
        <h1 className={styles.title}>管理端 · 模板使用教程</h1>
        <p className={styles.copy}>
          按页面中的步骤找到源码、修改组件，再验证当前应用。以下路径均相对于项目根目录。
        </p>
        <code className="break-all text-sm">
          当前页面：apps/admin/src/app/page.tsx
        </code>
        <Link className={styles.link} href={routes.foundation}>
          查看基础样式与路由预览
        </Link>
      </header>
      <div className={styles.panel}>
        <section
          className="grid gap-3"
          aria-labelledby="shared-component-title"
        >
          <h2 id="shared-component-title" className="text-lg font-semibold">
            1. 引用全局公共组件
          </h2>
          <SharedNotice>
            <p>
              这是全局公共组件
              SharedNotice，两端引用同一份源码。它只展示传入内容。
            </p>
            <p className="break-all text-sm">
              源码：packages/ui/src/components/shared-notice.tsx
            </p>
          </SharedNotice>
          <div>
            <Button>公共按钮示例</Button>
          </div>
          <p className="break-all text-sm">
            Button 源码：packages/ui/src/components/button.tsx
          </p>
          <pre className="overflow-x-auto rounded-md bg-surface-muted p-3 text-sm">
            <code>{'import { Button, SharedNotice } from "@common/ui";'}</code>
          </pre>
          <p>
            步骤：在 packages/ui/src/components 修改组件 → 在
            packages/ui/src/index.ts 导出 → 两端通过包名引用。
          </p>
          <p>
            使用方必须在 package.json 声明{" "}
            <code>{'"@common/ui": "workspace:*"'}</code>。当前两端均已配置。
          </p>
        </section>
        <UsageSteps />
        <AntdPreview />
      </div>
    </main>
  );
}
