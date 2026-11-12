import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient } from "@common/api-contracts/client";
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dynamics",
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
import { apiRequest } from "@/platform/api";
import { readPublicDetail } from "@/features/public-content/public-detail";
import DynamicPage from "@/app/dynamics/[dynamicId]/page";
import {
  resort,
  article,
  dynamic,
  comments,
  comment,
} from "@/features/public-content/public-detail-fixtures.test-helper";
let server: Server;
let mode: "valid" | "missing" | "unauthorized" | "invalid" | "stalled";
let requests: Array<{
  path: string;
  method: string;
  cookie?: string;
  authorization?: string;
}>;
let disconnected: Promise<void>;
beforeEach(async () => {
  mode = "valid";
  requests = [];
  let markDisconnected!: () => void;
  disconnected = new Promise<void>((resolve) => {
    markDisconnected = resolve;
  });
  server = createServer((req, res) => {
    const path = req.url ?? "/";
    requests.push({
      path,
      method: req.method ?? "",
      cookie: req.headers.cookie,
      authorization: req.headers.authorization,
    });
    const key = path.split("?")[0]!.replace("/api/v1", "");
    const status =
      mode === "missing" ? 404 : mode === "unauthorized" ? 401 : 200;
    res.writeHead(status, { "content-type": "application/json" });
    if (mode === "stalled" && key.endsWith("/comments")) {
      res.on("close", markDisconnected);
      res.write('{"code":200,"msg":"success","data":');
      return;
    }
    const data: Record<string, unknown> = {
      "/resorts/7":
        mode === "invalid"
          ? { ...resort, galleryUrls: null }
          : { ...resort, private: "secret" },
      "/articles/7": { ...article, sourceUrl: "secret" },
      "/dynamics/7": { ...dynamic, moderationReason: "secret" },
      "/dynamics/7/comments":
        mode === "invalid"
          ? { ...comments, items: [{ ...comment, author: null }] }
          : comments,
    };
    res.end(
      JSON.stringify({
        code: status,
        msg: status === 200 ? "success" : "private diagnostic",
        traceId: "detail-loopback",
        data: status === 200 ? data[key] : null,
      }),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No local test port");
  const client = createApiClient(`http://127.0.0.1:${address.port}/api/v1`, {
    credentials: "include",
    csrfProtection: true,
  });
  vi.mocked(apiRequest).mockImplementation(client.request);
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  vi.mocked(apiRequest).mockReset();
});
async function load() {
  return Promise.allSettled([
    readPublicDetail("resort", "7"),
    readPublicDetail("article", "7"),
    DynamicPage({
      params: Promise.resolve({ dynamicId: "7" }),
      searchParams: Promise.resolve({}),
    }),
  ]);
}
describe("public detail real Node HTTP with synthetic API", () => {
  it("projects all detail envelopes and renders visible comments without credential headers", async () => {
    const results = await load();
    expect(results[0]).toEqual({ status: "fulfilled", value: resort });
    expect(results[1]).toEqual({ status: "fulfilled", value: article });
    if (results[2].status !== "fulfilled")
      throw new Error("Expected dynamic page");
    const html = renderToStaticMarkup(results[2].value);
    expect(html).toContain("&lt;雪道正文&gt;");
    expect(html).toContain("&lt;公开评论&gt;");
    expect(html).not.toContain("secret");
    expect(requests).toHaveLength(4);
    for (const entry of requests) {
      expect(entry.method).toBe("GET");
      expect(entry.cookie).toBeUndefined();
      expect(entry.authorization).toBeUndefined();
    }
    expect(requests.map((entry) => entry.path)).toContain(
      "/api/v1/dynamics/7/comments?page=1&pageSize=20",
    );
  });
  it("preserves actual HTTP 404 for readers and the route not-found path", async () => {
    mode = "missing";
    const results = await load();
    for (const result of results.slice(0, 2)) {
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.reason).toBeInstanceOf(ApiError);
        expect(result.reason.status).toBe(404);
      }
    }
    expect(results[2]).toMatchObject({
      status: "rejected",
      reason: new Error("NOT_FOUND"),
    });
    expect(requests).toHaveLength(3);
  });
  it("does not refresh authentication on public 401 and hides raw diagnostics", async () => {
    mode = "unauthorized";
    const results = await load();
    expect(results[0].status).toBe("rejected");
    expect(results[1].status).toBe("rejected");
    if (results[2].status !== "fulfilled")
      throw new Error("Expected safe error page");
    const html = renderToStaticMarkup(results[2].value);
    expect(html).toContain("动态详情暂时无法加载");
    expect(html).not.toContain("private diagnostic");
    expect(requests).toHaveLength(3);
    expect(requests.some((entry) => entry.path.includes("/auth/"))).toBe(false);
  });
  it("rejects malformed resort data while retaining the article and dynamic with comment recovery", async () => {
    mode = "invalid";
    const results = await load();
    expect(results[0].status).toBe("rejected");
    expect(results[1]).toEqual({ status: "fulfilled", value: article });
    if (results[2].status !== "fulfilled")
      throw new Error("Expected dynamic page");
    const html = renderToStaticMarkup(results[2].value);
    expect(html).toContain("&lt;雪道正文&gt;");
    expect(html).toContain("评论暂时无法加载");
    expect(html).toContain("/dynamics/7?page=1");
  });
  it("cancels stalled comment bodies at 10 seconds and retains the detail", async () => {
    mode = "stalled";
    const results = await load();
    expect(results[0].status).toBe("fulfilled");
    expect(results[1].status).toBe("fulfilled");
    if (results[2].status !== "fulfilled")
      throw new Error("Expected dynamic page");
    const html = renderToStaticMarkup(results[2].value);
    expect(html).toContain("&lt;雪道正文&gt;");
    expect(html).toContain("评论暂时无法加载");
    await disconnected;
    expect(requests).toHaveLength(4);
  }, 20_000);
});
