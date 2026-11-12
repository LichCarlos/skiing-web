"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SiteNavigation } from "@/components/site-navigation";
import { SnowMark } from "@/components/snow-mark";
import { usePublicSession } from "@/platform/auth/public-session";
import type { PublicUser } from "@/platform/auth/public-session-model";
import { routes } from "@/config/routes";
import { apiRequest } from "@/platform/api";
import { NoteEditor, type NoteImage } from "@/features/member/note-editor";
import {
  MemberRun,
  MemberError,
  UnconfirmedWrite,
  memberFailure,
  parseOwnPage,
  parseOwnNote,
  parseCollection,
  validateNote,
  type OwnPage,
  type OwnNote,
  type CollectionPage,
  type FavoriteKind,
} from "@/features/member/member-model";
import { safeContentUrl } from "@common/ui";
import { articleAssetReference } from "@/features/member/content-links";
import { ResortPicker } from "@/features/member/resort-picker";
import { AiWorkspace, scrollToAiWorkspace } from "@/features/ai/ai-workspace";
import styles from "@/features/member/member.module.css";

type Props = {
  mode: "library" | "write" | "ai";
  noteId?: number;
  tab?: "notes" | "favorites";
  type?: FavoriteKind;
  page?: number;
  status?: "all" | "pending" | "published" | "hidden";
  conversationId?: string;
};
const labels = { pending: "待审核", published: "已公开", hidden: "未展示" };
export function MemberPage(props: Props) {
  const session = usePublicSession();
  const [owner, setOwner] = useState<PublicUser | null>(null);
  // Preserve an in-memory draft across a focus check; discard it at an account change or logout.
  if (session.ready && session.user?.userId !== owner?.userId)
    setOwner(session.user);
  else if ((session.busy || session.uncertain) && owner) setOwner(null);
  const verified =
    session.ready &&
    session.user?.userId === owner?.userId &&
    !!owner &&
    !session.busy &&
    !session.uncertain;
  const returnTo =
    props.mode === "ai"
      ? routes.memberAi(props.conversationId, props.page)
      : props.mode === "write"
        ? props.noteId
          ? routes.memberNote(props.noteId)
          : routes.memberNew
        : routes.member;
  return (
    <main className={styles.page} data-member-page>
      <SiteNavigation />
      <div className={styles.inner}>
        {!owner || !verified ? (
          <section className={styles.gate} aria-labelledby="member-gate-title">
            <SnowMark />
            <h1 id="member-gate-title">你的雪上故事，从这里开始</h1>
            <p>
              {session.reading
                ? "正在确认当前会话…"
                : session.error ||
                  "登录后写笔记、查看收藏，也能和 AI 聊聊你的滑雪计划。"}
            </p>
            {session.ready && !session.user ? (
              <Link className={styles.primary} href={routes.loginFor(returnTo)}>
                登录 / 注册
              </Link>
            ) : (
              <button
                className={styles.primary}
                type="button"
                disabled={session.reading || session.busy}
                onClick={() => void session.restore()}
              >
                检查当前会话
              </button>
            )}
          </section>
        ) : null}
        {owner && (
          <div hidden={!verified} inert={!verified}>
            <Workspace
              key={owner.userId}
              {...props}
              user={verified ? session.user! : owner}
              enabled={verified}
            />
          </div>
        )}
      </div>
    </main>
  );
}
function Workspace({
  user,
  enabled,
  ...props
}: Props & { user: PublicUser; enabled: boolean }) {
  const session = usePublicSession();
  const [run] = useState(() => new MemberRun(user.userId, apiRequest));
  useLayoutEffect(() => {
    run.activate();
    return () => run.dispose();
  }, [run]);
  useEffect(() => {
    if (!enabled) run.suspend();
  }, [run, enabled]);
  return (
    <>
      <header className={styles.profile}>
        <div className={styles.identity}>
          <span className={styles.avatar} aria-hidden="true">
            {user.nickname.slice(0, 1)}
          </span>
          <div>
            <h1>{user.nickname}的个人中心</h1>
            <p>把每一次出发，写成自己的故事。</p>
          </div>
        </div>
        <div className={styles.profileActions}>
          <Link
            className={styles.outline}
            href={routes.memberAi()}
            scroll={false}
            onNavigate={(event) => {
              if (props.mode === "ai") {
                event.preventDefault();
                scrollToAiWorkspace();
              }
            }}
          >
            我的 AI 对话
          </Link>
          <Link className={styles.primary} href={routes.memberNew}>
            写笔记 <span aria-hidden="true">↗</span>
          </Link>
          <button
            type="button"
            className={styles.quiet}
            disabled={!enabled}
            onClick={() => void session.logout()}
          >
            退出登录
          </button>
        </div>
      </header>
      <nav className={styles.tabs} aria-label="个人中心">
        <Link
          href={routes.member}
          aria-current={
            props.mode === "library" && props.tab !== "favorites"
              ? "page"
              : undefined
          }
        >
          我的笔记
        </Link>
        <Link
          href={routes.memberCollection()}
          aria-current={props.tab === "favorites" ? "page" : undefined}
        >
          收藏
        </Link>
        <Link
          href={routes.memberAi()}
          scroll={false}
          onNavigate={(event) => {
            if (props.mode === "ai") {
              event.preventDefault();
              scrollToAiWorkspace();
            }
          }}
          aria-current={props.mode === "ai" ? "page" : undefined}
        >
          我的 AI 对话
        </Link>
        <Link
          href={routes.memberNew}
          aria-current={props.mode === "write" ? "page" : undefined}
        >
          写笔记
        </Link>
      </nav>
      {props.mode === "ai" ? (
        <AiWorkspace
          user={user}
          enabled={enabled}
          conversationId={props.conversationId}
          page={props.page ?? 1}
        />
      ) : props.mode === "write" ? (
        <Composer
          key={props.noteId ?? "new"}
          run={run}
          user={user}
          enabled={enabled}
          noteId={props.noteId}
        />
      ) : props.tab === "favorites" ? (
        <Collection
          run={run}
          enabled={enabled}
          kind={props.type ?? "dynamic"}
          page={props.page ?? 1}
          canFavorite={user.permissionKeys.includes("member:favorite:toggle")}
        />
      ) : (
        <Notes
          run={run}
          enabled={enabled}
          page={props.page ?? 1}
          status={props.status ?? "all"}
          canRead={user.permissionKeys.includes("community:dynamic:read-own")}
        />
      )}
    </>
  );
}
function Notes({
  run,
  enabled,
  page,
  status,
  canRead,
}: {
  run: MemberRun;
  enabled: boolean;
  page: number;
  status: string;
  canRead: boolean;
}) {
  const [data, setData] = useState<OwnPage | null>(null),
    [error, setError] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!enabled || !canRead) return;
    let current = true;
    setLoading(true);
    setError(null);
    setData(null);
    const query = new URLSearchParams({ page: String(page), pageSize: "12" });
    if (status !== "all") query.set("status", status);
    void run
      .read(`/me/dynamics?${query}`, (value) =>
        parseOwnPage(value, run.userId, page, status),
      )
      .then((value) => {
        if (current) setData(value);
      })
      .catch((cause) => {
        if (current && cause?.name !== "AbortError")
          setError(memberFailure(cause));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
      run.suspend();
    };
  }, [run, enabled, canRead, page, status, retry]);
  return (
    <section className={styles.library} aria-labelledby="notes-title">
      <div className={styles.sectionHead}>
        <div>
          <h2 id="notes-title">我的笔记</h2>
          <p>提交后由管理员审核，审核通过才会公开。修改公开笔记会重新审核。</p>
        </div>
        <button
          type="button"
          className={styles.quiet}
          disabled={loading}
          onClick={() => setRetry((n) => n + 1)}
        >
          刷新列表
        </button>
      </div>
      <nav className={styles.filters} aria-label="笔记状态">
        {(["all", "pending", "published", "hidden"] as const).map((key) => (
          <Link
            key={key}
            href={key === "all" ? routes.member : `/me?status=${key}`}
            aria-current={status === key ? "page" : undefined}
          >
            {key === "all" ? "全部" : labels[key]}
          </Link>
        ))}
      </nav>
      {!canRead ? (
        <p role="alert">当前账号没有读取个人笔记的权限，请联系管理员。</p>
      ) : loading ? (
        <p role="status" className={styles.empty}>
          正在读取你的笔记…
        </p>
      ) : error ? (
        <ErrorMessage error={error} retry={() => setRetry((n) => n + 1)} />
      ) : !data?.items.length ? (
        <div className={styles.empty}>
          <SnowMark />
          <h3>
            {status === "all"
              ? "第一篇笔记，等你写下"
              : `暂无${labels[status as keyof typeof labels]}的笔记`}
          </h3>
          <p>记录滑雪心得、行前计划，或一次值得记住的相遇。</p>
          <Link className={styles.primary} href={routes.memberNew}>
            写第一篇笔记
          </Link>
        </div>
      ) : (
        <>
          <p className={styles.total}>{data.total} 篇笔记</p>
          <ol className={styles.noteList}>
            {data.items.map((note) => (
              <li key={note.dynamicId} className={styles.noteRow}>
                {note.coverUrl ? (
                  <img src={note.coverUrl} className={styles.cover} alt="" />
                ) : (
                  <span className={styles.textCover} aria-hidden="true">
                    <SnowMark />
                  </span>
                )}
                <div className={styles.noteInfo}>
                  <div className={styles.noteMeta}>
                    <span className={styles.status} data-status={note.status}>
                      {labels[note.status]}
                    </span>
                    <time dateTime={note.createdAt}>
                      {formatDate(note.createdAt)}
                    </time>
                  </div>
                  <Link
                    className={styles.noteTitle}
                    href={routes.memberNote(note.dynamicId)}
                  >
                    {note.summary.split(/\n/)[0] || "我的雪友笔记"}
                  </Link>
                  <p className={styles.summary}>{note.summary}</p>
                  <span>
                    {note.likeCount} 赞 · {note.commentCount} 评论
                    {note.resort ? ` · ${note.resort.name}` : ""}
                  </span>
                </div>
                <div className={styles.rowActions}>
                  <Link
                    className={styles.outline}
                    href={routes.memberNote(note.dynamicId)}
                  >
                    查看 / 编辑
                  </Link>
                  {note.status === "published" && (
                    <Link
                      className={styles.textLink}
                      href={routes.dynamicDetail(note.dynamicId)}
                    >
                      查看公开页
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ol>
          <Pagination
            page={page}
            hasNext={data.hasNext}
            href={(value) =>
              `/me?page=${value}${status === "all" ? "" : `&status=${status}`}`
            }
          />
        </>
      )}
    </section>
  );
}
function Collection({
  run,
  enabled,
  kind,
  page,
  canFavorite,
}: {
  run: MemberRun;
  enabled: boolean;
  kind: FavoriteKind;
  page: number;
  canFavorite: boolean;
}) {
  const [data, setData] = useState<CollectionPage | null>(null),
    [error, setError] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0),
    [removing, setRemoving] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled || !canFavorite) return;
    let current = true;
    setData(null);
    setLoading(true);
    setError(null);
    void run
      .read(
        `/me/favorites?targetType=${kind}&page=${page}&pageSize=12`,
        (value) => parseCollection(value, kind, page),
      )
      .then((value) => {
        if (current) setData(value);
      })
      .catch((cause) => {
        if (current && cause?.name !== "AbortError")
          setError(memberFailure(cause));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
      run.suspend();
    };
  }, [run, enabled, canFavorite, kind, page, retry]);
  async function remove(id: number) {
    if (!enabled || removing !== null) return;
    setRemoving(id);
    setError(null);
    try {
      await run.write(
        `/me/favorites/${kind}/${id}`,
        "DELETE",
        undefined,
        () => {},
      );
      setRetry((n) => n + 1);
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError"))
        setError(memberFailure(cause));
    } finally {
      setRemoving(null);
    }
  }
  const href = (id: number) =>
    kind === "dynamic"
      ? routes.dynamicDetail(id)
      : kind === "article"
        ? routes.articleDetail(id)
        : routes.resortDetail(id);
  return (
    <section className={styles.library} aria-labelledby="collection-title">
      <div className={styles.sectionHead}>
        <div>
          <h2 id="collection-title">值得再读的收藏</h2>
          <p>好故事、实用知识和想去的雪场，留在这里慢慢看。</p>
        </div>
        <button
          type="button"
          className={styles.quiet}
          disabled={loading || removing !== null}
          onClick={() => setRetry((n) => n + 1)}
        >
          刷新收藏
        </button>
      </div>
      <nav className={styles.filters} aria-label="收藏类型">
        {(
          [
            ["dynamic", "雪友笔记"],
            ["article", "知识文章"],
            ["resort", "雪场"],
          ] as const
        ).map(([key, label]) => (
          <Link
            key={key}
            href={routes.memberCollection(key)}
            aria-current={kind === key ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      {!canFavorite ? (
        <p role="alert">当前账号没有收藏权限，请联系管理员。</p>
      ) : loading ? (
        <p role="status" className={styles.empty}>
          正在读取收藏…
        </p>
      ) : (
        <>
          {error && (
            <ErrorMessage
              error={error}
              retry={() => setRetry((n) => n + 1)}
              disabled={removing !== null}
            />
          )}
          {!data?.items.length ? (
            !error && (
              <div className={styles.empty}>
                <h3>
                  还没有收藏
                  {kind === "dynamic"
                    ? "笔记"
                    : kind === "article"
                      ? "知识文章"
                      : "雪场"}
                </h3>
                <p>找到喜欢的内容，在详情页点击收藏，下次就能在这里找到。</p>
                <Link
                  className={styles.primary}
                  href={
                    kind === "dynamic"
                      ? routes.dynamics
                      : kind === "article"
                        ? routes.knowledge
                        : routes.resorts
                  }
                >
                  去逛逛
                </Link>
              </div>
            )
          ) : (
            <>
              <p className={styles.total}>{data.total} 个收藏</p>
              <ol className={styles.noteList}>
                {data.items.map((item) => (
                  <li className={styles.collectionRow} key={item.favoriteId}>
                    <div>
                      <span className={styles.noteMeta}>
                        {item.target.author ||
                          (kind === "article" ? "滑雪知识" : "雪场指南")}{" "}
                        · 收藏于 {formatDate(item.favoritedAt)}
                      </span>
                      <Link
                        className={styles.noteTitle}
                        href={href(item.target.id)}
                      >
                        {item.target.title}
                      </Link>
                      <p className={styles.summary}>{item.target.summary}</p>
                    </div>
                    <button
                      type="button"
                      className={styles.quiet}
                      disabled={removing !== null}
                      onClick={() => void remove(item.target.id)}
                    >
                      {removing === item.target.id ? "正在移除…" : "取消收藏"}
                    </button>
                  </li>
                ))}
              </ol>
              <Pagination
                page={page}
                hasNext={page * 12 < data.total}
                href={(value) => routes.memberCollection(kind, value)}
              />
            </>
          )}
        </>
      )}
    </section>
  );
}
function Composer({
  run,
  user,
  enabled,
  noteId,
}: {
  run: MemberRun;
  user: PublicUser;
  enabled: boolean;
  noteId?: number;
}) {
  const [note, setNote] = useState<OwnNote | null>(null),
    [content, setContent] = useState(""),
    [format, setFormat] = useState<"plain_text" | "markdown_v1">("markdown_v1"),
    [images, setImages] = useState<NoteImage[]>([]),
    [resort, setResort] = useState("");
  const [loading, setLoading] = useState(!!noteId),
    [error, setError] = useState<string | null>(null),
    [pending, setPending] = useState<"save" | "image" | "delete" | null>(null),
    [savedId, setSavedId] = useState<number | null>(null),
    [dirty, setDirty] = useState(false),
    [reload, setReload] = useState(0),
    [deleteOpen, setDeleteOpen] = useState(false),
    [deleted, setDeleted] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const loadedReload = useRef(-1);
  const permission = noteId
    ? "community:dynamic:update-own"
    : "community:dynamic:create";
  const canWrite = user.permissionKeys.includes(permission);
  useEffect(() => {
    if (!enabled || !noteId || (note && loadedReload.current === reload))
      return;
    let current = true;
    setLoading(true);
    setError(null);
    void run
      .read(`/me/dynamics/${noteId}`, (value) =>
        parseOwnNote(value, user.userId, noteId),
      )
      .then((value) => {
        if (current) {
          setNote(value);
          setContent(value.content);
          setFormat(value.contentFormat ?? "plain_text");
          setImages(value.images);
          setResort(value.resort ? String(value.resort.resortId) : "");
          setDirty(false);
          setSavedId(null);
          setUnconfirmed(false);
          loadedReload.current = reload;
        }
      })
      .catch((cause) => {
        if (current && cause?.name !== "AbortError")
          setError(memberFailure(cause));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
      run.suspend();
    };
    // Only an explicit reload replaces an existing draft. A focus session check preserves it.
  }, [run, enabled, noteId, user.userId, reload]);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const beforeNavigate = (event: MouseEvent) => {
      const link =
        event.target instanceof Element
          ? (event.target.closest("a[href]") as HTMLAnchorElement | null)
          : null;
      if (
        !link ||
        event.defaultPrevented ||
        link.target === "_blank" ||
        link.href === location.href
      )
        return;
      if (
        !window.confirm("正文尚未提交，离开会丢失修改。请先导出或提交。离开？")
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", beforeNavigate, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", beforeNavigate, true);
    };
  }, [dirty]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (
      !enabled ||
      !canWrite ||
      pending !== null ||
      savedId ||
      unconfirmed ||
      (noteId && !note)
    )
      return;
    setError(null);
    try {
      validateNote(content, format, images);
      if (resort && (!/^[1-9]\d*$/.test(resort) || Number(resort) > 2147483647))
        throw new MemberError("请选择公开雪场，或取消关联。");
      setPending("save");
      const body = {
        content,
        contentFormat: format,
        imageAssetIds: images.map((x) => x.assetId),
        resortId: resort ? Number(resort) : noteId ? null : undefined,
        ...(noteId ? { expectedVersion: note!.version } : {}),
      };
      const result = await run.write(
        noteId ? `/dynamics/${noteId}` : "/dynamics",
        noteId ? "PATCH" : "POST",
        body,
        (value) => {
          const row = value as { dynamicId?: unknown; status?: unknown };
          if (
            !row ||
            !Number.isInteger(row.dynamicId) ||
            Number(row.dynamicId) < 1 ||
            (noteId && row.dynamicId !== noteId) ||
            !["pending", "hidden"].includes(String(row.status))
          )
            throw new MemberError("提交结果未确认，请先返回列表核对。");
          return row.dynamicId as number;
        },
      );
      setSavedId(result);
      setDirty(false);
    } catch (cause) {
      if (cause instanceof UnconfirmedWrite) setUnconfirmed(true);
      if (!(cause instanceof DOMException && cause.name === "AbortError"))
        setError(memberFailure(cause));
    } finally {
      setPending(null);
    }
  }
  async function upload(file: File): Promise<NoteImage> {
    if (
      !enabled ||
      pending !== null ||
      !user.permissionKeys.includes("asset:upload")
    )
      throw new MemberError("当前无法上传图片。");
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      !file.size ||
      file.size > 10 * 1024 * 1024
    )
      throw new MemberError("请选择不超过 10 MiB 的 JPEG、PNG 或 WebP 图片。");
    const body = new FormData();
    body.append("file", file);
    setPending("image");
    try {
      return await run.write("/assets", "POST", body, (value) => {
        const row = value as {
          status?: unknown;
          assetId?: unknown;
          url?: unknown;
        };
        if (
          row?.status !== "ready" ||
          typeof row.assetId !== "string" ||
          !articleAssetReference(`asset:${row.assetId}`) ||
          typeof row.url !== "string" ||
          !safeContentUrl(row.url)
        )
          throw new MemberError("图片尚未通过扫描，请核对图片状态后重试。");
        return { assetId: row.assetId, url: row.url };
      });
    } catch (cause) {
      throw new MemberError(memberFailure(cause));
    } finally {
      setPending(null);
    }
  }
  async function remove() {
    if (
      !enabled ||
      pending !== null ||
      !noteId ||
      !user.permissionKeys.includes("community:dynamic:update-own")
    )
      return;
    setPending("delete");
    setError(null);
    try {
      await run.write(`/dynamics/${noteId}`, "DELETE", undefined, () => {});
      setDirty(false);
      setDeleted(true);
    } catch (cause) {
      if (cause instanceof UnconfirmedWrite) setUnconfirmed(true);
      if (!(cause instanceof DOMException && cause.name === "AbortError"))
        setError(memberFailure(cause));
    } finally {
      setPending(null);
    }
  }
  const blocked =
    !enabled ||
    !canWrite ||
    loading ||
    pending === "save" ||
    pending === "delete" ||
    !!savedId;
  if (deleted)
    return (
      <section className={styles.empty} role="status">
        <h2>笔记已删除</h2>
        <p>这篇内容已从个人笔记和公开页面移除。</p>
        <Link className={styles.primary} href={routes.member}>
          返回我的笔记
        </Link>
      </section>
    );
  return (
    <section className={styles.composer} aria-labelledby="composer-title">
      <div className={styles.sectionHead}>
        <div>
          <h2 id="composer-title">
            {noteId ? "查看与编辑笔记" : "写下你的雪上故事"}
          </h2>
          <p>装备心得、行前准备，或一个想分享的瞬间。</p>
        </div>
        {note && (
          <span className={styles.status} data-status={note.status}>
            {labels[note.status]}
          </span>
        )}
      </div>
      {loading ? (
        <p role="status">正在读取笔记…</p>
      ) : noteId && !note ? (
        <ErrorMessage
          error={error || "笔记不可用"}
          retry={() => setReload((n) => n + 1)}
        />
      ) : (
        <form onSubmit={(event) => void submit(event)}>
          {savedId ? (
            <div className={styles.success} role="status">
              <h3>
                {note?.status === "hidden"
                  ? "修改已保存，内容仍未展示"
                  : "已提交，等待管理员审核"}
              </h3>
              <p>
                {note?.status === "hidden"
                  ? "管理员重新审核后决定是否恢复展示。"
                  : "审核通过后才会出现在雪友动态中。你可以在我的笔记查看状态。"}
              </p>
              <Link className={styles.primary} href={routes.member}>
                返回我的笔记
              </Link>
              {noteId === savedId ? (
                <button
                  type="button"
                  className={styles.textLink}
                  onClick={() => setReload((n) => n + 1)}
                >
                  重新打开笔记
                </button>
              ) : (
                <Link
                  className={styles.textLink}
                  href={routes.memberNote(savedId)}
                >
                  重新打开笔记
                </Link>
              )}
            </div>
          ) : null}
          {!canWrite && (
            <p className={styles.error} role="alert">
              当前账号没有{noteId ? "编辑" : "发表"}笔记的权限，请联系管理员。
            </p>
          )}
          {note?.status === "published" && (
            <p className={styles.reviewNotice}>
              这篇笔记已公开。保存修改后会暂时退出公开展示，重新提交管理员审核。
            </p>
          )}
          <NoteEditor
            value={content}
            format={format}
            images={images}
            disabled={blocked}
            canUpload={user.permissionKeys.includes("asset:upload")}
            onChange={(value) => {
              setContent(value);
              setDirty(true);
            }}
            onFormatChange={(value) => {
              setFormat(value);
              setDirty(true);
            }}
            upload={upload}
            onImage={(image) => {
              setImages((value) => [...value, image]);
              setDirty(true);
            }}
          />
          {images.length > 0 && (
            <fieldset className={styles.attachments}>
              <legend>笔记图片 · {images.length} 张</legend>
              <p>移除附图前，请同时移除正文中对应的图片。</p>
              <div>
                {images.map((image) => (
                  <figure key={image.assetId}>
                    <img src={image.url} alt="笔记附图" />
                    <button
                      type="button"
                      disabled={blocked || pending !== null}
                      onClick={() => {
                        setImages((value) =>
                          value.filter((x) => x.assetId !== image.assetId),
                        );
                        setDirty(true);
                      }}
                    >
                      移除这张附图
                    </button>
                  </figure>
                ))}
              </div>
            </fieldset>
          )}
          <ResortPicker
            run={run}
            enabled={enabled}
            value={resort}
            initialName={note?.resort?.name}
            disabled={blocked || pending !== null}
            onChange={(value) => {
              setResort(value);
              setDirty(true);
            }}
          />
          {error && (
            <ErrorMessage
              error={error}
              retry={
                noteId
                  ? () => {
                      if (
                        noteId &&
                        (!dirty ||
                          window.confirm(
                            "重新读取会替换当前未保存正文，请先导出保留。继续？",
                          ))
                      )
                        setReload((n) => n + 1);
                    }
                  : undefined
              }
              disabled={pending !== null}
            />
          )}
          {unconfirmed && (
            <p className={styles.reviewNotice}>
              请先导出正文，再
              <Link href={routes.member}>返回我的笔记核对提交结果</Link>
              。已有笔记可重新读取最新版本后继续。
            </p>
          )}
          <div className={styles.submitBar}>
            <div>
              <strong>审核后公开</strong>
              <p>正文会由管理员审核；图片通过扫描后方可提交。</p>
            </div>
            <button
              type="submit"
              className={styles.primary}
              disabled={
                blocked ||
                pending !== null ||
                !content.trim() ||
                !!savedId ||
                unconfirmed
              }
            >
              {pending === "save"
                ? "正在提交…"
                : noteId
                  ? "保存修改"
                  : "提交审核"}
            </button>
          </div>
          <div className={styles.bottomActions}>
            <Link href={routes.member} className={styles.textLink}>
              返回我的笔记
            </Link>
            {noteId &&
              user.permissionKeys.includes("community:dynamic:update-own") && (
                <button
                  type="button"
                  className={styles.danger}
                  disabled={blocked || pending !== null || unconfirmed}
                  onClick={() => setDeleteOpen(!deleteOpen)}
                >
                  删除笔记
                </button>
              )}
          </div>
          {deleteOpen && (
            <div className={styles.deleteConfirm} role="alert">
              <strong>确认删除这篇笔记？</strong>
              <p>删除后会退出公开展示，并从你的笔记列表移除。</p>
              <button
                className={styles.danger}
                type="button"
                disabled={pending !== null}
                onClick={() => void remove()}
              >
                {pending === "delete" ? "正在删除…" : "确认删除"}
              </button>
              <button
                type="button"
                className={styles.quiet}
                disabled={pending !== null}
                onClick={() => setDeleteOpen(false)}
              >
                保留笔记
              </button>
            </div>
          )}
        </form>
      )}
    </section>
  );
}
function ErrorMessage({
  error,
  retry,
  disabled = false,
}: {
  error: string;
  retry?(): void;
  disabled?: boolean;
}) {
  return (
    <div className={styles.error} role="alert">
      <p>{error}</p>
      {retry && (
        <button
          type="button"
          className={styles.quiet}
          disabled={disabled}
          onClick={retry}
        >
          重新读取
        </button>
      )}
    </div>
  );
}
function Pagination({
  page,
  hasNext,
  href,
}: {
  page: number;
  hasNext: boolean;
  href(page: number): string;
}) {
  return (
    <nav className={styles.pagination} aria-label="个人内容分页">
      {page > 1 ? (
        <Link href={href(page - 1) as typeof routes.member}>上一页</Link>
      ) : (
        <span />
      )}
      <span>第 {page} 页</span>
      {hasNext ? (
        <Link href={href(page + 1) as typeof routes.member}>下一页</Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
function formatDate(value: string) {
  return new Date(value).toLocaleDateString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
