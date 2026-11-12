"use client";
import { AdminParagraph } from "@/components/admin-paragraph";
import { FormHint } from "@/components/form-hint";

import { useCallback, useEffect, useState } from "react";
import { App, Alert, Button, Input, Modal } from "antd";
import { apiRequest } from "@/platform/api";
import { RequestLane } from "@/platform/api/request-lane";
import { eventMessage, type OutboxEvent } from "@/features/events/event-api";
import {
  canManageEvents,
  eventMutation,
  type EventOperator,
} from "@/features/events/event-model";
import {
  readEventTarget,
  prepareEventRetry,
  writeEventRetry,
} from "@/features/events/event-queries";
import { eventStatusLabels } from "@/features/events/event-results";
import type { EventWrites } from "@/features/events/event-session";

export function EventRetryDialog({
  operator,
  selected,
  writes,
  close,
  saved,
}: {
  operator: EventOperator;
  selected: OutboxEvent;
  writes: EventWrites;
  close: () => void;
  saved: () => void;
}) {
  const { message } = App.useApp();
  const [lane] = useState(() => new RequestLane());
  const [item, setItem] = useState<OutboxEvent>();
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true),
    [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string>();
  const reload = useCallback(async () => {
    setLoading(true);
    setItem(undefined);
    setError(undefined);
    setConflict(false);
    return lane.run(
      (signal) => readEventTarget(apiRequest, operator, selected, signal),
      setItem,
      (cause) => setError(eventMessage(cause)),
      () => setLoading(false),
    );
  }, [lane, operator, selected]);
  useEffect(() => {
    void reload();
    return () => lane.cancel();
  }, [reload, lane]);
  async function submit() {
    if (!item || loading || conflict) return;
    const result = await writes.run(
      eventMutation(item),
      (signal) => prepareEventRetry(apiRequest, operator, item, reason, signal),
      (body, signal) => writeEventRetry(apiRequest, item, body, signal),
      () => {
        message.success("已提交重试，请刷新查看投递状态");
        close();
        saved();
      },
    );
    if (result.status === "error") {
      if (result.uncertain) close();
      else {
        setError(result.message);
        if (result.conflict) setConflict(true);
      }
    }
  }
  return (
    <Modal
      open
      title="重试失败事件"
      okText="提交重试"
      confirmLoading={writes.saving}
      closable={!writes.saving}
      maskClosable={!writes.saving}
      keyboard={!writes.saving}
      cancelButtonProps={{ disabled: writes.saving }}
      onCancel={() => {
        if (!writes.gate.isBusy()) close();
      }}
      onOk={() => void submit()}
      okButtonProps={{
        disabled:
          loading ||
          !item ||
          item.status !== "failed" ||
          conflict ||
          writes.pending ||
          !canManageEvents(operator, true),
      }}
    >
      <AdminParagraph>事件：{selected.eventId}</AdminParagraph>
      {loading ? (
        <AdminParagraph role="status">正在读取最新事件状态</AdminParagraph>
      ) : null}
      {error ? <Alert type="error" title={error} /> : null}
      {item ? (
        <>
          <AdminParagraph>
            当前：{eventStatusLabels[item.status]}；累计次数 / 上限：
            {item.attempts} / {item.maxAttempts}
          </AdminParagraph>
          <AdminParagraph>
            本次将保留累计次数，上限增加 8；提交成功不代表消息已投递或消费完成。
          </AdminParagraph>
          {item.status !== "failed" ? (
            <Alert type="info" title="当前事件不是失败状态，不能重试" />
          ) : null}
          <label htmlFor="event-retry-reason">重试原因（1–500 字）</label>
          <Input.TextArea
            id="event-retry-reason"
            aria-describedby="event-retry-hint"
            value={reason}
            disabled={writes.saving || writes.pending}
            onChange={(event) => setReason(event.target.value)}
          />
          <FormHint id="event-retry-hint">
            必填，去除首尾空格后1–500字；说明失败原因及本次重试依据，将记录到操作审计。
          </FormHint>
          <AdminParagraph>{[...reason.trim()].length} / 500 字</AdminParagraph>
        </>
      ) : null}
      {!loading ? (
        <Button
          disabled={writes.saving}
          onClick={() => {
            if (!writes.gate.isBusy()) void reload();
          }}
        >
          重新读取事件（保留原因）
        </Button>
      ) : null}
    </Modal>
  );
}
