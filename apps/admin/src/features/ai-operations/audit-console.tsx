"use client";
import { FormHint } from "@/components/form-hint";
import { AdminParagraph } from "@/components/admin-paragraph";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Select,
  Table,
} from "antd";
import { apiRequest } from "@/platform/api";
import { RequestLane } from "@/platform/api/request-lane";
import { conversationAuditRoute, routes } from "@/config/routes";
import { AiOperationSession } from "@/features/ai-operations/session";
import styles from "@/features/ai-operations/console.module.css";
import filterStyles from "@/styles/console.module.css";
import {
  operationError,
  type AuditPage,
  type AuditSummary,
  type Operator,
} from "@/features/ai-operations/api";
import { auditMetadataItems } from "@/features/ai-operations/audit-model";
import {
  readAuditPage,
  readAuditSummary,
  readAuditContent,
  type AuditFilters as Filters,
} from "@/features/ai-operations/audit-queries";
import {
  AuditContentSession,
  type AuditContentState,
} from "@/features/ai-operations/audit-content-session";
export function AuditConsole({ id }: { id?: string }) {
  return (
    <AiOperationSession kind="audit" target={`audit:${id ?? "list"}`}>
      {(operator) =>
        id ? (
          <AuditDetail operator={operator} id={id} />
        ) : (
          <AuditList operator={operator} />
        )
      }
    </AiOperationSession>
  );
}
function AuditList({ operator }: { operator: Operator }) {
  const [query, setQuery] = useState({
    page: 1,
    pageSize: 20,
    filters: {} as Filters,
  });
  const [data, setData] = useState<AuditPage>(),
    [loading, setLoading] = useState(false),
    [error, setError] = useState<string>();
  const [lane] = useState(() => new RequestLane());
  const load = useCallback(() => {
    setLoading(true);
    setData(undefined);
    setError(undefined);
    void lane.run(
      (signal) =>
        readAuditPage(
          apiRequest,
          operator,
          query.filters,
          query.page,
          query.pageSize,
          signal,
        ),
      setData,
      (cause) => setError(operationError(cause)),
      () => setLoading(false),
    );
  }, [lane, operator, query]);
  useEffect(() => {
    load();
    return () => lane.cancel();
  }, [load, lane]);
  return (
    <section className={styles.page}>
      <header>
        <h1>AI 会话审计</h1>
        <AdminParagraph>
          默认只显示授权用户范围内的最少元数据，不显示标题、账号、消息正文或模型信息。包含仍保留的软删除会话；时间按更新时间筛选，含起止时刻。
        </AdminParagraph>
      </header>
      <Form
        layout="vertical"
        className={filterStyles.queryForm}
        aria-label="AI 会话审计筛选"
        onFinish={(filters: Filters) =>
          setQuery({ page: 1, pageSize: 20, filters })
        }
      >
        <Form.Item
          name="userId"
          label="用户 ID"
          extra={
            <FormHint>
              选填，填写1至2147483647的用户ID；留空查询获授权范围内全部用户。
            </FormHint>
          }
        >
          <InputNumber min={1} max={2147483647} precision={0} />
        </Form.Item>
        <Form.Item
          name="status"
          label="状态"
          extra={
            <FormHint>
              选填，筛选正常或已软删除的会话；清空表示全部状态。
            </FormHint>
          }
        >
          <Select
            allowClear
            placeholder="全部状态"
            options={[
              { value: "active", label: "正常" },
              { value: "deleted", label: "已软删除" },
            ]}
          />
        </Form.Item>
        <Form.Item
          name="fromTime"
          label="起始时间"
          extra={
            <FormHint>
              选填，按当前电脑时区选择起始时间，精确到秒；应早于结束时间。
            </FormHint>
          }
        >
          <Input type="datetime-local" step={1} />
        </Form.Item>
        <Form.Item
          name="toTime"
          label="结束时间"
          extra={
            <FormHint>
              选填，按当前电脑时区选择结束时间，精确到秒；应晚于起始时间。
            </FormHint>
          }
        >
          <Input type="datetime-local" step={1} />
        </Form.Item>
        <div className={filterStyles.queryActions}>
          <Button type="primary" htmlType="submit">
            查询
          </Button>
          <Button onClick={load}>刷新</Button>
        </div>
      </Form>
      {error ? <Alert role="alert" type="error" title={error} /> : null}
      <Table<AuditSummary>
        loading={loading}
        rowKey="conversationId"
        dataSource={data?.items ?? []}
        pagination={{
          current: query.page,
          pageSize: query.pageSize,
          total: data?.total ?? 0,
          onChange: (page, pageSize) =>
            setQuery({
              ...query,
              page: pageSize === query.pageSize ? page : 1,
              pageSize,
            }),
        }}
        columns={[
          {
            title: "会话 ID",
            render: (_, item) => (
              <Link href={conversationAuditRoute(item.conversationId)}>
                {item.conversationId}
              </Link>
            ),
          },
          { title: "用户 ID", dataIndex: "userId" },
          {
            title: "状态",
            dataIndex: "status",
            render: (value: string) =>
              value === "deleted" ? "已软删除" : "正常",
          },
          { title: "已持久化消息数", dataIndex: "messageCount" },
          { title: "创建时间", dataIndex: "createdAt" },
          { title: "更新时间", dataIndex: "updatedAt" },
          { title: "软删除时间", dataIndex: "deletedAt" },
        ]}
      />
    </section>
  );
}
function AuditDetail({ operator, id }: { operator: Operator; id: string }) {
  const [metadata, setMetadata] = useState<AuditSummary>();
  const [reason, setReason] = useState(""),
    [error, setError] = useState<string>(),
    [loading, setLoading] = useState(false);
  const [contentState, setContentState] = useState<AuditContentState>({
    busy: false,
  });
  const [contentSession] = useState(
    () =>
      new AuditContentSession(
        (reason, signal) =>
          readAuditContent(apiRequest, operator, id, reason, signal),
        (state) => {
          setContentState(state);
          if (state.content) setReason("");
        },
      ),
  );
  const content = contentState.content,
    reading = contentState.busy;
  const [lane] = useState(() => new RequestLane());
  const canRead = operator.permissionKeys.includes(
    "system:ai-conversation:read-content",
  );
  const clearContent = useCallback(() => {
    contentSession.clear();
  }, [contentSession]);
  const load = useCallback(() => {
    clearContent();
    setMetadata(undefined);
    setError(undefined);
    setLoading(true);
    void lane.run(
      (signal) => readAuditSummary(apiRequest, operator, id, signal),
      setMetadata,
      (cause) => setError(operationError(cause)),
      () => setLoading(false),
    );
  }, [clearContent, lane, operator, id]);
  useEffect(() => {
    load();
    return () => {
      lane.cancel();
    };
  }, [load, lane]);
  useEffect(() => {
    const deactivate = contentSession.activate(
      document.visibilityState === "visible",
    );
    const hide = () => {
      contentSession.setVisible(document.visibilityState === "visible");
    };
    const pageHide = () => contentSession.setVisible(false);
    const pageShow = () =>
      contentSession.setVisible(document.visibilityState === "visible");
    window.addEventListener("pagehide", pageHide);
    window.addEventListener("pageshow", pageShow);
    document.addEventListener("visibilitychange", hide);
    return () => {
      deactivate();
      window.removeEventListener("pagehide", pageHide);
      window.removeEventListener("pageshow", pageShow);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [contentSession]);
  function read() {
    if (!metadata || loading || !canRead) return;
    setError(undefined);
    void contentSession.read(reason);
  }
  return (
    <section className={styles.page}>
      <Link href={routes.aiConversationAudits}>返回会话列表</Link>
      <h1>AI 会话审计详情</h1>
      <AdminParagraph>
        正文只在本页面内存中临时展示，不持久化、不缓存。切换账号、离开页面或页面隐藏时清除；每次读取均须独立填写原因并记录审计。没有删除、恢复或导出功能。
      </AdminParagraph>
      <Button loading={loading} disabled={reading} onClick={load}>
        重新加载元数据并清除正文
      </Button>
      {error || contentState.error ? (
        <Alert role="alert" type="error" title={error ?? contentState.error} />
      ) : null}
      {metadata ? (
        <Descriptions
          bordered
          column={1}
          items={auditMetadataItems(metadata)}
        />
      ) : null}
      {metadata && canRead ? (
        <section>
          <label htmlFor="ai-audit-reason">读取正文原因（1–500字）</label>
          <Input.TextArea
            id="ai-audit-reason"
            aria-describedby="ai-audit-hint"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={reading}
            maxLength={1000}
          />
          <FormHint id="ai-audit-hint">
            必填，去除首尾空格后1–500字；说明读取会话正文的业务原因，本次读取会记录审计。
          </FormHint>
          <Button
            disabled={reading || loading}
            loading={reading}
            onClick={() => void read()}
          >
            记录审计并读取正文
          </Button>
          <Button onClick={clearContent}>清除已读取正文</Button>
        </section>
      ) : metadata ? (
        <AdminParagraph>未获独立正文读取权限，仅可查看元数据。</AdminParagraph>
      ) : null}
      {content ? (
        <section aria-label="经审计读取的消息">
          <h2>已持久化消息</h2>
          {content.messages.length === 0 ? (
            <AdminParagraph>暂无消息</AdminParagraph>
          ) : (
            content.messages.map((item) => (
              <article key={item.messageId}>
                <h3>
                  {item.sender} · #{item.messageId}
                </h3>
                <AdminParagraph>
                  {item.createdAt} · {item.generationStatus ?? "未设置生成状态"}
                </AdminParagraph>
                <pre
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                >
                  {item.content}
                </pre>
                <details>
                  <summary>已存引用</summary>
                  <pre
                    style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                  >
                    {JSON.stringify(item.citations, null, 2)}
                  </pre>
                </details>
              </article>
            ))
          )}
        </section>
      ) : null}
    </section>
  );
}
