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
import { projectKnowledgeEditRoute, routes } from "@/config/routes";
import {
  KnowledgeSession,
  KnowledgeRecovery,
  useKnowledgeWrites,
} from "@/features/project-knowledge/knowledge-session";
import {
  readKnowledgePage,
  prepareKnowledgeCommand,
  sendKnowledgeCommand,
} from "@/features/project-knowledge/knowledge-queries";
import {
  knowledgeError,
  canManageKnowledge,
  type Knowledge,
  type KnowledgeOperator,
  type KnowledgeCommand,
  type KnowledgePage,
} from "@/features/project-knowledge/knowledge-model";
import styles from "@/features/project-knowledge/knowledge-console.module.css";
const labels: Record<Knowledge["status"], string> = {
  draft: "草稿",
  published: "已发布",
  withdrawn: "已撤回",
};
export default function KnowledgeConsole() {
  return (
    <KnowledgeSession target="list">
      {(operator) => <KnowledgeWorkspace operator={operator} />}
    </KnowledgeSession>
  );
}
function KnowledgeWorkspace({ operator }: { operator: KnowledgeOperator }) {
  const { message } = App.useApp(),
    { retryRestore } = useSession();
  const writes = useKnowledgeWrites(operator);
  const [page, setPage] = useState(1),
    [input, setInput] = useState(""),
    [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<Knowledge["status"]>();
  const [data, setData] = useState<KnowledgePage>(),
    [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true),
    [attempt, setAttempt] = useState(0);
  const [lane] = useState(() => new RequestLane());
  const key = JSON.stringify([page, keyword, status]);
  const context = useRef(key);
  context.current = key;
  const [dataKey, setDataKey] = useState(key);
  const visibleData = dataKey === key ? data : undefined;
  const load = useCallback(async () => {
    if (document.visibilityState !== "visible" || context.current !== key)
      return false;
    writes.gate.activate();
    setDataKey(key);
    setLoading(true);
    setData(undefined);
    setError(undefined);
    return lane.run(
      (signal) =>
        readKnowledgePage(
          apiRequest,
          operator,
          { page, keyword, status },
          signal,
        ),
      setData,
      (cause) => setError(knowledgeError(cause)),
      () => setLoading(false),
    );
  }, [lane, operator, page, keyword, status, key, writes.gate]);
  useEffect(() => {
    void load();
    return () => lane.cancel();
  }, [lane, load, attempt]);
  useEffect(() => {
    const clear = () => {
      lane.cancel();
      setData(undefined);
      setInput("");
      setLoading(false);
      setError("页面读取已暂停，请点击刷新重新读取项目知识");
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
  async function command(row: Knowledge, action: KnowledgeCommand) {
    if (
      document.visibilityState !== "visible" ||
      context.current !== key ||
      !writes.gate.isActive() ||
      busy ||
      writes.gate.isLocked() ||
      !canManageKnowledge(operator, action)
    )
      return;
    await writes.run(
      { action, projectKnowledgeId: row.projectKnowledgeId },
      (signal) =>
        prepareKnowledgeCommand(
          apiRequest,
          operator,
          row.projectKnowledgeId,
          action,
          row.version,
          signal,
        ),
      (id, signal) => sendKnowledgeCommand(apiRequest, id, action, signal),
      () => {
        message.success(
          action === "publish"
            ? "项目知识已发布"
            : action === "withdraw"
              ? "项目知识已撤回，索引将异步同步"
              : "项目知识已软删除",
        );
        void load();
      },
    );
  }
  const columns: TableColumnsType<Knowledge> = [
    { title: "标题", dataIndex: "title", key: "title" },
    { title: "分类", dataIndex: "category", key: "category" },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: (value: Knowledge["status"]) => (
        <Tag
          color={
            value === "published"
              ? "green"
              : value === "draft"
                ? "gold"
                : "default"
          }
        >
          {labels[value]}
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
          {canManageKnowledge(operator, "update") ? (
            busy ? (
              <span>编辑</span>
            ) : (
              <Link href={projectKnowledgeEditRoute(row.projectKnowledgeId)}>
                编辑
              </Link>
            )
          ) : null}
          {(
            [
              row.status === "published" ? "withdraw" : "publish",
              "delete",
            ] as KnowledgeCommand[]
          )
            .filter((action) => canManageKnowledge(operator, action))
            .map((action) => (
              <Popconfirm
                key={action}
                disabled={busy}
                title={
                  action === "delete"
                    ? "确认软删除项目知识并停用RAG来源？"
                    : action === "publish"
                      ? "确认发布已保存的项目知识？"
                      : "确认撤回并停用对应RAG来源？"
                }
                onConfirm={() => command(row, action)}
              >
                <Button
                  type="link"
                  danger={action !== "publish"}
                  disabled={busy}
                >
                  {action === "delete"
                    ? "删除"
                    : action === "publish"
                      ? "发布"
                      : "撤回"}
                </Button>
              </Popconfirm>
            ))}
        </Space>
      ),
    },
  ];
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>项目知识</h1>
          <span>平台说明、FAQ与公开RAG来源</span>
        </div>
        {canManageKnowledge(operator, "create") ? (
          <Button
            type="primary"
            disabled={busy}
            href={busy ? undefined : getPageHref(routes.newProjectKnowledge)}
          >
            新建项目知识
          </Button>
        ) : null}
      </header>
      <KnowledgeRecovery operator={operator} writes={writes} reload={load} />
      <Space wrap className={styles.filters}>
        <ControlHint hint="选填，按项目知识关键词查询，最多100字。">
          <Input.Search
            className={styles.search}
            value={input}
            maxLength={100}
            allowClear
            disabled={writes.saving}
            onChange={(event) => setInput(event.target.value)}
            onSearch={(value) => {
              if (writes.saving) return;
              setKeyword(value.trim());
              setPage(1);
              setAttempt((value) => value + 1);
            }}
            placeholder="搜索标题或正文"
          />
        </ControlHint>
        <ControlHint hint="选填，按知识发布状态筛选；清空表示全部状态。">
          <Select<Knowledge["status"]>
            value={status}
            allowClear
            disabled={writes.saving}
            placeholder="全部状态"
            style={{ width: 150 }}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            options={Object.entries(labels).map(([value, label]) => ({
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
            rowKey="projectKnowledgeId"
            columns={columns}
            loading={loading}
            dataSource={visibleData?.items ?? []}
            pagination={{
              current: page,
              pageSize: 20,
              total: visibleData?.total ?? 0,
              disabled: writes.saving,
              onChange: setPage,
              showSizeChanger: false,
            }}
            locale={{ emptyText: "暂无符合条件的项目知识" }}
          />
        </div>
      )}
      {!loading && !error && visibleData?.items.length === 0 && page > 1 ? (
        <Button onClick={() => setPage((value) => value - 1)}>
          返回上一页
        </Button>
      ) : null}
    </main>
  );
}
