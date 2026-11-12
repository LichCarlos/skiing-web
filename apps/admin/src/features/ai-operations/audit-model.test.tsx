import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Descriptions } from "antd";
import { describe, expect, it } from "vitest";
import {
  parseAuditSummary,
  parseAuditContent,
  parseAuditPage,
  auditMetadataItems,
} from "@/features/ai-operations/audit-model";
import {
  operationError,
  type AuditContent,
} from "@/features/ai-operations/api";
import {
  summary,
  auditPage,
  auditContent,
} from "@/features/ai-operations/audit-fixtures.test-helper";
describe("AI audit runtime projections", () => {
  it("uses the generated D-52 JSON union for historical arrays, objects, scalars and null", () => {
    const values: AuditContent["messages"][number]["citations"][] = [
      [{ sourceKey: "article:1", nested: [null, true] }],
      { sourceKey: "article:1", extra: [1, "old"] },
      "legacy",
      1.25,
      true,
      null,
    ];
    for (const citations of values) {
      expect(
        parseAuditContent({
          messages: [{ ...auditContent.messages[0], citations }],
        }).messages[0]?.citations,
      ).toEqual(citations);
    }
  });
  it("keeps only the seven approved metadata fields in state and rendering", () => {
    const extra = {
      ...summary,
      title: "private-title",
      content: "private-question",
      account: "private-account",
      model: "private-model",
      metadata: { private: "data" },
    };
    expect(parseAuditSummary(extra)).toEqual(summary);
    const html = renderToStaticMarkup(
      createElement(Descriptions, { items: auditMetadataItems(extra) }),
    );
    expect(html).toContain(summary.conversationId);
    expect(html).not.toContain("private-");
    expect(auditMetadataItems(extra)).toHaveLength(7);
  });
  it.each([
    null,
    [],
    { ...summary, conversationId: "bad" },
    { ...summary, userId: null },
    { ...summary, userId: 2147483648 },
    { ...summary, userId: "12" },
    { ...summary, messageCount: -1 },
    { ...summary, messageCount: 0.5 },
    { ...summary, status: "pending" },
    { ...summary, deletedAt: summary.createdAt },
    { ...summary, status: "deleted", deletedAt: null },
    { ...summary, createdAt: "2026-02-30T00:00:00.000Z" },
    { ...summary, updatedAt: "2026-11-03" },
  ])("rejects malformed audit metadata %j", (value) => {
    expect(() => parseAuditSummary(value)).toThrow();
  });
  it("rejects a different conversation and accepts retained deleted metadata", () => {
    expect(() =>
      parseAuditSummary(summary, "d3823e14-bd71-44e2-9c04-aa5b18f97c5a"),
    ).toThrow();
    expect(
      parseAuditSummary({
        ...summary,
        status: "deleted",
        deletedAt: summary.updatedAt,
      }),
    ).toMatchObject({ status: "deleted" });
  });
  it.each([
    null,
    { ...auditPage, page: 2 },
    { ...auditPage, pageSize: 1 },
    { ...auditPage, total: -1 },
    { ...auditPage, total: 1.5 },
    { ...auditPage, total: Number.MAX_SAFE_INTEGER + 1 },
    { ...auditPage, items: [] },
    { ...auditPage, items: {} },
    { ...auditPage, total: 2, items: [summary, summary] },
  ])("rejects inconsistent metadata pages %j", (value) => {
    expect(() => parseAuditPage(value, 1, 20)).toThrow();
  });
  it("projects the page and accepts empty pages beyond the last result", () => {
    expect(parseAuditPage({ ...auditPage, secret: "private" }, 1, 20)).toEqual(
      auditPage,
    );
    expect(
      parseAuditPage({ ...auditPage, page: 2, items: [] }, 2, 20).items,
    ).toEqual([]);
  });
  it("preserves precise message IDs and stored JSON, dropping unapproved top-level/message properties", () => {
    const input = {
      ...auditContent,
      model: "private-model",
      messages: auditContent.messages.map((item) => ({
        ...item,
        providerKey: "private-key",
        promptTokens: 100,
      })),
    };
    expect(parseAuditContent(input)).toEqual(auditContent);
    expect(parseAuditContent({ messages: [] }).messages).toEqual([]);
    expect(parseAuditContent(input).messages[0]!.citations).not.toBe(
      auditContent.messages[0]!.citations,
    );
  });
  it.each([null, {}, [], "legacy-citation", 1, true])(
    "retains already stored JSON citation shape %j",
    (citations) => {
      expect(
        parseAuditContent({
          messages: [{ ...auditContent.messages[0], citations }],
        }).messages[0]!.citations,
      ).toEqual(citations);
    },
  );
  it.each([
    { messageId: 9007199254740992 },
    { messageId: "01" },
    { messageId: "9223372036854775808" },
    { sender: null },
    { content: {} },
    { generationStatus: undefined },
    { createdAt: "invalid" },
    { citations: undefined },
  ])("rejects malformed retained messages %j", (patch) => {
    expect(() =>
      parseAuditContent({
        messages: [{ ...auditContent.messages[0], ...patch }],
      }),
    ).toThrow();
  });
  it("rejects malformed content, duplicate IDs and non-serializable JSON", () => {
    for (const value of [
      null,
      { messages: null },
      { messages: [null] },
      { messages: [auditContent.messages[0], auditContent.messages[0]] },
    ])
      expect(() => parseAuditContent(value)).toThrow();
    const cycle: unknown[] = [];
    cycle.push(cycle);
    expect(() =>
      parseAuditContent({
        messages: [{ ...auditContent.messages[0], citations: cycle }],
      }),
    ).toThrow();
  });
  it("only exposes intentional input/identity/response errors, not arbitrary exception details", () => {
    expect(operationError(new Error("private-provider-key"))).not.toContain(
      "private-provider-key",
    );
    const error = (() => {
      try {
        parseAuditSummary(null);
      } catch (cause) {
        return cause;
      }
    })();
    expect(operationError(error)).toContain("会话审计响应异常");
  });
});
