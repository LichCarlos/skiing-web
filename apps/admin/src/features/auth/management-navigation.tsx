"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, Typography } from "antd";
import { AdminIcon } from "@/components/admin-icon";
import { routes } from "@/config/routes";
import type { getManagementGroups } from "@/features/auth/management-modules";
import styles from "@/features/auth/management-shell.module.css";

export function ManagementNavigation({
  groups,
  activePath,
  pathname,
}: {
  groups: ReturnType<typeof getManagementGroups>;
  activePath?: string;
  pathname: string;
}) {
  const currentGroup = groups.find((group) =>
    group.items.some((item) => item.href === activePath),
  )?.key;
  const [openKeys, setOpenKeys] = useState<string[]>(
    currentGroup ? [currentGroup] : [],
  );
  useEffect(() => {
    setOpenKeys(currentGroup ? [currentGroup] : []);
  }, [currentGroup, pathname]);
  return (
    <nav className={styles.nav} aria-label="管理端导航">
      <Typography.Text type="secondary" className={styles.navCaption}>
        功能导航
      </Typography.Text>
      <Menu
        mode="inline"
        selectedKeys={[activePath ?? routes.admin]}
        openKeys={openKeys}
        onOpenChange={(keys) =>
          setOpenKeys(
            keys.filter((key) => groups.some((group) => group.key === key)),
          )
        }
        items={[
          {
            key: routes.admin,
            icon: <AdminIcon name="dashboard" />,
            label: (
              <Link
                href={routes.admin}
                aria-current={pathname === routes.admin ? "page" : undefined}
              >
                工作台
              </Link>
            ),
          },
          ...groups.map((group) => ({
            key: group.key,
            icon: <AdminIcon name={group.icon} />,
            label: group.label,
            children: group.items.map((item) => ({
              key: item.href,
              label: (
                <Link
                  href={item.href}
                  aria-current={activePath === item.href ? "page" : undefined}
                >
                  {item.label}
                </Link>
              ),
              title: item.detail,
            })),
          })),
        ]}
      />
    </nav>
  );
}
