import { ApiError } from "@common/api-contracts/client";
import { apiRequest } from "@/platform/api";
import { getApiBaseUrl } from "@/platform/config";

/** The AI endpoint returns SSE rather than the JSON envelope used by apiRequest. */
export async function apiStreamRequest(
  path: string,
  body: unknown,
  signal: AbortSignal,
): Promise<Response> {
  const base = new URL(`${getApiBaseUrl().replace(/\/+$/, "")}/`);
  const url = new URL(path.replace(/^\/+/, ""), base);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname))
    throw new TypeError("Invalid stream API path");
  const { csrfToken } = await apiRequest<{ csrfToken: string | null }>(
    "/auth/csrf",
    {
      signal,
      cache: "no-store",
      skipAuthRefresh: true,
    },
  );
  signal.throwIfAborted();
  if (!csrfToken) throw new Error("无法确认会话，请重新登录。");
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    signal,
    headers: {
      Accept: "text/event-stream",
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiError("AI 请求未被接受", {
      status: response.status,
      code: typeof payload?.code === "number" ? payload.code : null,
      traceId: typeof payload?.traceId === "string" ? payload.traceId : null,
    });
  }
  if (
    !response.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("text/event-stream") ||
    !response.body
  ) {
    await response.body?.cancel();
    throw new Error("AI 回复格式异常，请使用原问题重试。");
  }
  return response;
}
