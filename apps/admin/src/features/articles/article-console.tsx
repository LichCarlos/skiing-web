"use client";
import { ControlHint } from "@/components/control-hint";

import { AdminParagraph } from "@/components/admin-paragraph";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  App,
  Button,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import type { TableColumnsType } from "antd";
import { apiRequest } from "@/platform/api";
import { getPageHref } from "@/platform/config";
import { RequestLane } from "@/platform/api/request-lane";
import { useSession } from "@/platform/auth/session-provider";
import { adminArticleEditRoute, routes } from "@/config/routes";
import {
  ArticleSession,
  ArticleRecovery,
  useArticleWrites,
} from "@/features/articles/article-session";
import {
  readArticlePage,
  prepareArticleCommand,
  sendArticleCommand,
} from "@/features/articles/article-queries";
import {
  articleError,
  type ArticleCommand,
  type ArticleOperator,
  type ArticlePage,
  type ArticleStatus,
  type ArticleListItem,
} from "@/features/articles/article-model";
import styles from "@/features/articles/article-console.module.css";

const statusLabels: Record<ArticleStatus, string> = {
  draft: "草稿",
  published: "已发布",
  withdrawn: "已撤回",
};
export default function ArticleConsole() {
  return (
    <ArticleSession target="list">
      {(operator) => <ArticleWorkspace operator={operator} />}
    </ArticleSession>
  );
}
function ArticleWorkspace({ operator }: { operator: ArticleOperator }) {
  const { message } = App.useApp();
  const { retryRestore } = useSession();
  const writes = useArticleWrites(operator);
  const [page, setPage] = useState(1),
    [input, setInput] = useState(""),
    [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<ArticleStatus>();
  const [result, setResult] = useState<ArticlePage>();
  const [loading, setLoading] = useState(true),
    [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [lane] = useState(() => new RequestLane());
  const context = useRef({ operator, page, keyword, status });
  context.current = { operator, page, keyword, status };
  const load = useCallback(async () => {
    const current = context.current;
    if (
      document.visibilityState !== "visible" ||
      current.operator !== operator ||
      current.page !== page ||
      current.keyword !== keyword ||
      current.status !== status
    )
      return false;
    writes.gate.activate();
    setLoading(true);
    setError(undefined);
    setResult(undefined);
    return lane.run(
      (signal) =>
        readArticlePage(
          apiRequest,
          operator,
          { page, keyword, status },
          signal,
        ),
      setResult,
      (cause) => setError(articleError(cause)),
      () => setLoading(false),
    );
  }, [lane, operator, page, keyword, status, writes.gate]);
  useEffect(() => {
    void load();
    return () => lane.cancel();
  }, [lane, load, attempt]);
  useEffect(() => {
    const clear = () => {
      lane.cancel();
      setResult(undefined);
      setInput("");
      setLoading(false);
      setError("页面读取已暂停，请点击刷新重新读取文章");
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
  }, [lane]);
  const busy = loading || writes.saving || writes.pending;
  async function command(
    id: number,
    action: ArticleCommand,
    expectedVersion: number,
  ) {
    if (
      busy ||
      writes.gate.isLocked() ||
      document.visibilityState !== "visible"
    )
      return;
    await writes.run(
      { action, articleId: id },
      (signal) =>
        prepareArticleCommand(
          apiRequest,
          operator,
          id,
          action,
          signal,
          expectedVersion,
        ),
      (articleId, signal) =>
        sendArticleCommand(apiRequest, articleId, action, signal),
      () => {
        message.success(
          action === "publish"
            ? "文章已发布"
            : action === "withdraw"
              ? "文章已撤回"
              : "文章已删除",
        );
        void load();
      },
    );
  }
  const columns: TableColumnsType<ArticleListItem> = [
    {
      title: "文章",
      key: "article",
      render: (_, row) => (
        <>
          <strong>{row.title}</strong>
          <div>{row.summary}</div>
        </>
      ),
    },
    { title: "分类", dataIndex: ["category", "label"], key: "category" },
    {
      title: "作者",
      dataIndex: "authorName",
      key: "authorName",
      render: (value: string | null) => value ?? "未填写",
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: (value: ArticleStatus) => (
        <Tag
          color={
            value === "published"
              ? "green"
              : value === "draft"
                ? "gold"
                : "default"
          }
        >
          {statusLabels[value]}
        </Tag>
      ),
    },
    {
      title: "发布时间",
      dataIndex: "publishTime",
      key: "publishTime",
      render: (value: string | null) =>
        value ? new Date(value).toLocaleString("zh-CN") : "—",
    },
    { title: "版本", dataIndex: "version", key: "version" },
    {
      title: "操作",
      key: "actions",
      render: (_, row) => (
        <Space wrap>
          {busy ? (
            <span>编辑</span>
          ) : (
            <Link href={adminArticleEditRoute(row.articleId)}>编辑</Link>
          )}
          {(["draft", "withdrawn"].includes(row.status)
            ? ["publish"]
            : ["withdraw"]
          )
            .concat("delete")
            .map((value) => {
              const action = value as ArticleCommand;
              return (
                <Popconfirm
                  key={action}
                  disabled={busy}
                  title={
                    action === "delete"
                      ? "确认软删除文章并停用索引？"
                      : action === "withdraw"
                        ? "确认撤回已保存内容并停用公开检索？"
                        : "确认发布已保存内容？"
                  }
                  onConfirm={() => command(row.articleId, action, row.version)}
                >
                  <Button
                    type="link"
                    danger={action !== "publish"}
                    disabled={busy}
                  >
                    {action === "delete"
                      ? "删除"
                      : action === "withdraw"
                        ? "撤回"
                        : "发布"}
                  </Button>
                </Popconfirm>
              );
            })}
        </Space>
      ),
    },
  ];
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>知识文章</h1>
          <span>滑雪知识内容及发布状态</span>
        </div>
        <Button
          type="primary"
          href={busy ? undefined : getPageHref(routes.newArticle)}
          disabled={busy}
        >
          新建文章
        </Button>
      </header>
      <ArticleRecovery operator={operator} writes={writes} reload={load} />
      <Space wrap className={styles.filters}>
        <ControlHint hint="选填，按文章关键词查询，最多100字。">
          <Input.Search
            value={input}
            maxLength={100}
            onChange={(event) => setInput(event.target.value)}
            onSearch={(value) => {
              if (writes.saving) return;
              setKeyword(value.trim());
              setPage(1);
              setAttempt((value) => value + 1);
            }}
            disabled={writes.saving}
            placeholder="搜索标题或摘要"
            allowClear
            className={styles.search}
          />
        </ControlHint>
        <ControlHint hint="选填，按文章发布状态筛选；清空表示全部状态。">
          <Select<ArticleStatus>
            allowClear
            value={status}
            disabled={writes.saving}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            placeholder="全部状态"
            style={{ width: 150 }}
            options={Object.entries(statusLabels).map(([value, label]) => ({
              value,
              label,
            }))}
          />
        </ControlHint>
        <Button disabled={writes.saving} onClick={() => void load()}>
          刷新
        </Button>
        <Button disabled={writes.saving} onClick={() => void retryRestore()}>
          重新读取身份
        </Button>
      </Space>
      {error ? (
        <section role="alert" className={styles.alert}>
          <AdminParagraph>{error}</AdminParagraph>
          <Button onClick={() => void load()}>重试</Button>
        </section>
      ) : (
        <div className={styles.table}>
          <Table
            rowKey="articleId"
            loading={loading}
            columns={columns}
            dataSource={result?.items ?? []}
            pagination={{
              current: page,
              pageSize: 20,
              total: result?.total ?? 0,
              disabled: writes.saving,
              onChange: setPage,
              showSizeChanger: false,
            }}
            locale={{ emptyText: "暂无符合条件的文章" }}
          />
        </div>
      )}
      {!loading && !error && result?.items.length === 0 && page > 1 ? (
        <Button onClick={() => setPage((value) => value - 1)}>
          返回上一页
        </Button>
      ) : null}
    </main>
  );
}
