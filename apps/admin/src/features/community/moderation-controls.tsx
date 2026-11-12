"use client";
import { ControlHint } from "@/components/control-hint";

import { AdminParagraph } from "@/components/admin-paragraph";

import { useState } from "react";
import { App, Button, Input, Modal, Space } from "antd";
import { apiRequest } from "@/platform/api";
import {
  actionLabels,
  dynamicActions,
  commentActions,
  mutationFor,
  type Moderator,
  type ModerationTarget,
  type AdminDynamic,
  type AdminComment,
} from "@/features/community/moderation-model";
import {
  prepareModeration,
  sendModeration,
} from "@/features/community/moderation-queries";
import type { ModerationWrites } from "@/features/community/moderation-session";

export function DynamicControls({
  item,
  disabled,
  select,
}: {
  item: AdminDynamic;
  disabled: boolean;
  select: (target: ModerationTarget) => void;
}) {
  return (
    <Space wrap>
      {[...dynamicActions(item.status), "delete" as const].map((action) => (
        <Button
          key={action}
          type="link"
          danger={action === "hide" || action === "delete"}
          disabled={disabled}
          onClick={() => select({ kind: "dynamic", item, action })}
        >
          {actionLabels[action]}
        </Button>
      ))}
    </Space>
  );
}
export function CommentControls({
  item,
  page,
  disabled,
  select,
}: {
  item: AdminComment;
  page: number;
  disabled: boolean;
  select: (target: ModerationTarget) => void;
}) {
  return (
    <Space wrap>
      {[...commentActions(item.status), "delete" as const].map((action) => (
        <Button
          key={action}
          type="link"
          danger={action !== "restore"}
          disabled={disabled}
          onClick={() => select({ kind: "comment", item, page, action })}
        >
          {action === "restore" ? "恢复可见" : actionLabels[action]}
        </Button>
      ))}
    </Space>
  );
}
export function ModerationDialog({
  operator,
  target,
  writes,
  close,
  committed,
}: {
  operator: Moderator;
  target: ModerationTarget;
  writes: ModerationWrites;
  close: () => void;
  committed: (target: ModerationTarget) => void;
}) {
  const { message } = App.useApp();
  const [reason, setReason] = useState("");
  async function submit() {
    if (document.visibilityState !== "visible" || !writes.gate.isActive())
      return;
    const mutation = mutationFor(target);
    const result = await writes.run(
      mutation,
      (signal) =>
        prepareModeration(apiRequest, operator, target, reason, signal),
      (body, signal) => sendModeration(apiRequest, mutation, body, signal),
      () => {
        message.success(
          target.action === "delete" ? "内容已软删除" : "审核状态已更新",
        );
        close();
        committed(target);
      },
    );
    if (writes.gate.isActive() && result.status === "error" && result.uncertain)
      close();
  }
  const id =
    target.kind === "dynamic" ? target.item.dynamicId : target.item.commentId;
  return (
    <Modal
      title={`${actionLabels[target.action]}${target.kind === "dynamic" ? "动态" : "评论"} #${id}`}
      open
      onCancel={() => {
        if (!writes.gate.isLocked()) close();
      }}
      onOk={() => void submit()}
      confirmLoading={writes.saving}
      okButtonProps={{ disabled: writes.pending }}
      cancelButtonProps={{ disabled: writes.saving }}
      closable={!writes.saving}
      maskClosable={!writes.saving}
      destroyOnHidden
    >
      <AdminParagraph>
        将对当前选中的已保存内容执行操作，并记录操作日志。动态公开状态更新后，AI知识来源会稍后同步。
      </AdminParagraph>
      <AdminParagraph>{target.item.content.slice(0, 200)}</AdminParagraph>
      {target.action === "delete" ? (
        <AdminParagraph>删除后内容将不再展示，并保留操作记录。</AdminParagraph>
      ) : (
        <ControlHint hint="选填审核原因，最多500字；随本次审核记录保存。" fluid>
          <Input.TextArea
            aria-label="审核原因"
            value={reason}
            maxLength={500}
            showCount
            disabled={writes.saving || writes.pending}
            onChange={(event) => setReason(event.target.value)}
            placeholder="审核原因（可选，最多500字符）"
          />
        </ControlHint>
      )}
    </Modal>
  );
}
