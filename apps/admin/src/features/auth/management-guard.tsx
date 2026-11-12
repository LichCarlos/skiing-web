"use client";
import { AdminParagraph } from "@/components/admin-paragraph";

import { Fragment, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { App, Button } from "antd";
import { routes } from "@/config/routes";
import {
  canAccessManagementPage,
  hasManagementPortalAccess,
} from "@/platform/auth/access";
import { useSession } from "@/platform/auth/session-provider";
import styles from "@/features/auth/session.module.css";

export function ManagementGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { message } = App.useApp();
  const { session, retryRestore, signOut } = useSession();

  useEffect(() => {
    if (session.status === "anonymous") router.replace(routes.login);
  }, [router, session.status]);

  if (session.status === "loading" || session.status === "anonymous") {
    return (
      <main className={styles.state} role="status">
        正在验证管理端会话...
      </main>
    );
  }

  if (session.status === "unavailable") {
    return (
      <main className={styles.state}>
        <h1>暂时无法恢复会话</h1>
        <AdminParagraph>{session.errorMessage}</AdminParagraph>
        <Button onClick={() => void retryRestore()}>重试</Button>
        {session.canSignOut ? (
          <Button
            onClick={() =>
              void signOut().catch(() =>
                message.error("退出未完成，请检查当前会话。"),
              )
            }
          >
            退出当前账号
          </Button>
        ) : null}
      </main>
    );
  }

  if (!canAccessManagementPage(session.currentUser, pathname)) {
    return (
      <main className={styles.state}>
        <h1>当前账号未获此页面授权</h1>
        <AdminParagraph>
          请联系系统管理员配置管理端入口和页面权限。
        </AdminParagraph>
        {hasManagementPortalAccess(session.currentUser) ? (
          <Button type="primary" onClick={() => router.replace(routes.admin)}>
            返回工作台
          </Button>
        ) : null}
        <Button
          onClick={() =>
            void signOut().catch(() => message.error("退出失败，请重试。"))
          }
        >
          退出当前账号
        </Button>
      </main>
    );
  }

  return <Fragment key={session.currentUser.userId}>{children}</Fragment>;
}
