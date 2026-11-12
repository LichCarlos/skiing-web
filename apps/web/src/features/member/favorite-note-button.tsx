"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { usePublicSession } from "@/platform/auth/public-session";
import { apiRequest } from "@/platform/api";
import { routes } from "@/config/routes";
import { safeReturnPath } from "@/features/auth/auth-model";
import {
  MemberError,
  MemberRun,
  memberFailure,
} from "@/features/member/member-model";
import styles from "@/features/member/member.module.css";

export function FavoriteNoteButton({
  id,
  kind = "dynamic",
}: {
  id: number;
  kind?: "dynamic" | "resort";
}) {
  const session = usePublicSession(),
    pathname = usePathname();
  if (!session.ready)
    return (
      <button className={styles.outline} type="button" disabled>
        收藏
      </button>
    );
  if (!session.user)
    return (
      <Link
        className={styles.outline}
        href={routes.loginFor(safeReturnPath(pathname))}
      >
        登录后收藏
      </Link>
    );
  if (!session.user.permissionKeys.includes("member:favorite:toggle"))
    return <span>当前账号没有收藏权限</span>;
  return (
    <Connected
      key={`${session.user.userId}:${session.revision}:${kind}:${id}`}
      id={id}
      kind={kind}
      userId={session.user.userId}
    />
  );
}
function Connected({
  id,
  kind,
  userId,
}: {
  id: number;
  kind: "dynamic" | "resort";
  userId: number;
}) {
  const [run] = useState(() => new MemberRun(userId, apiRequest));
  const [value, setValue] = useState<boolean | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [reload, setReload] = useState(0);
  useEffect(() => {
    run.activate();
    let current = true;
    setError(null);
    void run
      .read(`/me/favorites/${kind}/${id}`, (result) => {
        if (
          !result ||
          typeof (result as { favorited?: unknown }).favorited !== "boolean"
        )
          throw new MemberError("收藏状态异常，请重新读取。");
        return (result as { favorited: boolean }).favorited;
      })
      .then((result) => {
        if (current) setValue(result);
      })
      .catch((cause) => {
        if (current && cause?.name !== "AbortError")
          setError(memberFailure(cause));
      });
    return () => {
      current = false;
      run.dispose();
    };
  }, [run, id, kind, reload]);
  async function toggle() {
    if (busy || value === null) return;
    setBusy(true);
    setError(null);
    try {
      await run.write(
        value ? `/me/favorites/${kind}/${id}` : "/me/favorites",
        value ? "DELETE" : "PUT",
        value ? undefined : { targetType: kind, targetId: id },
        () => {},
      );
      setValue(!value);
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setValue(null);
        setError(memberFailure(cause));
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button
        className={styles.outline}
        type="button"
        aria-pressed={value ?? undefined}
        disabled={busy || value === null}
        onClick={() => void toggle()}
      >
        {busy ? "正在保存…" : value ? "已收藏 · 取消收藏" : "收藏"}
      </button>
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button
            className={styles.quiet}
            type="button"
            disabled={busy}
            onClick={() => setReload((x) => x + 1)}
          >
            刷新收藏状态
          </button>
        </div>
      )}
    </div>
  );
}
