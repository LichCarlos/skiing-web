import type { Route } from "next";

export const aiOperationRoutes = {
  ragSources: "/admin/ai/sources" as const,
  aiConversationAudits: "/admin/ai/conversations" as const,
};
export const ragSourceRoute = (id: number) =>
  `/admin/ai/sources/${id}` as Route;
export const conversationAuditRoute = (id: string) =>
  `${aiOperationRoutes.aiConversationAudits}/${id}` as Route;
export function ragSourceId(value: string): number | null {
  const id = Number(value);
  return /^[1-9]\d*$/.test(value) && Number.isInteger(id) && id <= 2147483647
    ? id
    : null;
}
export function conversationAuditId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
