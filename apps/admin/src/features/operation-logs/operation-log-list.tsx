"use client";
import { FormHint } from "@/components/form-hint";
import { AdminParagraph } from "@/components/admin-paragraph";

import { useEffect, useState } from "react";
import { Alert, Button, Form, Input, Select, Space } from "antd";
import {
  readOperationLogPage,
  operationLogError,
  operationLogQuery,
  type OperationLogFilters,
} from "@/features/operation-logs/operation-log-api";
import {
  OperationLogResults,
  type OperationLogState,
} from "@/features/operation-logs/operation-log-results";
import { apiRequest } from "@/platform/api";
import { useSession } from "@/platform/auth/session-provider";
import type { CurrentUser } from "@/platform/auth/session-model";
import {
  operationLogOperator,
  operationLogOperatorKey,
} from "@/features/operation-logs/operation-log-model";
import styles from "@/styles/console.module.css";

export function OperationLogList() {
  const { session, retryRestore } = useSession();
  if (session.status === "loading")
    return (
      <AdminParagraph role="status">正在确认操作日志读取身份</AdminParagraph>
    );
  let operator: CurrentUser | undefined;
  if (session.status === "authenticated") {
    try {
      operator = operationLogOperator(session.currentUser);
    } catch {
      // A malformed or no longer authorized session must not retain the old rows.
    }
  }
  if (!operator)
    return (
      <section role="alert">
        <AdminParagraph>当前身份无法读取操作日志</AdminParagraph>
        <Button onClick={() => void retryRestore()}>重新读取身份</Button>
      </section>
    );
  return (
    <OperationLogForm
      key={operationLogOperatorKey(operator)}
      operator={operator}
    />
  );
}

function OperationLogForm({ operator }: { operator: CurrentUser }) {
  const [form] = Form.useForm<OperationLogFilters>();
  const [query, setQuery] = useState(() => operationLogQuery({}, 1, 20));
  const [filters, setFilters] = useState<OperationLogFilters>({});
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string>();
  function apply(values: OperationLogFilters, page = 1, pageSize = 20) {
    try {
      const next = operationLogQuery(values, page, pageSize);
      setError(undefined);
      setFilters(values);
      setQuery(next);
      setAttempt((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "筛选条件无效");
    }
  }
  return (
    <section className={styles.queryPage}>
      <header>
        <h1>操作日志</h1>
        <AdminParagraph>
          按时间从新到旧显示。输入字段按完整值匹配，时间条件包含起止时刻；选择时间使用当前设备时区。
        </AdminParagraph>
      </header>
      <Form
        form={form}
        layout="vertical"
        className={styles.queryForm}
        aria-label="操作日志筛选"
        onFinish={(values) => apply(values)}
      >
        <Form.Item
          name="actorUserId"
          label="操作者 ID"
          extra={
            <FormHint>
              选填，填写有效的操作者用户ID（正整数），最多10位。
            </FormHint>
          }
        >
          <Input inputMode="numeric" maxLength={10} />
        </Form.Item>
        <Form.Item
          name="actionKey"
          label="动作"
          extra={<FormHint>选填，填写操作动作标识，最多150字。</FormHint>}
        >
          <Input maxLength={150} />
        </Form.Item>
        <Form.Item
          name="resourceKey"
          label="资源"
          extra={<FormHint>选填，填写业务资源标识，最多100字。</FormHint>}
        >
          <Input maxLength={100} />
        </Form.Item>
        <Form.Item
          name="result"
          label="结果"
          extra={<FormHint>选填，筛选成功或失败；清空表示全部结果。</FormHint>}
        >
          <Select
            allowClear
            placeholder="全部结果"
            options={[
              { value: "success", label: "成功" },
              { value: "failure", label: "失败" },
            ]}
          />
        </Form.Item>
        <Form.Item
          name="traceId"
          label="traceId"
          extra={
            <FormHint>
              选填，填写请求的追踪ID以定位同一次操作，最多100字。
            </FormHint>
          }
        >
          <Input maxLength={100} />
        </Form.Item>
        <Form.Item
          name="fromTime"
          label="开始时间"
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
        <Form.Item className={styles.queryActions}>
          <Space wrap>
            <Button type="primary" htmlType="submit">
              查询
            </Button>
            <Button
              onClick={() => {
                form.resetFields();
                apply({});
              }}
            >
              重置
            </Button>
          </Space>
        </Form.Item>
      </Form>
      {error ? <Alert role="alert" type="error" title={error} /> : null}
      <ResultsLoader
        key={`${query}:${attempt}`}
        query={query}
        operator={operator}
        onPage={(page, pageSize) => apply(filters, page, pageSize)}
        onRetry={() => setAttempt((value) => value + 1)}
      />
    </section>
  );
}

function ResultsLoader({
  query,
  operator,
  onPage,
  onRetry,
}: {
  query: string;
  operator: CurrentUser;
  onPage: (page: number, pageSize: number) => void;
  onRetry: () => void;
}) {
  const { retryRestore } = useSession();
  const [state, setState] = useState<OperationLogState>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    void readOperationLogPage(apiRequest, operator, query, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({ status: "error", ...operationLogError(error) });
      });
    return () => controller.abort();
  }, [query, operator]);
  return (
    <>
      <OperationLogResults state={state} onRetry={onRetry} onPage={onPage} />
      {state.status === "error" ? (
        <Button onClick={() => void retryRestore()}>重新读取身份</Button>
      ) : null}
    </>
  );
}
