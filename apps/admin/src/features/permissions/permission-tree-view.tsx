import { AdminParagraph } from "@/components/admin-paragraph";
import type { components } from "@common/api-contracts/openapi";
import styles from "@/app/admin/system/permissions/page.module.css";

type PermissionNode = components["schemas"]["PermissionNodeVO"];

export type PermissionTreeViewState =
  | { status: "loading" }
  | { status: "ready"; nodes: PermissionNode[] }
  | {
      status: "error";
      title: string;
      message: string;
      traceId: string | null;
    };

function PermissionBranch({
  node,
  depth = 0,
}: {
  node: PermissionNode;
  depth?: number;
}) {
  return (
    <li className={styles.node}>
      <div
        className={styles.nodeRow}
        style={{ paddingInlineStart: `${depth * 1.25}rem` }}
      >
        <span className={styles.type}>{node.permissionType}</span>
        <span className={styles.name}>{node.permissionName}</span>
        <code>{node.permissionKey}</code>
        {node.route ? <span className={styles.route}>{node.route}</span> : null}
      </div>
      {node.children.length > 0 ? (
        <ul className={styles.children}>
          {node.children.map((child) => (
            <PermissionBranch
              key={child.permissionId}
              node={child}
              depth={depth + 1}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function PermissionTreeView({
  state,
  onRetry,
}: {
  state: PermissionTreeViewState;
  onRetry: () => void;
}) {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1>权限目录</h1>
        <AdminParagraph className={styles.copy}>
          读取后端当前启用的目录、菜单和操作权限。授权由 API
          强制执行，页面只负责展示结果。
        </AdminParagraph>
      </header>

      {state.status === "loading" ? (
        <AdminParagraph role="status">正在加载权限目录...</AdminParagraph>
      ) : null}
      {state.status === "error" ? (
        <section className={styles.message} role="alert">
          <strong>{state.title}</strong>
          <AdminParagraph>{state.message}</AdminParagraph>
          {state.traceId ? <code>traceId: {state.traceId}</code> : null}
          <button type="button" onClick={onRetry}>
            重试
          </button>
        </section>
      ) : null}
      {state.status === "ready" && state.nodes.length === 0 ? (
        <AdminParagraph className={styles.message}>
          当前没有启用的权限。
        </AdminParagraph>
      ) : null}
      {state.status === "ready" && state.nodes.length > 0 ? (
        <section className={styles.panel} aria-label="权限树">
          <ul className={styles.tree}>
            {state.nodes.map((node) => (
              <PermissionBranch key={node.permissionId} node={node} />
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
