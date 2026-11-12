"use client";
import { FormHint } from "@/components/form-hint";
import { AdminParagraph } from "@/components/admin-paragraph";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Form, Input, Select, Space } from "antd";
import { apiRequest } from "@/platform/api";
import { RequestLane } from "@/platform/api/request-lane";
import {
  eventMessage,
  eventQuery,
  type EventFilters,
  type OutboxEvent,
} from "@/features/events/event-api";
import {
  canManageEvents,
  type EventOperator,
} from "@/features/events/event-model";
import { readEventPage } from "@/features/events/event-queries";
import {
  EventResults,
  eventStatusLabels,
  type EventState,
} from "@/features/events/event-results";
import {
  EventSession,
  EventWriteRecovery,
  useEventWrites,
} from "@/features/events/event-session";
import { EventRetryDialog } from "@/features/events/event-retry-dialog";
import styles from "@/styles/console.module.css";

export function EventList() {
  return (
    <EventSession target="catalog">
      {(operator) => <Catalog operator={operator} />}
    </EventSession>
  );
}
function Catalog({ operator }: { operator: EventOperator }) {
  const [form] = Form.useForm<EventFilters>();
  const [query, setQuery] = useState({
    filters: {} as EventFilters,
    page: 1,
    pageSize: 20,
  });
  const latestQuery = useRef(query);
  const [state, setState] = useState<EventState>({ status: "loading" });
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<OutboxEvent>();
  const [lane] = useState(() => new RequestLane());
  const writes = useEventWrites(operator);
  const reload = useCallback(async () => {
    if (document.visibilityState !== "visible") return false;
    setState({ status: "loading" });
    // A retry/recovery may finish after the operator changed the list filters.
    // Its captured callback must refresh the current selection, not the old one.
    const current = latestQuery.current;
    return lane.run(
      (signal) =>
        readEventPage(
          apiRequest,
          operator,
          current.filters,
          current.page,
          current.pageSize,
          signal,
        ),
      (data) => setState({ status: "ready", data }),
      (cause) =>
        setState({
          status: "error",
          title: eventMessage(cause),
          traceId: null,
        }),
      () => {},
    );
  }, [lane, operator, query]);
  useEffect(() => {
    void reload();
    const hide = () => {
      if (document.visibilityState === "visible") return;
      lane.cancel();
      setState({ status: "loading" });
      setSelected(undefined);
    };
    const leave = () => {
      lane.cancel();
      setState({ status: "loading" });
      setSelected(undefined);
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", leave);
    return () => {
      lane.cancel();
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", leave);
    };
  }, [reload, lane]);
  function apply(filters: EventFilters, page = 1, pageSize = query.pageSize) {
    try {
      eventQuery(filters, page, pageSize);
      setError(undefined);
      const next = { filters: { ...filters }, page, pageSize };
      latestQuery.current = next;
      setQuery(next);
    } catch (cause) {
      setError(eventMessage(cause));
    }
  }
  return (
    <section className={styles.queryPage}>
      <header>
        <h1>消息任务</h1>
        <AdminParagraph>
          按创建时间从新到旧显示；筛选文字按完整值匹配，时间包含起止时刻，并使用当前设备时区。
        </AdminParagraph>
      </header>
      <EventWriteRecovery operator={operator} writes={writes} reload={reload} />
      <Form
        form={form}
        layout="vertical"
        className={styles.queryForm}
        aria-label="消息任务筛选"
        onFinish={(values) => apply(values)}
      >
        <Form.Item
          name="status"
          label="状态"
          extra={
            <FormHint>选填，按消息投递状态筛选；清空表示全部状态。</FormHint>
          }
        >
          <Select
            allowClear
            placeholder="全部状态"
            options={Object.entries(eventStatusLabels).map(
              ([value, label]) => ({ value, label }),
            )}
          />
        </Form.Item>
        <Form.Item
          name="eventType"
          label="事件类型"
          extra={<FormHint>选填，按事件类型标识筛选，最多200字。</FormHint>}
        >
          <Input maxLength={200} />
        </Form.Item>
        <Form.Item
          name="aggregateType"
          label="聚合类型"
          extra={<FormHint>选填，按关联业务对象类型筛选，最多100字。</FormHint>}
        >
          <Input maxLength={100} />
        </Form.Item>
        <Form.Item
          name="aggregateId"
          label="聚合 ID"
          extra={<FormHint>选填，填写关联业务对象的ID，最多100字。</FormHint>}
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
            <Button onClick={() => void reload()}>刷新</Button>
          </Space>
        </Form.Item>
      </Form>
      {error ? <Alert role="alert" type="error" title={error} /> : null}
      {state.status === "ready" &&
      !state.data.items.length &&
      query.page > 1 ? (
        <Button onClick={() => apply(query.filters)}>
          当前页暂无任务，返回第一页
        </Button>
      ) : null}
      <EventResults
        state={state}
        canRetry={canManageEvents(operator, true)}
        busy={writes.saving || writes.pending}
        onReload={() => void reload()}
        onPage={(page, pageSize) =>
          apply(query.filters, pageSize === query.pageSize ? page : 1, pageSize)
        }
        onRetry={(item) => {
          if (!writes.gate.isLocked()) setSelected(item);
        }}
      />
      {selected ? (
        <EventRetryDialog
          key={selected.eventId}
          operator={operator}
          selected={selected}
          writes={writes}
          close={() => setSelected(undefined)}
          saved={() => void reload()}
        />
      ) : null}
    </section>
  );
}
