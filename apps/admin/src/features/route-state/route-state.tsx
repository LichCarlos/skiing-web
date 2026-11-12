import { AdminParagraph } from "@/components/admin-paragraph";
import type { ReactNode } from "react";
import { routes } from "@/config/routes";
import { getPageHref } from "@/platform/config";
import styles from "@/features/route-state/route-state.module.css";

export type ErrorRecoveryProps = { error: unknown; retry: () => void };

function StatePanel({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <main className={styles.page}>
      <AdminParagraph className={styles.brand}>
        凛迹雪客 · 管理端
      </AdminParagraph>
      <h1 className={styles.title}>{title}</h1>
      <AdminParagraph className={styles.message}>{children}</AdminParagraph>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </main>
  );
}

function HomeLink() {
  // A document navigation also works when the router or a provider has failed.
  return (
    <a className={styles.link} href={getPageHref(routes.admin)}>
      返回工作台
    </a>
  );
}

export function RouteError({ retry }: ErrorRecoveryProps) {
  return (
    <>
      <meta name="robots" content="noindex, nofollow" />
      <StatePanel
        title="管理页面暂时无法显示"
        actions={
          <>
            <button
              type="button"
              className={styles.button}
              onClick={() => retry()}
            >
              重新加载页面
            </button>
            <HomeLink />
          </>
        }
      >
        如刚才提交过修改，请先返回对应列表核对结果，再决定是否继续操作。
      </StatePanel>
    </>
  );
}

export function RouteNotFound() {
  return (
    <>
      <meta name="robots" content="noindex, nofollow" />
      <StatePanel title="未找到此页面" actions={<HomeLink />}>
        请检查链接，或返回工作台查看当前账号可用的功能。
      </StatePanel>
    </>
  );
}

export function RouteLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <StatePanel title="正在加载管理页面">请稍候…</StatePanel>
    </div>
  );
}
