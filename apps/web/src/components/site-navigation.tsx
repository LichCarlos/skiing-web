"use client";

import Link from "next/link";
import { routes } from "@/config/routes";
import { SiteName } from "@/features/site-config/site-config";
import { SnowMark } from "@/components/snow-mark";
import { ArrowIcon } from "@/components/site-symbol";
import styles from "@/components/site-navigation.module.css";
import { AccountControl } from "@/features/auth/account-control";

const destinations = [
  { key: "resorts", label: "探索雪场", href: routes.resorts },
  { key: "knowledge", label: "滑雪知识", href: routes.knowledge },
  { key: "dynamics", label: "雪友动态", href: routes.dynamics },
] as const;

export function SiteNavigation({
  active,
  explore = false,
}: {
  active?: "resorts" | "dynamics" | "knowledge";
  explore?: boolean;
}) {
  return (
    <header className={styles.rail} data-site-navigation>
      {explore && (
        <a className={styles.skip} href="#main-content">
          跳至主要内容
        </a>
      )}
      <Link className={styles.brand} href={routes.home} aria-label="平台首页">
        <SnowMark className={styles.mark} />
        <span>
          <SiteName />
        </span>
      </Link>
      <nav className={styles.links} aria-label="主导航">
        {destinations.map(({ key, label, href }) => (
          <Link
            key={key}
            className={styles.navItem}
            data-tone={key}
            href={href}
            aria-current={active === key ? "page" : undefined}
          >
            <span>{label}</span>
            <span className={styles.arrow} aria-hidden="true">
              <ArrowIcon direction="diagonal" />
            </span>
          </Link>
        ))}
      </nav>
      <div className={styles.bottom}>
        <AccountControl />
        <Link className={styles.about} href={routes.about}>
          <span>关于平台</span>
          <span className={styles.aboutIcon} aria-hidden="true">
            <ArrowIcon direction="diagonal" />
          </span>
        </Link>
      </div>
    </header>
  );
}
