import type {
  AuditContent,
  AuditPage,
  AuditSummary,
} from "@/features/ai-operations/api";
import { conversationAuditId } from "@/features/ai-operations/routes";

export class AuditResponseError extends Error {}
function invalid(): never {
  throw new AuditResponseError("会话审计响应异常，请重新读取");
}
function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string") invalid();
  return value;
}
function time(value: unknown): string {
  const result = text(value);
  if (
    !Number.isFinite(Date.parse(result)) ||
    new Date(result).toISOString() !== result
  )
    invalid();
  return result;
}
export function parseAuditSummary(
  value: unknown,
  expectedId?: string,
): AuditSummary {
  const item = row(value);
  const conversationId = text(item.conversationId);
  if (
    !conversationAuditId(conversationId) ||
    (expectedId !== undefined && conversationId !== expectedId)
  )
    invalid();
  const userId = item.userId,
    messageCount = item.messageCount;
  if (
    typeof userId !== "number" ||
    !Number.isInteger(userId) ||
    userId < 1 ||
    userId > 2147483647 ||
    typeof messageCount !== "number" ||
    !Number.isSafeInteger(messageCount) ||
    messageCount < 0 ||
    (item.status !== "active" && item.status !== "deleted")
  )
    invalid();
  const deletedAt = item.deletedAt === null ? null : time(item.deletedAt);
  if ((item.status === "deleted") !== (deletedAt !== null)) invalid();
  return {
    conversationId,
    userId,
    status: item.status,
    createdAt: time(item.createdAt),
    updatedAt: time(item.updatedAt),
    deletedAt,
    messageCount,
  };
}
export function parseAuditPage(
  value: unknown,
  page: number,
  pageSize: number,
): AuditPage {
  const item = row(value),
    total = item.total;
  const skip = (page - 1) * pageSize;
  if (
    item.page !== page ||
    item.pageSize !== pageSize ||
    typeof total !== "number" ||
    !Number.isSafeInteger(total) ||
    total < 0 ||
    !Array.isArray(item.items) ||
    item.items.length !== Math.min(pageSize, Math.max(0, total - skip))
  )
    invalid();
  const items = item.items.map((value) => parseAuditSummary(value));
  if (new Set(items.map((item) => item.conversationId)).size !== items.length)
    invalid();
  return { items, page, pageSize, total };
}
export function parseAuditContent(value: unknown): AuditContent {
  const item = row(value);
  if (!Array.isArray(item.messages)) invalid();
  const messages = item.messages.map((value) => {
    const message = row(value);
    const messageId = text(message.messageId);
    if (
      !/^[1-9]\d{0,18}$/.test(messageId) ||
      BigInt(messageId) > 9223372036854775807n
    )
      invalid();
    let citations: AuditContent["messages"][number]["citations"];
    try {
      // The approved contract intentionally returns stored JSON, not only current citation VOs.
      const encoded = JSON.stringify(message.citations);
      if (typeof encoded !== "string") invalid();
      citations = JSON.parse(
        encoded,
      ) as AuditContent["messages"][number]["citations"];
    } catch {
      invalid();
    }
    return {
      messageId,
      sender: text(message.sender),
      content: text(message.content),
      generationStatus:
        message.generationStatus === null
          ? null
          : text(message.generationStatus),
      createdAt: time(message.createdAt),
      citations,
    };
  });
  if (new Set(messages.map((item) => item.messageId)).size !== messages.length)
    invalid();
  return { messages };
}
export function auditMetadataItems(item: AuditSummary) {
  return [
    { key: "conversationId", label: "会话 ID", children: item.conversationId },
    { key: "userId", label: "用户 ID", children: item.userId },
    {
      key: "status",
      label: "状态",
      children: item.status === "deleted" ? "已软删除" : "正常",
    },
    { key: "createdAt", label: "创建时间", children: item.createdAt },
    { key: "updatedAt", label: "更新时间", children: item.updatedAt },
    { key: "deletedAt", label: "软删除时间", children: item.deletedAt ?? "无" },
    {
      key: "messageCount",
      label: "已持久化消息数",
      children: item.messageCount,
    },
  ];
}
