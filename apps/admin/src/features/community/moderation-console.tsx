"use client";
import { ControlHint } from "@/components/control-hint";

import { AdminParagraph } from "@/components/admin-paragraph";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, Input, Select, Space, Table, Tag } from "antd";
import type { TableColumnsType } from "antd";
import { adminDynamicRoute, routes } from "@/config/routes";
import { apiRequest } from "@/platform/api";
import { RequestLane } from "@/platform/api/request-lane";
import { useSession } from "@/platform/auth/session-provider";
import {
  moderationError,
  dynamicLabels,
  type Moderator,
  type AdminDynamic,
  type DynamicPage,
  type ModerationTarget,
} from "@/features/community/moderation-model";
import { readDynamicPage } from "@/features/community/moderation-queries";
import {
  ModerationSession,
  ModerationRecovery,
  useModerationWrites,
} from "@/features/community/moderation-session";
import {
  DynamicControls,
  ModerationDialog,
} from "@/features/community/moderation-controls";
import styles from "@/features/community/moderation.module.css";
export default function ModerationConsole() {
  return (
    <ModerationSession target="list">
      {(operator) => <ModerationWorkspace operator={operator} />}
    </ModerationSession>
  );
}
function ModerationWorkspace({ operator }: { operator: Moderator }) {
  const { retryRestore } = useSession();
  const writes = useModerationWrites(operator);
  const [input, setInput] = useState(""),
    [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1),
    [status, setStatus] = useState<AdminDynamic["status"]>();
  const [data, setData] = useState<DynamicPage>(),
    [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true),
    [attempt, setAttempt] = useState(0);
  const [target, setTarget] = useState<ModerationTarget>();
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
        readDynamicPage(
          apiRequest,
          operator,
          { page, keyword, status },
          signal,
        ),
      setData,
      (cause) => setError(moderationError(cause)),
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
      setTarget(undefined);
      setInput("");
      setLoading(false);
      setError("页面读取已暂停，请点击刷新重新读取社区内容");
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
  const busy = loading || writes.saving || writes.pending || Boolean(target);
  const columns: TableColumnsType<AdminDynamic> = [
    {
      title: "动态正文",
      dataIndex: "content",
      key: "content",
      render: (value: string, row) => (
        <Link href={adminDynamicRoute(row.dynamicId)}>
          {value.slice(0, 100)}
          {value.length > 100 ? "…" : ""}
        </Link>
      ),
    },
    { title: "作者", dataIndex: "authorNickname", key: "author" },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: (value: AdminDynamic["status"]) => (
        <Tag>{dynamicLabels[value]}</Tag>
      ),
    },
    {
      title: "提交时间",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (value: string) => new Date(value).toLocaleString("zh-CN"),
    },
    {
      title: "审核原因",
      dataIndex: "moderationReason",
      key: "reason",
      render: (value: string | null) => value || "—",
    },
    {
      title: "操作",
      key: "actions",
      render: (_, row) => (
        <Space wrap>
          <Link href={adminDynamicRoute(row.dynamicId)}>详情 / 评论</Link>
          <DynamicControls item={row} disabled={busy} select={setTarget} />
        </Space>
      ),
    },
  ];
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>社区审核</h1>
        </div>
        <Link href={routes.admin}>返回工作台</Link>
      </header>
      <ModerationRecovery operator={operator} writes={writes} reload={load} />
      <Space wrap className={styles.filters}>
        <ControlHint hint="选填，按动态内容关键词查询，最多100字。">
          <Input.Search
            className={styles.search}
            value={input}
            maxLength={100}
            allowClear
            disabled={writes.saving || Boolean(target)}
            onChange={(event) => setInput(event.target.value)}
            onSearch={(value) => {
              if (writes.saving || target) return;
              setKeyword(value.trim());
              setPage(1);
              setAttempt((value) => value + 1);
            }}
            placeholder="搜索动态正文"
          />
        </ControlHint>
        <ControlHint hint="选填，按动态审核状态筛选；清空表示全部状态。">
          <Select<AdminDynamic["status"]>
            value={status}
            allowClear
            disabled={writes.saving || Boolean(target)}
            placeholder="全部状态"
            style={{ width: 150 }}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            options={Object.entries(dynamicLabels).map(([value, label]) => ({
              value,
              label,
            }))}
          />
        </ControlHint>
        <Button
          disabled={writes.saving || Boolean(target)}
          onClick={() => void load()}
        >
          刷新
        </Button>
        <Button disabled={writes.saving} onClick={() => void retryRestore()}>
          重新读取身份
        </Button>
      </Space>
      {error ? (
        <section role="alert">
          <AdminParagraph>{error}</AdminParagraph>
          <Button onClick={() => void load()}>重试</Button>
        </section>
      ) : (
        <div className={styles.table}>
          <Table
            rowKey="dynamicId"
            columns={columns}
            loading={loading}
            dataSource={visibleData?.items ?? []}
            locale={{ emptyText: "暂无符合条件的动态" }}
            pagination={{
              current: page,
              pageSize: 20,
              total: visibleData?.total ?? 0,
              disabled: writes.saving || Boolean(target),
              onChange: setPage,
              showSizeChanger: false,
            }}
          />
        </div>
      )}
      {!loading && !error && visibleData?.items.length === 0 && page > 1 ? (
        <Button onClick={() => setPage((value) => value - 1)}>
          返回上一页
        </Button>
      ) : null}
      {target ? (
        <ModerationDialog
          operator={operator}
          target={target}
          writes={writes}
          close={() => setTarget(undefined)}
          committed={() => void load()}
        />
      ) : null}
    </main>
  );
}
