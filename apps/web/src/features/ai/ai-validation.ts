import type {
  AiConversation,
  AiConversationPage,
  AiConversationSummary,
  AiMessage,
} from "@/features/ai/ai-api";

export function aiConversationId(value: unknown): string | null {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
    ? value.toLowerCase()
    : null;
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function time(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
export function isAiMessage(value: unknown): value is AiMessage {
  return (
    record(value) &&
    typeof value.messageId === "string" &&
    /^[1-9]\d*$/.test(value.messageId) &&
    ["user", "assistant"].includes(String(value.role)) &&
    value.status === "complete" &&
    typeof value.content === "string" &&
    !!value.content.trim() &&
    value.content.length <= 100_000 &&
    time(value.createdAt) &&
    Array.isArray(value.citations) &&
    value.citations.every(
      (citation: unknown) =>
        record(citation) &&
        ["resort", "article", "project", "dynamic", "dictionary"].includes(
          String(citation.sourceType),
        ) &&
        typeof citation.sourceId === "string" &&
        typeof citation.title === "string" &&
        typeof citation.excerpt === "string" &&
        (citation.href === null || typeof citation.href === "string"),
    )
  );
}
export function validateConversationSummary(
  value: unknown,
): asserts value is AiConversationSummary {
  if (
    !record(value) ||
    !aiConversationId(value.conversationId) ||
    !(value.title === null || typeof value.title === "string") ||
    !["active", "archived"].includes(String(value.status)) ||
    !time(value.createdAt) ||
    !time(value.updatedAt) ||
    !count(value.messageCount)
  )
    throw new TypeError("Invalid AI conversation response");
}
export function validateConversationPage(
  value: unknown,
  page: number,
): asserts value is AiConversationPage {
  if (
    !record(value) ||
    value.page !== page ||
    value.pageSize !== 20 ||
    !count(value.total) ||
    !Array.isArray(value.items) ||
    value.items.length > 20 ||
    value.items.length > value.total
  )
    throw new TypeError("Invalid AI conversation page");
  const ids = new Set<string>();
  for (const item of value.items) {
    validateConversationSummary(item);
    const id = aiConversationId(item.conversationId)!;
    if (ids.has(id)) throw new TypeError("Duplicate AI conversation");
    ids.add(id);
  }
}
export function validateConversation(
  value: unknown,
  id: string,
): asserts value is AiConversation {
  validateConversationSummary(value);
  const messages: unknown = (value as unknown as Record<string, unknown>)
    .messages;
  if (
    aiConversationId(value.conversationId) !== aiConversationId(id) ||
    !Array.isArray(messages) ||
    messages.length !== value.messageCount
  )
    throw new TypeError("Invalid AI conversation detail");
  const ids = new Set<string>();
  for (const message of messages) {
    if (!isAiMessage(message) || ids.has(message.messageId))
      throw new TypeError("Invalid AI history message");
    ids.add(message.messageId);
  }
}
