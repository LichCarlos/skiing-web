"use client";
import { AdminParagraph } from "@/components/admin-paragraph";

import { MarkdownContent } from "@common/ui";
import { getPublicContentHref } from "@/platform/config";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, Space, Table, Tag } from "antd";
import { ApiError } from "@common/api-contracts/client";
import type { TableColumnsType } from "antd";
import { routes } from "@/config/routes";
import { apiRequest } from "@/platform/api";
import { RequestLane } from "@/platform/api/request-lane";
import { useSession } from "@/platform/auth/session-provider";
import {
  moderationError,
  dynamicLabels,
  type Moderator,
  type AdminDynamic,
  type AdminComment,
  type CommentPage,
  type ModerationTarget,
} from "@/features/community/moderation-model";
import {
  readDynamic,
  readCommentPage,
} from "@/features/community/moderation-queries";
import {
  ModerationSession,
  ModerationRecovery,
  useModerationWrites,
} from "@/features/community/moderation-session";
import {
  DynamicControls,
  CommentControls,
  ModerationDialog,
} from "@/features/community/moderation-controls";
import styles from "@/features/community/moderation.module.css";
export function AdminDynamicDetail({ dynamicId }: { dynamicId: number }) {
  return (
    <ModerationSession target={String(dynamicId)}>
      {(operator) => (
        <DetailWorkspace operator={operator} dynamicId={dynamicId} />
      )}
    </ModerationSession>
  );
}
function DetailWorkspace({
  operator,
  dynamicId,
}: {
  operator: Moderator;
  dynamicId: number;
}) {
  const { retryRestore } = useSession();
  const writes = useModerationWrites(operator);
  const [dynamic, setDynamic] = useState<AdminDynamic>(),
    [error, setError] = useState<string>();
  const [comments, setComments] = useState<CommentPage>(),
    [commentsError, setCommentsError] = useState<string>();
  const [page, setPage] = useState(1),
    [loading, setLoading] = useState(true),
    [commentsLoading, setCommentsLoading] = useState(true);
  const [deleted, setDeleted] = useState(false),
    [target, setTarget] = useState<ModerationTarget>();
  const [detailLane] = useState(() => new RequestLane()),
    [commentsLane] = useState(() => new RequestLane());
  const context = useRef({ dynamicId, page });
  context.current = { dynamicId, page };
  const [commentKey, setCommentKey] = useState(page);
  const visibleComments = commentKey === page ? comments : undefined;
  const loadDynamic = useCallback(
    async (forReview = false) => {
      if (
        document.visibilityState !== "visible" ||
        context.current.dynamicId !== dynamicId
      )
        return false;
      writes.gate.activate();
      setLoading(true);
      setDynamic(undefined);
      setError(undefined);
      let missing = false;
      const ok = await detailLane.run(
        (signal) => readDynamic(apiRequest, operator, dynamicId, signal),
        setDynamic,
        (cause) => {
          missing = cause instanceof ApiError && cause.status === 404;
          setError(moderationError(cause));
        },
        () => setLoading(false),
      );
      return ok || (forReview && missing);
    },
    [detailLane, operator, dynamicId, writes.gate],
  );
  const loadComments = useCallback(
    async (forReview = false) => {
      if (
        document.visibilityState !== "visible" ||
        context.current.dynamicId !== dynamicId ||
        context.current.page !== page
      )
        return false;
      writes.gate.activate();
      setCommentKey(page);
      setCommentsLoading(true);
      setComments(undefined);
      setCommentsError(undefined);
      let missing = false;
      const ok = await commentsLane.run(
        (signal) =>
          readCommentPage(apiRequest, operator, dynamicId, page, signal),
        setComments,
        (cause) => {
          missing = cause instanceof ApiError && cause.status === 404;
          setCommentsError(moderationError(cause));
        },
        () => setCommentsLoading(false),
      );
      return ok || (forReview && missing);
    },
    [commentsLane, operator, dynamicId, page, writes.gate],
  );
  useEffect(() => {
    void loadDynamic();
    return () => detailLane.cancel();
  }, [detailLane, loadDynamic]);
  useEffect(() => {
    void loadComments();
    return () => commentsLane.cancel();
  }, [commentsLane, loadComments]);
  useEffect(() => {
    const clear = () => {
      detailLane.cancel();
      commentsLane.cancel();
      setDynamic(undefined);
      setComments(undefined);
      setTarget(undefined);
      setLoading(false);
      setCommentsLoading(false);
      setError("页面读取已暂停，请点击刷新重新读取动态");
      setCommentsError("页面读取已暂停，请刷新评论");
    };
    const hide = () => {
      if (document.visibilityState !== "visible") clear();
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", clear);
    hide();
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", clear);
    };
  }, [detailLane, commentsLane]);
  const reload = async () => {
    const detailOk = await loadDynamic(true);
    if (!detailOk) return false;
    return loadComments(true);
  };
  const busy = loading || writes.saving || writes.pending || Boolean(target);
  const columns: TableColumnsType<AdminComment> = [
    { title: "评论", dataIndex: "content", key: "content" },
    { title: "作者", dataIndex: "authorNickname", key: "author" },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: (value: AdminComment["status"]) => (
        <Tag>{value === "visible" ? "可见" : "已隐藏"}</Tag>
      ),
    },
    {
      title: "审核原因",
      dataIndex: "moderationReason",
      key: "reason",
      render: (value: string | null) => value || "—",
    },
    {
      title: "审核人",
      dataIndex: "moderatedByUserId",
      key: "moderator",
      render: (value: number | null) => (value === null ? "—" : `#${value}`),
    },
    {
      title: "审核时间",
      dataIndex: "moderatedAt",
      key: "moderatedAt",
      render: (value: string | null) =>
        value ? new Date(value).toLocaleString("zh-CN") : "—",
    },
    {
      title: "操作",
      key: "actions",
      render: (_, row) => (
        <CommentControls
          item={row}
          page={page}
          disabled={busy || commentsLoading}
          select={setTarget}
        />
      ),
    },
  ];
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>动态与评论审核</h1>
        </div>
        <Link href={routes.dynamics}>返回列表</Link>
      </header>
      <ModerationRecovery operator={operator} writes={writes} reload={reload} />
      <Space wrap>
        <Button
          disabled={writes.saving || Boolean(target) || deleted}
          onClick={() => void loadDynamic()}
        >
          刷新动态
        </Button>
        <Button disabled={writes.saving} onClick={() => void retryRestore()}>
          重新读取身份
        </Button>
      </Space>
      {deleted ? (
        <AdminParagraph role="status">
          动态已确认软删除，请返回列表。
        </AdminParagraph>
      ) : loading ? (
        <AdminParagraph role="status">正在加载动态…</AdminParagraph>
      ) : error ? (
        <section role="alert">
          <AdminParagraph>{error}</AdminParagraph>
          <Button onClick={() => void loadDynamic()}>重试</Button>
        </section>
      ) : dynamic ? (
        <>
          <section className={styles.section}>
            <Space wrap>
              <span>
                #{dynamic.dynamicId} · {dynamic.authorNickname}
              </span>
              <Tag>{dynamicLabels[dynamic.status]}</Tag>
              <span>{new Date(dynamic.createdAt).toLocaleString("zh-CN")}</span>
              {dynamic.resortId ? <span>雪场 #{dynamic.resortId}</span> : null}
            </Space>
            <MarkdownContent
              className={styles.content}
              source={dynamic.content}
              format={dynamic.contentFormat}
              images={Object.fromEntries(
                (dynamic.bodyAssets ?? []).map((a) => [
                  `asset:${a.assetId}`,
                  a.url,
                ]),
              )}
              resolveLink={getPublicContentHref}
            />
            <div className={styles.images}>
              {dynamic.imageUrls.map((url, index) => (
                <img
                  key={`${index}:${url}`}
                  src={url}
                  alt={`动态图片${index + 1}`}
                />
              ))}
            </div>
            <AdminParagraph>
              审核原因：{dynamic.moderationReason || "—"} · 审核人：
              {dynamic.moderatedByUserId === null
                ? "—"
                : `#${dynamic.moderatedByUserId}`}{" "}
              · 审核时间：
              {dynamic.moderatedAt
                ? new Date(dynamic.moderatedAt).toLocaleString("zh-CN")
                : "—"}
            </AdminParagraph>
            <DynamicControls
              item={dynamic}
              disabled={busy}
              select={setTarget}
            />
          </section>
          <section className={styles.section}>
            <h2>评论审核（包含隐藏评论）</h2>
            <Button
              disabled={writes.saving || Boolean(target)}
              onClick={() => void loadComments()}
            >
              刷新评论
            </Button>
            {commentsError ? (
              <section role="alert">
                <AdminParagraph>{commentsError}</AdminParagraph>
                <Button onClick={() => void loadComments()}>重试评论</Button>
              </section>
            ) : (
              <div className={styles.table}>
                <Table
                  rowKey="commentId"
                  columns={columns}
                  dataSource={visibleComments?.items ?? []}
                  loading={commentsLoading}
                  locale={{ emptyText: "暂无评论" }}
                  pagination={{
                    current: page,
                    pageSize: 20,
                    total: visibleComments?.total ?? 0,
                    disabled: writes.saving || Boolean(target),
                    onChange: setPage,
                    showSizeChanger: false,
                  }}
                />
              </div>
            )}
            {!commentsLoading &&
            !commentsError &&
            visibleComments?.items.length === 0 &&
            page > 1 ? (
              <Button onClick={() => setPage((value) => value - 1)}>
                返回上一页评论
              </Button>
            ) : null}
          </section>
        </>
      ) : null}
      {target ? (
        <ModerationDialog
          operator={operator}
          target={target}
          writes={writes}
          close={() => setTarget(undefined)}
          committed={(current) => {
            if (current.kind === "dynamic" && current.action === "delete") {
              detailLane.cancel();
              commentsLane.cancel();
              setDeleted(true);
              setDynamic(undefined);
              setComments(undefined);
            } else if (current.kind === "dynamic") void loadDynamic();
            else void loadComments();
          }}
        />
      ) : null}
    </main>
  );
}
