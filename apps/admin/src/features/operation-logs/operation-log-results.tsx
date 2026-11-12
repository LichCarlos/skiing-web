import { Alert, Button, Empty, Space, Spin, Table, Tag } from "antd";
import type {
  OperationLog,
  OperationLogPage,
} from "@/features/operation-logs/operation-log-api";

export type OperationLogState =
  | { status: "loading" }
  | { status: "error"; title: string; traceId: string | null }
  | { status: "ready"; data: OperationLogPage };

export function OperationLogResults({
  state,
  onRetry,
  onPage,
}: {
  state: OperationLogState;
  onRetry: () => void;
  onPage: (page: number, pageSize: number) => void;
}) {
  if (state.status === "loading")
    return (
      <div role="status">
        <Spin /> 正在加载操作日志...
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
        <Button onClick={onRetry}>重试</Button>
      </section>
    );
  return (
    <Table<OperationLog>
      rowKey="operationLogId"
      dataSource={state.data.items}
      scroll={{ x: 1200 }}
      locale={{ emptyText: <Empty description="没有符合条件的操作日志" /> }}
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
        { title: "日志 ID", dataIndex: "operationLogId" },
        {
          title: "操作者",
          render: (_, row) => (
            <Space orientation="vertical">
              <span>{row.actorAccountSnapshot}</span>
              <span>
                {row.actorUserId === null
                  ? "账号已移除"
                  : `ID: ${row.actorUserId}`}
              </span>
            </Space>
          ),
        },
        { title: "动作", dataIndex: "actionKey" },
        { title: "资源", dataIndex: "resourceKey" },
        { title: "目标类型", dataIndex: "targetType" },
        { title: "目标 ID", dataIndex: "targetId" },
        {
          title: "结果",
          render: (_, row) => (
            <Tag color={row.result === "success" ? "success" : "error"}>
              {row.result === "success" ? "成功" : "失败"}
            </Tag>
          ),
        },
        { title: "traceId", dataIndex: "traceId" },
        {
          title: "时间",
          render: (_, row) => (
            <time dateTime={row.createdAt}>{row.createdAt}</time>
          ),
        },
      ]}
    />
  );
}
