"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { App, Avatar, Breadcrumb, Button, Typography } from "antd";
import { ManagementNavigation } from "@/features/auth/management-navigation";
import { AdminIcon } from "@/components/admin-icon";
import { routes } from "@/config/routes";
import {
  getActiveManagementModule,
  getManagementGroups,
} from "@/features/auth/management-modules";
import { useSession } from "@/platform/auth/session-provider";
import styles from "@/features/auth/management-shell.module.css";

export function ManagementShell({ children }: { children: React.ReactNode }) {
  const { session, signOut } = useSession();
  const { message } = App.useApp();
  const pathname = usePathname();
  if (session.status !== "authenticated") return null;

  const currentUser = session.currentUser;
  const groups = getManagementGroups(currentUser);
  const active = getActiveManagementModule(currentUser, pathname);
  const currentGroup = groups.find(({ items }) =>
    items.some(({ href }) => href === active?.href),
  );
  const navigation = (
    <ManagementNavigation
      groups={groups}
      activePath={active?.href}
      pathname={pathname}
    />
  );

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#management-content">
        跳至主要内容
      </a>
      <header className={styles.header}>
        <div className={styles.brandArea}>
          <Link href={routes.admin} className={styles.brand}>
            <span className={styles.brandMark}>
              <AdminIcon name="mountain" />
            </span>
            <span>
              凛迹雪客<span className={styles.brandCaption}>管理端</span>
            </span>
          </Link>
        </div>
        <div className={styles.location}>
          <Breadcrumb
            items={[
              { title: <Link href={routes.admin}>工作台</Link> },
              ...(currentGroup ? [{ title: currentGroup.label }] : []),
              ...(active ? [{ title: active.label }] : []),
            ]}
          />
        </div>
        <div className={styles.account}>
          <Avatar className={styles.avatar} size={32}>
            {Array.from(currentUser.nickname.trim())[0] ||
              currentUser.account[0]}
          </Avatar>
          <Typography.Text
            className={styles.accountName}
            title={currentUser.nickname}
          >
            {currentUser.nickname}
          </Typography.Text>
          <Button
            type="text"
            icon={<AdminIcon name="logout" width={16} height={16} />}
            onClick={() =>
              void signOut().catch(() => message.error("退出失败，请重试。"))
            }
          >
            退出
          </Button>
        </div>
      </header>
      <div className={styles.body}>
        <aside className={styles.sidebar}>{navigation}</aside>
        <div className={styles.content} id="management-content" tabIndex={-1}>
          {children}
        </div>
      </div>
    </div>
  );
}
