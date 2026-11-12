import Link from "next/link";
import type { ReactNode } from "react";
import { SnowMark } from "@/components/snow-mark";
import { routes } from "@/config/routes";
import styles from "@/components/brand-grid-footer.module.css";

export function BrandGridFooter({
  compact = false,
  children,
}: {
  compact?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={styles.grid}
      data-brand-grid
      data-compact={compact || undefined}
    >
      <div className={styles.tiles} aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
      <Link
        className={styles.signature}
        href={routes.home}
        aria-label="凛迹雪客首页"
      >
        <span>凛迹雪客</span>
        <SnowMark className={styles.mark} />
      </Link>
      {children && <div className={styles.information}>{children}</div>}
    </div>
  );
}
