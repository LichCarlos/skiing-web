import { afterEach, expect, it, vi } from "vitest";
import { apiStreamRequest } from "@/platform/api/stream";
import { apiRequest } from "@/platform/api";

vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
vi.mock("@/platform/config", () => ({
  getApiBaseUrl: () => "https://example.test/snow-api/api/v1",
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("posts SSE with browser cookies and CSRF under the configured deployment prefix", async () => {
  vi.mocked(apiRequest).mockResolvedValue({ csrfToken: "csrf-fixture" });
  const response = new Response("event: completed\n\n", {
    headers: { "content-type": "text/event-stream; charset=utf-8" },
  });
  const fetch = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetch);
  const signal = new AbortController().signal;
  expect(
    await apiStreamRequest(
      "/ai/conversations/id/messages",
      { content: "雪场" },
      signal,
    ),
  ).toBe(response);
  expect(fetch.mock.calls[0]![0].href).toBe(
    "https://example.test/snow-api/api/v1/ai/conversations/id/messages",
  );
  expect(fetch.mock.calls[0]![1]).toMatchObject({
    credentials: "include",
    signal,
    headers: { "X-CSRF-Token": "csrf-fixture", Accept: "text/event-stream" },
  });
});
it("rejects cross-origin stream URLs before requesting a CSRF token", async () => {
  await expect(
    apiStreamRequest(
      "https://evil.test/messages",
      {},
      new AbortController().signal,
    ),
  ).rejects.toThrow("Invalid stream API path");
  expect(apiRequest).not.toHaveBeenCalled();
});
it("exposes expired-session status without automatically replaying a question", async () => {
  vi.mocked(apiRequest).mockResolvedValue({ csrfToken: "csrf-fixture" });
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ code: 401 }), { status: 401 }),
    );
  vi.stubGlobal("fetch", fetch);
  await expect(
    apiStreamRequest(
      "/ai/conversations/id/messages",
      {},
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ status: 401 });
  expect(fetch).toHaveBeenCalledTimes(1);
});
