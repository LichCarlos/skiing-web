import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "@common/api-contracts/client";
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
import { apiRequest } from "@/platform/api";
import { loadFeaturedContent } from "@/features/home/featured-content";
import {
  resort,
  article,
  dynamic,
} from "@/features/home/home-fixtures.test-helper";
let server: Server;
let mode: "valid" | "unauthorized" | "invalid" | "broken-json" | "stalled-body";
let disconnected: Promise<void>;
let requests: Array<{
  method: string;
  path: string;
  cookie?: string;
  authorization?: string;
}>;
beforeEach(async () => {
  mode = "valid";
  requests = [];
  let markDisconnected!: () => void;
  disconnected = new Promise<void>((resolve) => {
    markDisconnected = resolve;
  });
  const data: Record<string, unknown> = {
    resorts: { items: [resort] },
    articles: { items: [article] },
    dynamics: { items: [dynamic] },
  };
  server = createServer((req, res) => {
    const path = req.url ?? "/";
    requests.push({
      method: req.method ?? "",
      path,
      cookie: req.headers.cookie,
      authorization: req.headers.authorization,
    });
    const key = path.split("?")[0]!.split("/").at(-1)!;
    const status = mode === "unauthorized" ? 401 : 200;
    res.writeHead(status, { "content-type": "application/json" });
    if (mode === "stalled-body" && key === "resorts") {
      res.on("close", markDisconnected);
      res.write('{"code":200,"msg":"success","data":');
      return;
    }
    if (mode === "broken-json" && key === "resorts") {
      res.end("{not json}");
      return;
    }
    res.end(
      JSON.stringify({
        code: status,
        msg: status === 401 ? "private error must be hidden" : "success",
        traceId: "homepage-loopback",
        data:
          status === 401
            ? null
            : mode === "invalid" && key === "resorts"
              ? { items: [{ ...resort, region: null }] }
              : data[key],
      }),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test address");
  const client = createApiClient(`http://127.0.0.1:${address.port}/api/v1`, {
    credentials: "include",
    csrfProtection: true,
  });
  vi.mocked(apiRequest).mockReset().mockImplementation(client.request);
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  vi.clearAllMocks();
});
describe("homepage real HTTP transport with synthetic API", () => {
  it("bounds a stalled response body and cancels that request while retaining other sections", async () => {
    mode = "stalled-body";
    const result = await loadFeaturedContent();
    expect(result.resorts.status).toBe("unavailable");
    expect(result.articles.status).toBe("ready");
    expect(result.dynamics.status).toBe("ready");
    await disconnected;
    expect(requests).toHaveLength(3);
  }, 20_000);
  it("unwraps all public responses without forwarding credentials or extra calls", async () => {
    const result = await loadFeaturedContent();
    expect(result).toEqual({
      resorts: { status: "ready", items: [resort] },
      articles: { status: "ready", items: [article] },
      dynamics: { status: "ready", items: [dynamic] },
    });
    expect(requests).toHaveLength(3);
    for (const req of requests) {
      expect(req.method).toBe("GET");
      expect(req.cookie).toBeUndefined();
      expect(req.authorization).toBeUndefined();
    }
    expect(requests.map((req) => req.path).sort()).toEqual([
      "/api/v1/articles?page=1&pageSize=3",
      "/api/v1/dynamics?limit=3",
      "/api/v1/resorts?page=1&pageSize=5&sortBy=rating&sortOrder=desc",
    ]);
  });
  it("does not call auth/csrf or refresh when public endpoints return 401", async () => {
    mode = "unauthorized";
    const result = await loadFeaturedContent();
    expect(result).toEqual({
      resorts: { status: "unavailable" },
      articles: { status: "unavailable" },
      dynamics: { status: "unavailable" },
    });
    expect(requests).toHaveLength(3);
    expect(requests.every((req) => !req.path.includes("/auth/"))).toBe(true);
    expect(JSON.stringify(result)).not.toContain("private error");
  });
  it("isolates malformed successful JSON to its content section", async () => {
    mode = "invalid";
    const result = await loadFeaturedContent();
    expect(result.resorts.status).toBe("unavailable");
    expect(result.articles.status).toBe("ready");
    expect(result.dynamics.status).toBe("ready");
  });
  it("recovers on the next page read after invalid JSON without caching the error", async () => {
    mode = "broken-json";
    expect((await loadFeaturedContent()).resorts.status).toBe("unavailable");
    mode = "valid";
    expect((await loadFeaturedContent()).resorts).toEqual({
      status: "ready",
      items: [resort],
    });
    expect(requests).toHaveLength(6);
  });
});
