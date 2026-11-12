import { AdminParagraph } from "@/components/admin-paragraph";
import Link from "next/link";
import { routes } from "@/config/routes";
import type { ManagedUser } from "@/features/users/managed-user-api";
import styles from "@/features/users/managed-user-detail.module.css";

export type ManagedUserDetailState =
  | { status: "loading" }
  | { status: "ready"; user: ManagedUser }
  | { status: "error"; title: string; traceId: string | null };

export function ManagedUserDetailView({
  state,
  onReload,
}: {
  state: ManagedUserDetailState;
  onReload: () => void;
}) {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div>
          <h1>账号详情</h1>
        </div>
        <Link href={routes.users}>返回账号管理</Link>
        <button type="button" className={styles.action} onClick={onReload}>
          刷新账号详情
        </button>
      </header>
      {state.status === "loading" ? (
        <AdminParagraph role="status">正在加载账号详情…</AdminParagraph>
      ) : state.status === "error" ? (
        <section role="alert" className={styles.panel}>
          <h2>{state.title}</h2>
          {state.traceId && <code>traceId: {state.traceId}</code>}
          <button type="button" className={styles.action} onClick={onReload}>
            重试
          </button>
        </section>
      ) : (
        <>
          <section className={styles.panel} aria-labelledby="account-basics">
            <h2 id="account-basics">基本资料</h2>
            <dl className={styles.details}>
              <dt>账号 ID</dt>
              <dd>{state.user.userId}</dd>
              <dt>账号</dt>
              <dd>{state.user.account}</dd>
              <dt>昵称</dt>
              <dd>{state.user.nickname}</dd>
              <dt>账号状态</dt>
              <dd>{state.user.status === "active" ? "启用" : "停用"}</dd>
              <dt>创建时间</dt>
              <dd>
                <time dateTime={state.user.createdAt}>
                  {new Date(state.user.createdAt).toLocaleString("zh-CN")}
                </time>
              </dd>
            </dl>
          </section>
          <section className={styles.panel} aria-labelledby="account-roles">
            <h2 id="account-roles">关联角色</h2>
            {state.user.roles.length ? (
              <ul className={styles.roles}>
                {state.user.roles.map((role) => (
                  <li key={role.roleId}>
                    <strong>{role.roleName}</strong> <code>{role.roleKey}</code>{" "}
                    · {role.status === "active" ? "启用" : "停用"}
                  </li>
                ))}
              </ul>
            ) : (
              <AdminParagraph>未分配角色</AdminParagraph>
            )}
          </section>
          <section className={styles.panel} aria-labelledby="merchant-profile">
            <h2 id="merchant-profile">商家业务资料</h2>
            {state.user.merchant ? (
              <dl className={styles.details}>
                <dt>商家 ID</dt>
                <dd>{state.user.merchant.merchantId}</dd>
                <dt>商家名称</dt>
                <dd>{state.user.merchant.businessName}</dd>
                <dt>资料状态</dt>
                <dd>
                  {state.user.merchant.status === "active" ? "启用" : "停用"}
                </dd>
              </dl>
            ) : (
              <AdminParagraph>未关联商家业务资料</AdminParagraph>
            )}
          </section>
          <button type="button" className={styles.action} onClick={onReload}>
            刷新账号详情
          </button>
        </>
      )}
    </main>
  );
}
