"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { routes } from "@/config/routes";
import { usePublicSession } from "@/platform/auth/public-session";
import { safeReturnPath } from "@/features/auth/auth-model";
import styles from "@/features/auth/account-control.module.css";

export function AccountControl() {
  const session = usePublicSession();
  const pathname = usePathname();
  return (
    <div className={styles.account} aria-label="官网用户会话">
      {session.ready && session.user ? (
        <Link className={styles.login} href={routes.member}>
          个人中心
        </Link>
      ) : (
        <Link
          className={styles.login}
          href={routes.loginFor(safeReturnPath(pathname))}
        >
          登录 / 注册
        </Link>
      )}
      {session.error && (
        <>
          <span className={styles.status} role="alert">
            {session.error}
          </span>
          <button
            type="button"
            disabled={session.busy || session.reading}
            onClick={() => void session.restore()}
          >
            检查当前会话
          </button>
        </>
      )}
    </div>
  );
}
