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
      <p className={styles.brand}>凛迹雪客</p>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.message}>{children}</p>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </main>
  );
}

function HomeLink() {
  // A document navigation also works when the router or a provider has failed.
  return (
    <a className={styles.link} href={getPageHref(routes.home)}>
      返回首页
    </a>
  );
}

export function RouteError({ retry }: ErrorRecoveryProps) {
  return (
    <>
      <meta name="robots" content="noindex, nofollow" />
      <StatePanel
        title="页面暂时无法显示"
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
        请稍后重新加载，或返回首页继续浏览。
      </StatePanel>
    </>
  );
}

export function RouteNotFound() {
  return (
    <>
      <meta name="robots" content="noindex, nofollow" />
      <StatePanel title="未找到此页面" actions={<HomeLink />}>
        页面可能已移除，或链接不正确。你可以返回首页重新查找。
      </StatePanel>
    </>
  );
}
