"use client";
import { FormHint } from "@/components/form-hint";
import { AdminParagraph } from "@/components/admin-paragraph";

import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  Alert,
  Button,
  Descriptions,
  Form,
  Input,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import { apiRequest } from "@/platform/api";
import { RequestLane } from "@/platform/api/request-lane";
import { routes, ragSourceRoute } from "@/config/routes";
import { AiOperationSession } from "@/features/ai-operations/session";
import styles from "@/features/ai-operations/console.module.css";
import filterStyles from "@/styles/console.module.css";
import {
  operationError,
  type Operator,
  type RagSource,
  type RagSourcePage,
} from "@/features/ai-operations/api";
import {
  readRagPage,
  readRagSource,
  type RagFilters,
} from "@/features/ai-operations/rag-queries";
import {
  RagCommandSession,
  ragRecoveryLedger,
  type RagWriteState,
} from "@/features/ai-operations/rag-workflow";
const statuses = {
  pending: "等待索引",
  indexed: "已索引",
  failed: "索引失败",
  disabled: "已停用",
};
const types = {
  resort: "雪场",
  article: "滑雪知识",
  project_doc: "项目知识",
  dynamic: "社区动态",
  dictionary: "公开字典",
};
export function RagConsole({ id }: { id?: number }) {
  return (
    <AiOperationSession kind="rag" target={`rag:${id ?? "list"}`}>
      {(operator) =>
        id ? (
          <RagDetail operator={operator} id={id} />
        ) : (
          <RagList operator={operator} />
        )
      }
    </AiOperationSession>
  );
}
function RagList({ operator }: { operator: Operator }) {
  const [query, setQuery] = useState({
    page: 1,
    pageSize: 20,
    filters: {} as RagFilters,
  });
  const [data, setData] = useState<RagSourcePage>(),
    [loading, setLoading] = useState(false),
    [error, setError] = useState<string>();
  const [lane] = useState(() => new RequestLane());
  const load = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    setLoading(true);
    setData(undefined);
    setError(undefined);
    void lane.run(
      (signal) =>
        readRagPage(
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
    const hide = () => {
      if (document.visibilityState !== "visible") {
        lane.cancel();
        setData(undefined);
        setLoading(false);
      }
    };
    const leave = () => {
      lane.cancel();
      setData(undefined);
      setLoading(false);
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", leave);
    return () => {
      lane.cancel();
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", leave);
    };
  }, [load, lane]);
  return (
    <section className={styles.page}>
      <header>
        <h1>RAG 来源运维</h1>
        <AdminParagraph>
          仅显示已有索引记录；首次发现来源需运行受控 rag:reindex
          CLI。已受理不代表索引完成，刷新可读取处理结果。
        </AdminParagraph>
      </header>
      <Form
        layout="vertical"
        className={filterStyles.queryForm}
        aria-label="RAG 来源筛选"
        onFinish={(filters: RagFilters) =>
          setQuery({ page: 1, pageSize: 20, filters })
        }
      >
        <Form.Item
          name="keyword"
          label="关键词"
          extra={<FormHint>选填，输入来源关键词，最多100字。</FormHint>}
        >
          <Input maxLength={100} />
        </Form.Item>
        <Form.Item
          name="sourceType"
          label="类型"
          extra={
            <FormHint>选填，按知识来源类型筛选；清空表示全部类型。</FormHint>
          }
        >
          <Select
            allowClear
            placeholder="全部类型"
            options={Object.entries(types).map(([value, label]) => ({
              value,
              label,
            }))}
          />
        </Form.Item>
        <Form.Item
          name="status"
          label="索引状态"
          extra={
            <FormHint>选填，按索引处理状态筛选；清空表示全部状态。</FormHint>
          }
        >
          <Select
            allowClear
            placeholder="全部状态"
            options={Object.entries(statuses).map(([value, label]) => ({
              value,
              label,
            }))}
          />
        </Form.Item>
        <Form.Item
          name="manualDisabled"
          label="人工停用"
          extra={
            <FormHint>
              选填，筛选是否人工停用；清空表示两种状态均包含。
            </FormHint>
          }
        >
          <Select
            allowClear
            placeholder="全部"
            options={[
              { value: "true", label: "已人工停用" },
              { value: "false", label: "未人工停用" },
            ]}
          />
        </Form.Item>
        <div className={filterStyles.queryActions}>
          <Button type="primary" htmlType="submit">
            查询
          </Button>
          <Button onClick={load}>刷新</Button>
        </div>
      </Form>
      {error ? <Alert role="alert" type="error" title={error} /> : null}
      <Table<RagSource>
        loading={loading}
        rowKey="ragDocumentId"
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
          { title: "ID", dataIndex: "ragDocumentId" },
          {
            title: "来源",
            render: (_, item) => (
              <Link href={ragSourceRoute(item.ragDocumentId)}>
                {item.title}
              </Link>
            ),
          },
          {
            title: "类型",
            dataIndex: "sourceType",
            render: (type: keyof typeof types) => types[type],
          },
          {
            title: "状态",
            dataIndex: "status",
            render: (status: keyof typeof statuses) => statuses[status],
          },
          {
            title: "人工停用",
            dataIndex: "manualDisabled",
            render: (value: boolean) => (value ? "是" : "否"),
          },
          {
            title: "当前可检索资格",
            dataIndex: "sourceEligible",
            render: (value: boolean) => (value ? "满足" : "不满足"),
          },
          { title: "分块", dataIndex: "chunkCount" },
          { title: "版本", dataIndex: "controlVersion" },
        ]}
      />
    </section>
  );
}
function RagDetail({ operator, id }: { operator: Operator; id: number }) {
  const [source, setSource] = useState<RagSource>(),
    [loading, setLoading] = useState(false),
    [error, setError] = useState<string>(),
    [notice, setNotice] = useState<string>();
  const [reason, setReason] = useState(""),
    [write, setWrite] = useState<RagWriteState>({ busy: false }),
    [readVersion, setReadVersion] = useState<number>();
  const [lane] = useState(() => new RequestLane());
  const [ledger] = useState(ragRecoveryLedger);
  const ledgerVersion = useSyncExternalStore(
    ledger.subscribe,
    () => ledger.version,
    () => 0,
  );
  const recovery =
    ledgerVersion === 0 ? undefined : ledger.entry(operator.userId, id);
  const [writer] = useState(
    () => new RagCommandSession(apiRequest, operator, ledger, setWrite),
  );
  const saving = write.busy;
  const reloadRequired = Boolean(recovery || write.reloadRequired);
  const load = useCallback(() => {
    if (writer.isBusy() || document.visibilityState !== "visible") return;
    setLoading(true);
    setSource(undefined);
    setReadVersion(undefined);
    setError(undefined);
    setNotice(undefined);
    const version = ledger.version;
    void lane.run(
      (signal) => readRagSource(apiRequest, operator, id, signal),
      (data) => {
        setSource(data);
        if (
          ledger.version === version &&
          !ledger.entry(operator.userId, id)?.inFlight
        ) {
          setReadVersion(version);
          if (!ledger.entry(operator.userId, id)) setWrite({ busy: false });
          else ledger.confirmRead(operator.userId, id, version);
        }
      },
      (cause) => {
        setSource(undefined);
        setError(operationError(cause));
      },
      () => setLoading(false),
    );
  }, [lane, operator, id, ledger, writer]);
  useEffect(() => {
    const dispose = writer.activate(document.visibilityState === "visible");
    const hide = () => {
      const visible = document.visibilityState === "visible";
      writer.setVisible(visible);
      if (!visible) {
        lane.cancel();
        setSource(undefined);
        setReadVersion(undefined);
        setLoading(false);
        setReason("");
        setNotice(undefined);
      }
    };
    const leave = () => {
      writer.setVisible(false);
      lane.cancel();
      setSource(undefined);
      setReadVersion(undefined);
      setLoading(false);
      setReason("");
      setNotice(undefined);
    };
    const resume = () =>
      writer.setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", resume);
    return () => {
      dispose();
      lane.cancel();
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", resume);
    };
  }, [writer, lane]);
  useEffect(() => {
    load();
    return () => lane.cancel();
  }, [load, lane]);
  useEffect(() => {
    if (!write.result) return;
    setSource(write.result.source);
    setReason("");
    setNotice(
      write.result.eventId
        ? `已受理，事件 ${write.result.eventId}。请刷新读取最终索引状态；当前并不代表重建成功。`
        : "人工开关已保存；未调用模型。",
    );
  }, [write.result]);
  useEffect(() => {
    if (write.reloadRequired) {
      setSource(undefined);
      setReadVersion(undefined);
    }
  }, [write.reloadRequired]);
  async function command(action: "reindex" | "enable" | "disable") {
    if (!source || reloadRequired || loading) return;
    lane.cancel();
    setReadVersion(undefined);
    setError(undefined);
    setNotice(undefined);
    await writer.run(source, action, reason);
  }
  return (
    <section className={styles.page}>
      <Link href={routes.ragSources}>返回来源列表</Link>
      <h1>来源索引详情 #{id}</h1>
      <Button disabled={saving} loading={loading} onClick={load}>
        重新加载版本与状态
      </Button>
      {error ? <Alert role="alert" type="error" title={error} /> : null}
      {write.error ? (
        <Alert role="alert" type="error" title={write.error} />
      ) : null}
      {notice ? <Alert role="status" type="info" title={notice} /> : null}
      {reloadRequired ? (
        <AdminParagraph role="alert">
          已停止提交。请重新加载并核对结果后再操作；不会自动重放命令。
          {recovery
            ? ` 原操作：${recovery.action}，提交版本：${recovery.expectedVersion}。`
            : null}
          {recovery ? (
            <Button
              disabled={
                saving ||
                loading ||
                !source ||
                recovery.inFlight ||
                readVersion !== ledgerVersion
              }
              onClick={() => {
                if (
                  readVersion !== undefined &&
                  ledger.acknowledge(operator.userId, id, readVersion)
                ) {
                  setWrite({ busy: false });
                  setReadVersion(undefined);
                  setNotice(
                    "已人工核对当前版本；历史命令是否执行仍以服务端记录为准。",
                  );
                }
              }}
            >
              已核对当前版本，允许后续操作
            </Button>
          ) : null}
        </AdminParagraph>
      ) : null}
      {source ? (
        <>
          <Descriptions
            bordered
            column={1}
            items={[
              { key: "key", label: "来源键", children: source.sourceKey },
              { key: "title", label: "标题", children: source.title },
              {
                key: "type",
                label: "来源类型 / ID",
                children: `${types[source.sourceType as keyof typeof types]} / ${source.sourceId ?? "无"}`,
              },
              {
                key: "scope",
                label: "访问范围",
                children: source.accessScope === "public" ? "公开" : "受限",
              },
              {
                key: "status",
                label: "索引状态",
                children: (
                  <Tag>{statuses[source.status as keyof typeof statuses]}</Tag>
                ),
              },
              {
                key: "manual",
                label: "人工停用",
                children: source.manualDisabled ? "是" : "否",
              },
              {
                key: "eligible",
                label: "业务检索资格（读取快照）",
                children: source.sourceEligible ? "满足" : "不满足",
              },
              {
                key: "version",
                label: "控制版本",
                children: source.controlVersion,
              },
              {
                key: "chunks",
                label: "分块 / 模型 / 维度",
                children: `${source.chunkCount} / ${source.embeddingModels.join(", ") || "无"} / ${source.embeddingDimension}`,
              },
              {
                key: "updated",
                label: "来源更新时间",
                children: source.sourceUpdatedAt,
              },
              {
                key: "indexed",
                label: "索引时间",
                children: source.indexedAt ?? "尚未索引",
              },
              { key: "created", label: "创建时间", children: source.createdAt },
            ]}
          />
          {source.failureReason ? (
            <Alert
              type="warning"
              title={`原因：${({ embedding_failed: "向量生成失败", index_commit_failed: "索引提交失败", source_unavailable: "来源不再公开", stale_index_cleaned: "失效索引已清理", index_lease_expired: "索引任务超时，已清理并重新入队" } as Record<string, string>)[source.failureReason] ?? "索引状态变更"}`}
              description={source.failureAt ?? undefined}
            />
          ) : null}
          {source.failureCode ? (
            <Alert type="warning" title="索引失败，请检查受控服务端日志" />
          ) : null}
          <label htmlFor="rag-operation-reason">操作原因（1–500字）</label>
          <Input.TextArea
            id="rag-operation-reason"
            aria-describedby="rag-operation-hint"
            value={reason}
            maxLength={1000}
            onChange={(event) => setReason(event.target.value)}
            disabled={saving}
          />
          <FormHint id="rag-operation-hint">
            必填，去除首尾空格后1–500字；说明重建、停用或恢复索引的依据，将记录操作审计。
          </FormHint>
          <Space wrap>
            {operator.permissionKeys.includes("ai:knowledge:reindex") ? (
              <Button
                disabled={
                  source.manualDisabled || reloadRequired || saving || loading
                }
                loading={saving}
                onClick={() => void command("reindex")}
              >
                受理重建
              </Button>
            ) : null}
            {operator.permissionKeys.includes("ai:knowledge:disable") ? (
              <Button
                disabled={reloadRequired || saving || loading}
                danger={!source.manualDisabled}
                onClick={() =>
                  void command(source.manualDisabled ? "enable" : "disable")
                }
              >
                {source.manualDisabled
                  ? "解除人工停用并排队重建"
                  : "人工停用并清除分块"}
              </Button>
            ) : null}
          </Space>
          <AdminParagraph>
            启用索引不能发布或恢复业务内容；人工停用不会修改雪场、文章或动态状态。
          </AdminParagraph>
        </>
      ) : loading ? (
        <AdminParagraph role="status">读取中…</AdminParagraph>
      ) : null}
    </section>
  );
}
