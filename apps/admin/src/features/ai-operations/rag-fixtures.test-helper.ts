import { user } from "@/platform/auth/session-fixtures.test-helper";
import type { Operator, RagSource } from "@/features/ai-operations/api";
import type { RagAction } from "@/features/ai-operations/rag-model";
import type { RagRequest } from "@/features/ai-operations/rag-queries";
import { vi } from "vitest";
export const ragOperator: Operator = {
  ...user,
  roles: [{ roleKey: "system_admin", roleName: "系统管理员" }],
  permissionKeys: [
    "management:portal:enter",
    "ai:knowledge:list",
    "ai:knowledge:reindex",
    "ai:knowledge:disable",
  ],
};
export const ragSource: RagSource = {
  ragDocumentId: 8,
  sourceKey: "article:12",
  sourceType: "article",
  sourceId: 12,
  title: "滑雪知识",
  accessScope: "public",
  status: "indexed",
  manualDisabled: false,
  controlVersion: 4,
  sourceEligible: true,
  chunkCount: 2,
  embeddingModels: ["embedding-v1"],
  embeddingDimension: 1024,
  sourceUpdatedAt: "2026-11-03T00:00:00.000Z",
  indexedAt: "2026-11-03T01:00:00.000Z",
  createdAt: "2026-11-02T00:00:00.000Z",
  failureCode: null,
};
export const ragPage = { items: [ragSource], page: 1, pageSize: 20, total: 1 };
export const ragEventId = "078edc04-0d24-4f83-a509-54c472869e70";
export function commandResult(
  action: RagAction = "reindex",
  before = ragSource,
) {
  const noop =
    action !== "reindex" && before.manualDisabled === (action === "disable");
  return {
    source: noop
      ? before
      : {
          ...before,
          controlVersion: before.controlVersion + 1,
          manualDisabled: action === "disable",
          status:
            action === "disable" ? ("disabled" as const) : ("pending" as const),
          indexedAt: null,
          ...(action === "disable"
            ? { chunkCount: 0, embeddingModels: [] }
            : {}),
        },
    eventId: noop || action === "disable" ? null : ragEventId,
  };
}
export function ragCommandRequest(response: unknown = commandResult()) {
  return vi.fn<RagRequest>().mockImplementation(async (path, options) => {
    if (path === "/auth/me") return ragOperator;
    if (!options?.method) return ragSource;
    return response;
  });
}
