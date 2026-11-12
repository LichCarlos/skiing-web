"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { apiRequest } from "@/platform/api";
import { usePublicSession } from "@/platform/auth/public-session";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { routes } from "@/config/routes";
import { safeReturnPath } from "@/features/auth/auth-model";
import { ArticleFavoriteController } from "@/features/article-favorites/favorite-controller";
import styles from "@/features/article-favorites/article-favorites.module.css";

const Context = createContext<ArticleFavoriteController | null>(null);
export function ArticleFavorites({
  path,
  ids,
  children,
}: {
  path: string;
  ids: number[];
  children: ReactNode;
}) {
  const session = usePublicSession();
  return (
    <AccountFavorites
      key={`${session.user?.userId ?? "guest"}:${session.ready}:${session.revision}:${path}:${ids.join(",")}`}
      userId={session.ready ? (session.user?.userId ?? null) : null}
      ready={session.ready}
      path={path}
      ids={ids}
    >
      {children}
    </AccountFavorites>
  );
}
function AccountFavorites({
  userId,
  ready,
  path,
  ids,
  children,
}: {
  userId: number | null;
  ready: boolean;
  path: string;
  ids: number[];
  children: ReactNode;
}) {
  const [controller] = useState(
    () => new ArticleFavoriteController(apiRequest, userId, path, ids),
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  useEffect(() => {
    controller.activate();
    void controller.load();
    return () => controller.dispose();
  }, [controller]);
  return (
    <Context.Provider value={ready ? controller : null}>
      {children}
      {state.error ? (
        <div className={styles.notice} role="alert">
          {state.error}
          <button
            type="button"
            disabled={state.loading || state.busy !== null}
            onClick={() => void controller.load()}
          >
            刷新收藏状态
          </button>
        </div>
      ) : null}
    </Context.Provider>
  );
}
export function ArticleFavoriteButton({ articleId }: { articleId: number }) {
  const pathname = usePathname();
  const session = usePublicSession();
  const controller = useContext(Context);
  if (!session.ready)
    return <span className={styles.status}>正在确认登录状态</span>;
  if (!session.user)
    return (
      <Link
        className={styles.status}
        href={routes.loginFor(safeReturnPath(pathname))}
      >
        登录后可收藏
      </Link>
    );
  return controller ? (
    <ConnectedButton controller={controller} articleId={articleId} />
  ) : (
    <span className={styles.status}>收藏状态待确认</span>
  );
}
function ConnectedButton({
  controller,
  articleId,
}: {
  controller: ArticleFavoriteController;
  articleId: number;
}) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const value = state.values[articleId];
  const disabled =
    state.loading || state.busy !== null || typeof value !== "boolean";
  return (
    <button
      className={styles.button}
      type="button"
      disabled={disabled}
      aria-pressed={typeof value === "boolean" ? value : undefined}
      onClick={() => void controller.toggle(articleId)}
    >
      {state.busy === articleId
        ? "正在保存…"
        : state.loading
          ? "读取收藏状态…"
          : value === null || value === undefined
            ? "收藏状态不可用"
            : value
              ? "已收藏 · 取消收藏"
              : "收藏文章"}
    </button>
  );
}
