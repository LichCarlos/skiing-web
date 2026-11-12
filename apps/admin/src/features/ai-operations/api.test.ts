import { describe, expect, it } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import {
  auditReason,
  canUseAiOperations,
  operatorKey,
  operationError,
  pageQuery,
  type Operator,
} from "@/features/ai-operations/api";
import {
  conversationAuditId,
  conversationAuditRoute,
  ragSourceId,
} from "@/features/ai-operations/routes";
import { canAccessManagementRoute } from "@/platform/auth/access";
import { routes } from "@/config/routes";

function user(input: Partial<Operator>): Operator {
  return {
    userId: 7,
    account: "operator",
    nickname: "Operator",
    roles: [],
    permissionKeys: [],
    ...input,
  } as Operator;
}

describe("AI operations access and input models", () => {
  it("requires the portal grant and system_admin identity for RAG controls", () => {
    expect(
      canUseAiOperations(
        user({
          roles: [{ roleKey: "system_admin", roleName: "Admin" }],
          permissionKeys: ["management:portal:enter", "ai:knowledge:list"],
        }),
        "rag",
      ),
    ).toBe(true);
    expect(
      canUseAiOperations(
        user({
          roles: [{ roleKey: "system_admin", roleName: "Admin" }],
          permissionKeys: ["ai:knowledge:list"],
        }),
        "rag",
      ),
    ).toBe(false);
    expect(
      canUseAiOperations(
        user({
          roles: [{ roleKey: "merchant", roleName: "Merchant" }],
          permissionKeys: ["management:portal:enter", "ai:knowledge:list"],
        }),
        "rag",
      ),
    ).toBe(false);
  });

  it("uses permission grants, not a hard-coded role, for conversation audits", () => {
    expect(
      canUseAiOperations(
        user({
          roles: [{ roleKey: "support_auditor", roleName: "Support" }],
          permissionKeys: [
            "management:portal:enter",
            "system:ai-conversation:list",
          ],
        }),
        "audit",
      ),
    ).toBe(true);
    expect(
      canUseAiOperations(
        user({
          roles: [{ roleKey: "system_admin", roleName: "Admin" }],
          permissionKeys: ["management:portal:enter"],
        }),
        "audit",
      ),
    ).toBe(false);
  });

  it("keeps direct navigation aligned with page-level grants", () => {
    const auditor = user({
      roles: [{ roleKey: "support_auditor", roleName: "Support" }],
      permissionKeys: [
        "management:portal:enter",
        "system:ai-conversation:list",
      ],
    });
    const portalOnly = user({
      permissionKeys: ["management:portal:enter"],
    });
    const ragAdmin = user({
      roles: [{ roleKey: "system_admin", roleName: "Admin" }],
      permissionKeys: ["management:portal:enter", "ai:knowledge:list"],
    });

    expect(canAccessManagementRoute(auditor, routes.aiConversationAudits)).toBe(
      true,
    );
    expect(
      canAccessManagementRoute(
        auditor,
        `${routes.aiConversationAudits}/078edc04-0d24-4f83-a509-54c472869e70`,
      ),
    ).toBe(true);
    expect(
      canAccessManagementRoute(
        portalOnly,
        `${routes.aiConversationAudits}/078edc04-0d24-4f83-a509-54c472869e70`,
      ),
    ).toBe(false);
    expect(canAccessManagementRoute(ragAdmin, routes.ragSources)).toBe(true);
    expect(
      canAccessManagementRoute(
        user({
          roles: [{ roleKey: "merchant", roleName: "Merchant" }],
          permissionKeys: ["management:portal:enter", "ai:knowledge:list"],
        }),
        routes.ragSources,
      ),
    ).toBe(false);
  });

  it("builds conversation detail URLs under the audit route", () => {
    expect(conversationAuditRoute("078edc04-0d24-4f83-a509-54c472869e70")).toBe(
      "/admin/ai/conversations/078edc04-0d24-4f83-a509-54c472869e70",
    );
  });

  it("keys protected views by normalized grants and roles", () => {
    const first = user({
      roles: [
        { roleKey: "b", roleName: "B" },
        { roleKey: "a", roleName: "A" },
      ],
      permissionKeys: ["z", "a"],
    });
    const reordered = user({
      roles: [
        { roleKey: "a", roleName: "A" },
        { roleKey: "b", roleName: "B" },
      ],
      permissionKeys: ["a", "z"],
    });
    expect(operatorKey(first)).toBe(operatorKey(reordered));
    expect(operatorKey(first)).not.toBe(
      operatorKey(user({ ...reordered, userId: 8 })),
    );
  });

  it("validates audit reasons and bounded offset pagination", () => {
    expect(auditReason("  incident review  ")).toBe("incident review");
    expect(() => auditReason(" \t ")).toThrow();
    expect(() => auditReason("x".repeat(501))).toThrow();
    expect(pageQuery(2, 50).toString()).toBe("page=2&pageSize=50");
    expect(() => pageQuery(0, 20)).toThrow();
    expect(() => pageQuery(1, 101)).toThrow();
  });

  it("validates deep-link identifiers without accepting malformed paths", () => {
    expect(ragSourceId("2147483647")).toBe(2147483647);
    expect(ragSourceId("0")).toBeNull();
    expect(ragSourceId("1/other")).toBeNull();
    expect(conversationAuditId("078edc04-0d24-4f83-a509-54c472869e70")).toBe(
      true,
    );
    expect(conversationAuditId("../../other")).toBe(false);
  });

  it("surfaces conflict, authorization, and trace identifiers without retrying", () => {
    expect(
      operationError(
        new ApiError("Conflict", {
          status: 409,
          code: 409,
          traceId: "trace-1",
        }),
      ),
    ).toContain("trace-1");
    expect(
      operationError(
        new ApiError("Forbidden", {
          status: 403,
          code: 403,
          traceId: null,
        }),
      ),
    ).toContain("授权已变化");
  });
});
