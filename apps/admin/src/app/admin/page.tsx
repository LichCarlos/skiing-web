"use client";

import Link from "next/link";
import { DashboardSummary } from "@/features/dashboard/dashboard-summary";
import { getManagementGroups } from "@/features/auth/management-modules";
import { AdminIcon } from "@/components/admin-icon";
import { AdminParagraph } from "@/components/admin-paragraph";
import { Typography } from "antd";
import { useSession } from "@/platform/auth/session-provider";
import styles from "@/app/admin/dashboard.module.css";

export default function DashboardPage() {
  const { session } = useSession();
  if (session.status !== "authenticated") return null;

  const { currentUser } = session;
  const groups = getManagementGroups(currentUser);

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1>你好，{currentUser.nickname}</h1>
        {currentUser.merchant ? (
          <AdminParagraph>{currentUser.merchant.businessName}</AdminParagraph>
        ) : null}
      </header>
      <DashboardSummary />
      <section aria-labelledby="available-title">
        <h2 id="available-title" className={styles.sectionTitle}>
          可访问模块
        </h2>
        {groups.length > 0 ? (
          <div className={styles.moduleGroups}>
            {groups.map((group) => (
              <section
                key={group.key}
                className={styles.moduleGroup}
                aria-label={group.label}
              >
                <h3>
                  <AdminIcon name={group.icon} />
                  {group.label}
                </h3>
                <ul className={styles.moduleList}>
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <Link href={item.href}>
                        <span>
                          <strong>{item.label}</strong>
                          <Typography.Text type="secondary">
                            {item.detail}
                          </Typography.Text>
                        </span>
                        <AdminIcon name="arrow" width={16} height={16} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <AdminParagraph className={styles.empty}>
            当前账号尚未配置可展示的管理模块。
          </AdminParagraph>
        )}
      </section>
    </main>
  );
}
