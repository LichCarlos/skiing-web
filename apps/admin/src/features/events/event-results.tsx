import { Alert, Button, Empty, Spin, Table, Tag } from "antd";
import type { EventPage, OutboxEvent } from "@/features/events/event-api";

export const eventStatusLabels = {
  pending: "待投递",
  processing: "投递中",
  published: "已投递",
  failed: "失败",
} as const;
export type EventState =
  | { status: "loading" }
  | { status: "error"; title: string; traceId: string | null }
  | { status: "ready"; data: EventPage };
export function EventResults({
  state,
  canRetry,
  busy,
  onReload,
  onPage,
  onRetry,
}: {
  state: EventState;
  canRetry: boolean;
  busy: boolean;
  onReload: () => void;
  onPage: (page: number, pageSize: number) => void;
  onRetry: (event: OutboxEvent) => void;
}) {
  if (state.status === "loading")
    return (
      <div role="status">
        <Spin /> 正在加载消息任务...
      </div>
    );
  if (state.status === "error")
    return (
      <section role="alert">
        <Alert
          type="error"
          title={state.title}
          description={state.traceId ? `traceId: ${state.traceId}` : undefined}
        />
        <Button onClick={onReload}>重新加载</Button>
      </section>
    );
  return (
    <Table<OutboxEvent>
      rowKey="eventId"
      dataSource={state.data.items}
      scroll={{ x: 1800 }}
      locale={{ emptyText: <Empty description="没有符合条件的消息任务" /> }}
      pagination={{
        current: state.data.page,
        pageSize: state.data.pageSize,
        total: state.data.total,
        showSizeChanger: true,
        pageSizeOptions: [10, 20, 50, 100],
        onChange: onPage,
        showTotal: (total) => `共 ${total} 条`,
      }}
      columns={[
        { title: "事件 ID", dataIndex: "eventId" },
        { title: "事件类型", dataIndex: "eventType" },
        { title: "聚合类型", dataIndex: "aggregateType" },
        { title: "聚合 ID", dataIndex: "aggregateId" },
        {
          title: "状态",
          render: (_, row) => (
            <Tag color={row.status === "failed" ? "error" : undefined}>
              {eventStatusLabels[row.status]}
            </Tag>
          ),
        },
        {
          title: "累计次数 / 上限",
          render: (_, row) => `${row.attempts} / ${row.maxAttempts}`,
        },
        ...(
          [
            ["createdAt", "创建时间"],
            ["occurredAt", "发生时间"],
            ["availableAt", "可投递时间"],
            ["lockedAt", "租约时间"],
            ["publishedAt", "投递时间"],
          ] as const
        ).map(([key, title]) => ({
          title,
          render: (_: unknown, row: OutboxEvent) =>
            row[key] ? <time dateTime={row[key]}>{row[key]}</time> : "—",
        })),
        ...(canRetry
          ? [
              {
                title: "操作",
                render: (_: unknown, row: OutboxEvent) =>
                  row.status === "failed" ? (
                    <Button disabled={busy} onClick={() => onRetry(row)}>
                      重试事件
                    </Button>
                  ) : (
                    "—"
                  ),
              },
            ]
          : []),
      ]}
    />
  );
}
