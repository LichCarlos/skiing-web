import type { components } from "@common/api-contracts/openapi";
import { ApiError, type ApiClient } from "@common/api-contracts/client";
import { apiRequest } from "@/platform/api";
import { apiStreamRequest } from "@/platform/api/stream";
import { createSseParser } from "@/platform/api/sse";
import { parsePublicUser } from "@/platform/auth/public-session-model";
import { routes } from "@/config/routes";
import {
  aiConversationId,
  isAiMessage,
  validateConversation,
  validateConversationPage,
  validateConversationSummary,
} from "@/features/ai/ai-validation";

export type AiMessage = components["schemas"]["AiMessageVO"];
export type AiConversation = components["schemas"]["AiConversationDetailVO"];
export type AiConversationPage = components["schemas"]["AiConversationPageVO"];
export type AiConversationSummary =
  components["schemas"]["AiConversationSummaryVO"];
export type SendAiMessage = components["schemas"]["SendAiMessageDto"];

function conversationPath(id: string) {
  const value = aiConversationId(id);
  if (!value) throw new Error("对话地址无效，请返回对话列表。");
  return `/ai/conversations/${value}`;
}

/** One lifetime per account; never refresh an expired session into a different account. */
export class AiRun {
  private active = true;
  private controllers = new Set<AbortController>();
  private writing = false;
  constructor(
    readonly userId: number,
    private request: ApiClient["request"] = apiRequest,
    private stream = apiStreamRequest,
  ) {}
  activate() {
    this.active = true;
  }
  dispose() {
    this.active = false;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
  }
  private async execute<T>(
    action: (signal: AbortSignal) => Promise<T>,
    write = false,
    timeout = 15000,
  ) {
    if (!this.active) throw new DOMException("Closed", "AbortError");
    if (write && this.writing) throw new Error("当前问题仍在处理，请稍候。");
    if (write) this.writing = true;
    const controller = new AbortController();
    const timer = setTimeout(
      () =>
        controller.abort(
          new DOMException("请求超时，请重试。", "TimeoutError"),
        ),
      timeout,
    );
    this.controllers.add(controller);
    try {
      const user = parsePublicUser(
        await this.request("/auth/me", {
          signal: controller.signal,
          cache: "no-store",
          skipAuthRefresh: true,
        }),
      );
      controller.signal.throwIfAborted();
      if (
        user.userId !== this.userId ||
        !user.permissionKeys.includes("ai:conversation:use")
      )
        throw new ApiError("AI identity changed", {
          status: 403,
          code: null,
          traceId: null,
        });
      const value = await action(controller.signal);
      controller.signal.throwIfAborted();
      if (!this.active) throw new DOMException("Closed", "AbortError");
      return value;
    } finally {
      clearTimeout(timer);
      this.controllers.delete(controller);
      if (write) this.writing = false;
    }
  }
  list(page: number) {
    return this.execute(async (signal) => {
      const result: unknown = await this.request(
        `/ai/conversations?page=${page}&pageSize=20`,
        { signal, cache: "no-store", skipAuthRefresh: true },
      );
      validateConversationPage(result, page);
      return result;
    });
  }
  read(id: string) {
    return this.execute(async (signal) => {
      const result: unknown = await this.request(conversationPath(id), {
        signal,
        cache: "no-store",
        skipAuthRefresh: true,
      });
      validateConversation(result, id);
      return result;
    });
  }
  create() {
    return this.execute(async (signal) => {
      const result: unknown = await this.request("/ai/conversations", {
        method: "POST",
        body: {},
        signal,
        skipAuthRefresh: true,
      });
      validateConversationSummary(result);
      return result;
    }, true);
  }
  remove(id: string) {
    return this.execute(
      (signal) =>
        this.request<void>(conversationPath(id), {
          method: "DELETE",
          signal,
          skipAuthRefresh: true,
        }),
      true,
    );
  }
  send(id: string, body: SendAiMessage, onDelta: (text: string) => void) {
    const content = body.content.trim();
    if (
      !content ||
      Array.from(content).length > 4000 ||
      !aiConversationId(body.clientRequestId)
    )
      return Promise.reject(new Error("请输入 1–4000 字的问题。"));
    return this.execute(
      async (signal) => {
        const response = await this.stream(
          `${conversationPath(id)}/messages`,
          { ...body, content },
          signal,
        );
        return readAiStream(response, signal, onDelta);
      },
      true,
      180000,
    );
  }
}

export async function readAiStream(
  response: Response,
  signal: AbortSignal,
  onDelta: (text: string) => void,
): Promise<AiMessage> {
  if (!response.body) throw new Error("AI 回复连接为空。");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const abort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", abort, { once: true });
  let completed: AiMessage | undefined;
  let size = 0;
  const parser = createSseParser(({ event, data }) => {
    signal.throwIfAborted();
    if (completed || !["delta", "completed", "error"].includes(event)) return;
    const value: unknown = JSON.parse(data);
    if (event === "error")
      throw new Error("AI 暂时未能完成回复，请重试原问题。");
    if (event === "delta") {
      if (
        !value ||
        typeof value !== "object" ||
        !("text" in value) ||
        typeof value.text !== "string"
      )
        throw new TypeError("Invalid AI delta");
      size += value.text.length;
      if (size > 100000) throw new Error("AI 回复超出长度限制。");
      onDelta(value.text);
    } else {
      if (!isAiMessage(value) || value.role !== "assistant")
        throw new TypeError("Invalid AI completed message");
      completed = value;
    }
  });
  try {
    while (!completed) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) {
        parser.push(decoder.decode());
        break;
      }
      parser.push(decoder.decode(value, { stream: true }));
    }
    signal.throwIfAborted();
    if (!completed) throw new Error("连接已中断，回复尚未确认。请重试原问题。");
    return completed;
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export function aiFailure(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return "登录已过期，请重新登录后继续。";
    if (error.status === 403)
      return "当前账号无法使用 AI，请检查会话或联系管理员。";
    if (error.status === 404) return "对话不存在或已删除，请返回对话列表。";
    if (error.status === 409) return "原问题仍在处理，请稍后重试原问题。";
    if (error.status === 429)
      return "提问过于频繁，请稍后再试（每分钟最多 5 条新问题）。";
    return "请求未完成，请检查网络后重试。";
  }
  return error instanceof Error &&
    !["AbortError", "TypeError"].includes(error.name)
    ? error.message
    : "请求未完成，请重新读取或重试原问题。";
}

export function citationRoute(citation: components["schemas"]["AiCitationVO"]) {
  if (
    !/^[1-9]\d*$/.test(citation.sourceId) ||
    Number(citation.sourceId) > 2147483647
  )
    return null;
  const id = Number(citation.sourceId);
  switch (citation.sourceType) {
    case "resort":
      return routes.resortDetail(id);
    case "article":
      return routes.articleDetail(id);
    case "dynamic":
      return routes.dynamicDetail(id);
    default:
      return null;
  }
}
