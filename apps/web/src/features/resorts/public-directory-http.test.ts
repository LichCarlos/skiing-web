import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApiClient } from "@common/api-contracts/client";
import type { apiRequest } from "@/platform/api";
import {
  loadResortDirectory,
  loadResortFitTags,
  readResortFilters,
} from "@/features/resorts/resort-query";
import {
  loadKnowledgeDirectory,
  readKnowledgeFilters,
} from "@/features/knowledge/knowledge-query";
import { loadFeed, readFeedFilters } from "@/features/community/feed-query";
import {
  resort,
  article,
  dynamic,
} from "@/features/home/home-fixtures.test-helper";

let server: Server;
let request: typeof apiRequest;
let mode: "valid" | "unauthorized" | "invalid" | "broken-json" | "stalled-body";
let requests: Array<{
  path: string;
  method: string;
  cookie?: string;
  authorization?: string;
}>;
let closed: Array<Promise<void>>;
const page = (item: unknown) => ({
  items: [item],
  page: 1,
  pageSize: 12,
  total: 1,
  hasNext: false,
});
beforeEach(async () => {
  requests = [];
  closed = [];
  mode = "valid";
  server = createServer((req, res) => {
    const url = req.url ?? "/";
    requests.push({
      path: url,
      method: req.method ?? "",
      cookie: req.headers.cookie,
      authorization: req.headers.authorization,
    });
    const path = url.split("?")[0]!.replace("/api/v1", "");
    res.writeHead(mode === "unauthorized" ? 401 : 200, {
      "content-type": "application/json",
    });
    if (
      mode === "stalled-body" &&
      ["/resorts", "/knowledge/categories"].includes(path)
    ) {
      closed.push(
        new Promise<void>((resolve) => {
          res.on("close", resolve);
        }),
      );
      res.write('{"code":200,"msg":"ok","data":');
      return;
    }
    if (mode === "broken-json" && path === "/resorts") {
      res.end("{broken json");
      return;
    }
    const body: Record<string, unknown> = {
      "/resorts":
        mode === "invalid" ? page({ ...resort, region: null }) : page(resort),
      "/resorts/fit-tags":
        mode === "invalid" ? [null] : [{ value: "beginner", label: "入门" }],
      "/articles": page(article),
      "/knowledge/categories":
        mode === "invalid" ? [null] : [{ value: "safety", label: "安全" }],
      "/dynamics": {
        items: [
          mode === "invalid" ? { ...dynamic, status: "hidden" } : dynamic,
        ],
        hasNext: true,
        nextCursor: "next_A",
      },
    };
    res.end(
      JSON.stringify({
        code: mode === "unauthorized" ? 401 : 200,
        msg: mode === "unauthorized" ? "private diagnostic" : "success",
        data: mode === "unauthorized" ? null : body[path],
        traceId: "directory-loopback",
      }),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No local test port");
  request = createApiClient(`http://127.0.0.1:${address.port}/api/v1`, {
    credentials: "include",
    csrfProtection: true,
  }).request;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});
async function load() {
  const [resorts, tags, knowledge, feed] = await Promise.all([
    loadResortDirectory(
      readResortFilters({
        keyword: "雪 & %_",
        fitTags: ["a", "b"],
        latitude: "0",
        longitude: "0",
        sortBy: "distance",
      }),
      request,
    ),
    loadResortFitTags(request),
    loadKnowledgeDirectory(
      readKnowledgeFilters({ keyword: "安全 & 雪", categoryValue: "safety" }),
      request,
    ),
    loadFeed(readFeedFilters({ keyword: "雪 & %_", cursor: "old_A" }), request),
  ]);
  return { resorts, tags, knowledge, feed };
}
describe("public directories real Node HTTP with synthetic API", () => {
  it("reads all five endpoints, preserves filters and uses no credentials", async () => {
    const result = await load();
    expect(result.resorts).toMatchObject({
      status: "ready",
      data: page(resort),
    });
    expect(result.tags).toEqual([{ value: "beginner", label: "入门" }]);
    expect(result.knowledge).toMatchObject({
      status: "loaded",
      articles: page(article),
      categories: [{ value: "safety", label: "安全" }],
    });
    expect(result.feed).toMatchObject({
      status: "ready",
      data: { items: [dynamic], hasNext: true, nextCursor: "next_A" },
    });
    expect(requests).toHaveLength(5);
    for (const entry of requests) {
      expect(entry.method).toBe("GET");
      expect(entry.cookie).toBeUndefined();
      expect(entry.authorization).toBeUndefined();
    }
    const resortUrl = new URL(
      requests.find((entry) => entry.path.startsWith("/api/v1/resorts?"))!.path,
      "http://local.invalid",
    );
    expect(resortUrl.searchParams.get("keyword")).toBe("雪 & %_");
    expect(resortUrl.searchParams.getAll("fitTags")).toEqual(["a", "b"]);
    expect(resortUrl.searchParams.get("latitude")).toBe("0");
    expect(resortUrl.searchParams.get("longitude")).toBe("0");
    expect(resortUrl.searchParams.get("sortBy")).toBe("distance");
    expect(resortUrl.searchParams.get("pageSize")).toBe("12");
    const feedUrl = new URL(
      requests.find((entry) => entry.path.startsWith("/api/v1/dynamics?"))!
        .path,
      "http://local.invalid",
    );
    expect(feedUrl.searchParams.get("cursor")).toBe("old_A");
    expect(feedUrl.searchParams.get("limit")).toBe("12");
  });
  it("degrades public 401 responses without csrf/refresh requests or raw diagnostics", async () => {
    mode = "unauthorized";
    const result = await load();
    expect(result).toMatchObject({
      resorts: { status: "error" },
      tags: null,
      knowledge: { status: "loaded", articles: null, categories: null },
      feed: { status: "error" },
    });
    expect(requests).toHaveLength(5);
    expect(requests.some((entry) => entry.path.includes("/auth/"))).toBe(false);
    expect(JSON.stringify(result)).not.toContain("private diagnostic");
  });
  it("isolates malformed card/catalog sections while preserving valid articles", async () => {
    mode = "invalid";
    expect(await load()).toMatchObject({
      resorts: { status: "error" },
      tags: null,
      knowledge: { articles: page(article), categories: null },
      feed: { status: "error" },
    });
    expect(requests).toHaveLength(5);
  });
  it("recovers on a fresh read after invalid JSON without retaining the failed page", async () => {
    mode = "broken-json";
    expect((await load()).resorts.status).toBe("error");
    mode = "valid";
    expect((await load()).resorts).toMatchObject({
      status: "ready",
      data: page(resort),
    });
    expect(requests).toHaveLength(10);
  });
  it("cancels stalled response bodies at the deadline and keeps independent content", async () => {
    mode = "stalled-body";
    expect(await load()).toMatchObject({
      resorts: { status: "error" },
      tags: [{ value: "beginner", label: "入门" }],
      knowledge: { articles: page(article), categories: null },
      feed: { status: "ready" },
    });
    expect(closed).toHaveLength(2);
    await Promise.all(closed);
    expect(requests).toHaveLength(5);
  }, 20_000);
});
