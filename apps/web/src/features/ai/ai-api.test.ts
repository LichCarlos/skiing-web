import { describe, expect, it, vi } from "vitest";
import { ApiError, type ApiClient } from "@common/api-contracts/client";
import { AiRun, citationRoute, readAiStream } from "@/features/ai/ai-api";
import {
  validateConversation,
  validateConversationPage,
} from "@/features/ai/ai-validation";
import {
  user,
  deferred,
} from "@/platform/auth/public-session-fixtures.test-helper";

const account = {
  ...user,
  permissionKeys: [...user.permissionKeys, "ai:conversation:use"],
};
const id = "ad4117b2-1f3e-4d13-ae12-f15d65b8fdef";
const requestId = "b9fef499-7d12-4d88-b9ab-9e08936a6cc0";
const message = {
  messageId: "2",
  role: "assistant" as const,
  status: "complete" as const,
  content: "滑雪前请检查装备。",
  citations: [],
  createdAt: "2026-11-07T08:00:00Z",
};
const summary = {
  conversationId: id,
  title: "装备",
  status: "active",
  messageCount: 1,
  createdAt: message.createdAt,
  updatedAt: message.createdAt,
};
function stream(text: string, split = 1) {
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += split)
          controller.enqueue(bytes.slice(offset, offset + split));
        controller.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}
const completed = `event: completed\r\ndata: ${JSON.stringify(message)}\r\n\r\n`;

describe("AI stream and data integrity", () => {
  it("decodes split UTF-8 and CRLF frames and confirms the saved reply", async () => {
    const chunks: string[] = [];
    const result = await readAiStream(
      stream(
        `: heartbeat\r\n\r\nevent: delta\r\ndata: {"text":"滑雪"}\r\n\r\n${completed}`,
      ),
      new AbortController().signal,
      (text) => chunks.push(text),
    );
    expect(chunks).toEqual(["滑雪"]);
    expect(result).toEqual(message);
  });
  it("rejects truncated replies and redacted stream errors", async () => {
    await expect(
      readAiStream(
        stream('event: delta\ndata: {"text":"部分回复"}\n\n'),
        new AbortController().signal,
        () => {},
      ),
    ).rejects.toThrow("连接已中断");
    await expect(
      readAiStream(
        stream('event: error\ndata: {"msg":"secret-provider-message"}\n\n'),
        new AbortController().signal,
        () => {},
      ),
    ).rejects.toThrow("AI 暂时未能完成回复");
  });
  it("rejects invalid roles, malformed delta data and unconfirmed completion", async () => {
    for (const text of [
      'event: delta\ndata: {"text":5}\n\n',
      `event: completed\ndata: ${JSON.stringify({ ...message, role: "user" })}\n\n`,
    ]) {
      await expect(
        readAiStream(stream(text), new AbortController().signal, () => {}),
      ).rejects.toThrow();
    }
  });
  it("cancels a waiting reader when the account lifetime ends", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }));
    const controller = new AbortController();
    const pending = readAiStream(response, controller.signal, () => {});
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(cancel).toHaveBeenCalled();
  });
  it("checks conversation identity, duplicate messages and pagination", () => {
    expect(() =>
      validateConversation({ ...summary, messages: [message] }, id),
    ).not.toThrow();
    expect(() =>
      validateConversation(
        { ...summary, conversationId: requestId, messages: [message] },
        id,
      ),
    ).toThrow();
    expect(() =>
      validateConversation(
        { ...summary, messageCount: 2, messages: [message, message] },
        id,
      ),
    ).toThrow();
    expect(() =>
      validateConversationPage(
        { page: 1, pageSize: 20, total: 2, items: [summary, summary] },
        1,
      ),
    ).toThrow();
  });
  it("only links citations to known public routes", () => {
    const citation = {
      sourceType: "article" as const,
      sourceId: "3",
      title: "入门",
      excerpt: "",
      href: "javascript:alert(1)",
    };
    expect(citationRoute(citation)).toBe("/knowledge/3");
    expect(citationRoute({ ...citation, sourceId: "2147483648" })).toBeNull();
    expect(citationRoute({ ...citation, sourceType: "project" })).toBeNull();
  });
});

describe("AI account and retry boundaries", () => {
  it("reuses the original request ID after a truncated reply", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(account) as unknown as ApiClient["request"];
    const transport = vi
      .fn()
      .mockResolvedValueOnce(stream('event: delta\ndata: {"text":"部分"}\n\n'))
      .mockResolvedValueOnce(stream(completed));
    const run = new AiRun(7, request, transport);
    const body = { clientRequestId: requestId, content: "如何选装备？" };
    await expect(run.send(id, body, () => {})).rejects.toThrow();
    await expect(run.send(id, body, () => {})).resolves.toEqual(message);
    expect(transport.mock.calls.map((call) => call[1])).toEqual([body, body]);
  });
  it("rejects a changed account or missing permission before any stream POST", async () => {
    for (const current of [{ ...account, userId: 8 }, user]) {
      const transport = vi.fn();
      const request = vi
        .fn()
        .mockResolvedValue(current) as unknown as ApiClient["request"];
      await expect(
        new AiRun(7, request, transport).send(
          id,
          { clientRequestId: requestId, content: "装备" },
          () => {},
        ),
      ).rejects.toBeInstanceOf(ApiError);
      expect(transport).not.toHaveBeenCalled();
    }
  });
  it("discards late history responses after logout", async () => {
    const waiting = deferred<unknown>();
    const request = vi
      .fn()
      .mockResolvedValueOnce(account)
      .mockReturnValueOnce(waiting.promise) as unknown as ApiClient["request"];
    const run = new AiRun(7, request);
    const pending = run.read(id);
    await Promise.resolve();
    await Promise.resolve();
    run.dispose();
    waiting.resolve({ ...summary, messages: [message] });
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
  it("prevents concurrent questions and validates Unicode length", async () => {
    const waiting = deferred<Response>();
    const request = vi
      .fn()
      .mockResolvedValue(account) as unknown as ApiClient["request"];
    const run = new AiRun(7, request, () => waiting.promise);
    const body = { clientRequestId: requestId, content: "装备" };
    const pending = run.send(id, body, () => {});
    await expect(run.send(id, body, () => {})).rejects.toThrow(
      "当前问题仍在处理",
    );
    waiting.resolve(stream(completed));
    await expect(pending).resolves.toEqual(message);
    await expect(
      run.send(id, { ...body, content: "雪".repeat(4001) }, () => {}),
    ).rejects.toThrow("1–4000");
  });
});
