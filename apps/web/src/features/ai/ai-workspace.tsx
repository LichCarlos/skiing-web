"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PublicUser } from "@/platform/auth/public-session-model";
import { routes } from "@/config/routes";
import {
  AiRun,
  aiFailure,
  citationRoute,
  type AiConversation,
  type AiConversationPage,
  type AiMessage,
  type SendAiMessage,
} from "@/features/ai/ai-api";
import member from "@/features/member/member.module.css";
import styles from "@/features/ai/ai.module.css";

export function scrollToAiWorkspace() {
  document.getElementById("ai-workspace")?.scrollIntoView({
    block: "start",
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
  });
}

export function AiWorkspace({
  user,
  enabled,
  conversationId,
  page,
}: {
  user: PublicUser;
  enabled: boolean;
  conversationId?: string;
  page: number;
}) {
  const router = useRouter();
  const allowed = user.permissionKeys.includes("ai:conversation:use");
  const [run] = useState(() => new AiRun(user.userId));
  const [list, setList] = useState<AiConversationPage | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createUncertain, setCreateUncertain] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyToggle = useRef<HTMLButtonElement>(null);
  const entered = useRef(false);
  const live = useRef(false);
  const createLock = useRef(false);
  useEffect(() => {
    if (!enabled || entered.current) return;
    const frame = requestAnimationFrame(() => {
      scrollToAiWorkspace();
      entered.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [enabled]);

  function closeHistory() {
    setHistoryOpen(false);
    if (matchMedia("(max-width: 900px)").matches)
      historyToggle.current?.focus({ preventScroll: true });
  }
  useLayoutEffect(() => {
    live.current = enabled && allowed;
    if (live.current) run.activate();
    else run.dispose();
    if (!live.current) setCreating(false);
    return () => {
      live.current = false;
      run.dispose();
    };
  }, [run, enabled, allowed]);
  useEffect(() => {
    if (!enabled || !allowed) return;
    let current = true;
    setLoading(true);
    setError("");
    void run
      .list(page)
      .then((value) => {
        if (current) {
          setList(value);
          setCreateUncertain(false);
        }
      })
      .catch((cause) => {
        if (current) {
          setList(null);
          setError(aiFailure(cause));
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [run, page, revision, enabled, allowed]);

  async function create() {
    if (!live.current || createLock.current || createUncertain) return;
    createLock.current = true;
    setCreating(true);
    setError("");
    try {
      const value = await run.create();
      if (live.current) {
        closeHistory();
        router.push(routes.memberAi(value.conversationId), { scroll: false });
      }
    } catch (cause) {
      if (live.current) {
        setError(`${aiFailure(cause)} 请先刷新列表，核对是否已经创建。`);
        setCreateUncertain(true);
      }
    } finally {
      createLock.current = false;
      if (live.current) setCreating(false);
    }
  }

  if (!allowed)
    return (
      <section id="ai-workspace" className={member.empty}>
        <h2>我的 AI 对话</h2>
        <p>当前账号尚未开通 AI 对话权限，请联系管理员。</p>
      </section>
    );
  return (
    <section
      id="ai-workspace"
      className={styles.panel}
      aria-labelledby="ai-title"
    >
      <div className={styles.panelHead}>
        <div>
          <h2 id="ai-title">我的 AI 对话</h2>
          <p>聊聊雪场、装备和滑雪知识。历史对话与当前账号同步，随时接着聊。</p>
        </div>
        <div className={styles.panelActions}>
          <button
            ref={historyToggle}
            className={`${member.outline} ${styles.historyToggle}`}
            type="button"
            aria-expanded={historyOpen}
            aria-controls="ai-history"
            onClick={() => setHistoryOpen((value) => !value)}
          >
            历史对话
          </button>
          <button
            type="button"
            className={member.primary}
            disabled={!enabled || creating || createUncertain}
            onClick={() => void create()}
          >
            {creating ? "正在新建…" : "新建对话"}
          </button>
          <Link href={routes.member} className={styles.back}>
            返回个人中心
          </Link>
        </div>
      </div>
      {error && (
        <div className={styles.panelNotice} role="alert">
          <p>{error}</p>
          <button
            type="button"
            className={member.outline}
            disabled={loading || !enabled}
            onClick={() => setRevision((x) => x + 1)}
          >
            刷新列表
          </button>
        </div>
      )}
      <div className={styles.workspace} data-history-open={historyOpen}>
        <aside
          id="ai-history"
          className={styles.history}
          aria-labelledby="ai-history-title"
        >
          <div className={styles.historyHead}>
            <h3 id="ai-history-title">历史对话</h3>
            <button
              type="button"
              className={member.textLink}
              disabled={loading || !enabled}
              onClick={() => setRevision((x) => x + 1)}
            >
              刷新列表
            </button>
          </div>
          <button
            type="button"
            className={`${member.outline} ${styles.historyClose}`}
            onClick={closeHistory}
          >
            返回当前对话
          </button>
          <div className={styles.historyBody}>
            {loading ? (
              <p role="status">正在读取对话…</p>
            ) : list?.items.length ? (
              <ul className={styles.conversations}>
                {list.items.map((item) => (
                  <li key={item.conversationId}>
                    <Link
                      href={routes.memberAi(item.conversationId, page)}
                      scroll={false}
                      onClick={closeHistory}
                      aria-current={
                        item.conversationId === conversationId
                          ? "page"
                          : undefined
                      }
                    >
                      <strong>{item.title || "新对话"}</strong>
                      <span>
                        {formatTime(item.updatedAt)} · {item.messageCount}{" "}
                        条消息
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              !error && <p>还没有历史对话。从一个滑雪问题开始吧。</p>
            )}
            {list && list.total > 20 && (
              <nav className={styles.pagination} aria-label="对话分页">
                {page > 1 && (
                  <Link
                    scroll={false}
                    href={routes.memberAi(conversationId, page - 1)}
                  >
                    上一页
                  </Link>
                )}
                <span>第 {page} 页</span>
                {page * 20 < list.total && (
                  <Link
                    scroll={false}
                    href={routes.memberAi(conversationId, page + 1)}
                  >
                    下一页
                  </Link>
                )}
              </nav>
            )}
          </div>
        </aside>
        {conversationId ? (
          <Conversation
            key={conversationId}
            id={conversationId}
            run={run}
            enabled={enabled}
            onChanged={() => setRevision((x) => x + 1)}
          />
        ) : (
          <div className={styles.start}>
            <h3>今天想了解什么？</h3>
            <p>
              新建对话，可以询问雪场信息、滑雪入门技巧或装备选择。回答有站内资料支持时，会附上来源。
            </p>
            <button
              type="button"
              className={member.primary}
              disabled={!enabled || creating || createUncertain}
              onClick={() => void create()}
            >
              开始 AI 对话
            </button>
            <p className={styles.disclaimer}>
              AI 回答仅供参考，出行与雪况以雪场最新公告为准。
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function Conversation({
  id,
  run,
  enabled,
  onChanged,
}: {
  id: string;
  run: AiRun;
  enabled: boolean;
  onChanged(): void;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<AiConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<SendAiMessage | null>(null);
  const [delta, setDelta] = useState("");
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteUncertain, setDeleteUncertain] = useState(false);
  const live = useRef(false);
  const writeLock = useRef(false);
  const timeline = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const input = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    live.current = enabled;
    if (!enabled) {
      setSending(false);
      setDeleting(false);
    }
    return () => {
      live.current = false;
    };
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    setLoading(true);
    setError("");
    void run
      .read(id)
      .then((value) => {
        if (current) {
          setDetail(value);
          setDeleteUncertain(false);
        }
      })
      .catch((cause) => {
        if (current) {
          setDetail(null);
          setError(aiFailure(cause));
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [id, run, revision, enabled]);
  useEffect(() => {
    const log = timeline.current;
    if (log && following.current) log.scrollTop = log.scrollHeight;
  }, [detail, delta, pending]);
  useEffect(() => {
    if ((error || confirmDelete) && timeline.current)
      timeline.current.scrollTop = 0;
  }, [error, confirmDelete]);

  async function send(body: SendAiMessage) {
    if (
      !live.current ||
      writeLock.current ||
      loading ||
      !detail ||
      detail.status !== "active"
    )
      return;
    writeLock.current = true;
    setSending(true);
    setError("");
    setDelta("");
    setPending(body);
    following.current = true;
    try {
      const result = await run.send(id, body, (text) => {
        if (live.current) setDelta((value) => value + text);
      });
      if (!live.current) return;
      setDetail((previous) => {
        if (
          !previous ||
          previous.messages.some((x) => x.messageId === result.messageId)
        )
          return previous;
        const last = previous.messages.at(-1);
        const messages = [...previous.messages];
        if (!(last?.role === "user" && last.content === body.content))
          messages.push({
            messageId: `local-${body.clientRequestId}`,
            role: "user",
            status: "complete",
            content: body.content,
            createdAt: result.createdAt,
            citations: [],
          });
        messages.push(result);
        return {
          ...previous,
          messages,
          messageCount: messages.length,
          updatedAt: result.createdAt,
        };
      });
      setPending(null);
      setDraft("");
      setDelta("");
      onChanged();
      input.current?.focus({ preventScroll: true });
    } catch (cause) {
      if (live.current)
        setError(`${aiFailure(cause)} 重试会继续同一个问题，不会重复发送。`);
    } finally {
      writeLock.current = false;
      if (live.current) setSending(false);
    }
  }
  async function remove() {
    if (!live.current || writeLock.current || deleteUncertain) return;
    writeLock.current = true;
    setDeleting(true);
    setError("");
    try {
      await run.remove(id);
      if (live.current) {
        onChanged();
        router.push(routes.memberAi(), { scroll: false });
      }
    } catch (cause) {
      if (live.current) {
        setError(`${aiFailure(cause)} 请重新读取对话，核对删除结果。`);
        setDeleteUncertain(true);
      }
    } finally {
      writeLock.current = false;
      if (live.current) setDeleting(false);
    }
  }
  const count = Array.from(draft.trim()).length;
  const duplicateUser =
    detail?.messages.at(-1)?.role === "user" &&
    detail.messages.at(-1)?.content === pending?.content;
  return (
    <div className={styles.chat} aria-label="AI 对话内容">
      <div className={styles.chatHead}>
        <h3>{detail?.title || "AI 对话"}</h3>
        <button
          type="button"
          className={member.textLink}
          disabled={!enabled || sending || deleting || loading || !detail}
          onClick={() => setConfirmDelete(true)}
        >
          删除对话
        </button>
      </div>
      <div
        className={styles.timeline}
        ref={timeline}
        role="log"
        aria-label="对话记录"
        aria-live="off"
        tabIndex={0}
        onScroll={() => {
          const log = timeline.current;
          if (log)
            following.current =
              log.scrollHeight - log.clientHeight - log.scrollTop < 80;
        }}
      >
        {error && (
          <div className={member.error} role="alert">
            <p>{error}</p>
            {!sending && (
              <button
                type="button"
                className={member.outline}
                disabled={!enabled || loading}
                onClick={() => setRevision((x) => x + 1)}
              >
                重新读取对话
              </button>
            )}
          </div>
        )}
        {confirmDelete && (
          <div className={member.deleteConfirm}>
            <p>删除这段对话及其全部消息？此操作无法恢复。</p>
            <button
              type="button"
              className={member.danger}
              disabled={sending || deleting || deleteUncertain || !enabled}
              onClick={() => void remove()}
            >
              {deleting ? "正在删除…" : "确认删除"}
            </button>
            <button
              type="button"
              className={member.quiet}
              disabled={deleting}
              onClick={() => setConfirmDelete(false)}
            >
              取消
            </button>
          </div>
        )}
        {loading ? (
          <p role="status">正在读取对话内容…</p>
        ) : (
          detail && (
            <>
              {!detail.messages.length && !pending && (
                <div className={styles.emptyChat}>
                  <h4>从一个问题开始</h4>
                  <p>例如：第一次滑雪应该准备哪些装备？</p>
                </div>
              )}
              {detail.messages.map((message) => (
                <Message key={message.messageId} message={message} />
              ))}
              {pending && !duplicateUser && (
                <article className={`${styles.message} ${styles.user}`}>
                  <strong>我</strong>
                  <p>{pending.content}</p>
                </article>
              )}
              {pending && (
                <article className={styles.message}>
                  <strong>AI 助手</strong>
                  <p>
                    {delta ||
                      (sending
                        ? "正在思考你的问题…"
                        : "回复未完成，可重试原问题。")}
                  </p>
                </article>
              )}
            </>
          )
        )}
      </div>
      {!loading && detail && (
        <>
          <p className={styles.status} role="status" aria-live="polite">
            {sending
              ? "AI 正在回复…"
              : pending
                ? "上一次回复未确认，请重试原问题。"
                : detail.status === "archived"
                  ? "这段对话已归档，可阅读历史记录。"
                  : "可以继续提问。"}
          </p>
          <form
            className={styles.composer}
            onSubmit={(event) => {
              event.preventDefault();
              if (!pending && count > 0 && count <= 4000)
                void send({
                  clientRequestId: crypto.randomUUID(),
                  content: draft.trim(),
                });
            }}
          >
            <label htmlFor="ai-question">你的问题</label>
            <textarea
              id="ai-question"
              ref={input}
              rows={2}
              value={draft}
              disabled={
                !enabled ||
                !!pending ||
                sending ||
                deleting ||
                detail.status !== "active"
              }
              placeholder="输入问题，和 AI 继续聊聊…"
              onChange={(event) => setDraft(event.target.value)}
              aria-describedby="ai-question-count"
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  (event.ctrlKey || event.metaKey) &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className={styles.composerFoot}>
              <span id="ai-question-count">
                {count} / 4000 字
                <span className={styles.shortcut}>
                  {" "}
                  · Ctrl / ⌘ + Enter 发送
                </span>
              </span>
              {pending ? (
                <button
                  type="button"
                  className={member.primary}
                  disabled={!enabled || sending || deleting}
                  onClick={() => void send(pending)}
                >
                  {sending ? "正在回复…" : "重试原问题"}
                </button>
              ) : (
                <button
                  type="submit"
                  className={member.primary}
                  disabled={
                    !enabled ||
                    sending ||
                    deleting ||
                    count < 1 ||
                    count > 4000 ||
                    detail.status !== "active"
                  }
                >
                  发送问题
                </button>
              )}
            </div>
          </form>
          <p className={styles.disclaimer}>
            AI 回答仅供参考，出行与雪况以雪场最新公告为准。
          </p>
        </>
      )}
    </div>
  );
}

function Message({ message }: { message: AiMessage }) {
  return (
    <article
      className={`${styles.message} ${message.role === "user" ? styles.user : ""}`}
    >
      <div className={styles.messageHead}>
        <strong>{message.role === "user" ? "我" : "AI 助手"}</strong>
        <time dateTime={message.createdAt}>
          {formatTime(message.createdAt)}
        </time>
      </div>
      <p>{message.content}</p>
      {!!message.citations.length && (
        <details className={styles.citations}>
          <summary>参考来源（{message.citations.length}）</summary>
          <ul>
            {message.citations.map((citation, index) => {
              const href = citationRoute(citation);
              return (
                <li
                  key={`${citation.sourceType}-${citation.sourceId}-${index}`}
                >
                  {href ? (
                    <Link href={href} target="_blank" rel="noopener noreferrer">
                      {citation.title}（新窗口）
                    </Link>
                  ) : (
                    <strong>{citation.title}</strong>
                  )}
                  {citation.excerpt && (
                    <details>
                      <summary>查看摘录</summary>
                      <p>{citation.excerpt}</p>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </article>
  );
}
function formatTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
