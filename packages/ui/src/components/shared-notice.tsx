import type { ReactNode } from "react";

/** 只负责展示内容，不读取业务状态、接口或应用配置。 */
export function SharedNotice({ children }: { children: ReactNode }) {
  return (
    <aside className="rounded-md border border-border-default bg-surface-muted p-4 text-text-main">
      {children}
    </aside>
  );
}
