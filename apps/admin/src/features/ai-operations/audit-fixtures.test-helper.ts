import { user } from "@/platform/auth/session-fixtures.test-helper";
import type {
  AuditPage,
  AuditSummary,
  Operator,
  AuditContent,
} from "@/features/ai-operations/api";
export const auditor: Operator = {
  ...user,
  roles: [{ roleKey: "support_auditor", roleName: "审计员" }],
  permissionKeys: [
    "management:portal:enter",
    "system:ai-conversation:list",
    "system:ai-conversation:read-content",
  ],
};
export const summary: AuditSummary = {
  conversationId: "078edc04-0d24-4f83-a509-54c472869e70",
  userId: 12,
  status: "active",
  createdAt: "2026-11-03T00:00:00.000Z",
  updatedAt: "2026-11-03T01:00:00.000Z",
  deletedAt: null,
  messageCount: 1,
};
export const auditPage: AuditPage = {
  items: [summary],
  page: 1,
  pageSize: 20,
  total: 1,
};
export const auditContent: AuditContent = {
  messages: [
    {
      messageId: "9007199254740993",
      sender: "user",
      content: "private-question<script>",
      generationStatus: null,
      createdAt: summary.createdAt,
      citations: [{ sourceKey: "article:1", title: "已存引用" }],
    },
  ],
};
