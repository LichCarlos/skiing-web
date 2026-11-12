import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
import { apiRequest } from "@/platform/api";
import { publicDetailMetadata } from "@/features/public-content/public-metadata";
import { readAnonymousPublic } from "@/features/public-content/public-detail";
import * as resort from "@/app/resorts/[resortId]/page";
import * as article from "@/app/knowledge/[articleId]/page";
import * as dynamic from "@/app/dynamics/[dynamicId]/page";
import {
  resort as resortDetail,
  article as articleDetail,
  dynamic as dynamicDetail,
} from "@/features/public-content/public-detail-fixtures.test-helper";

const request = vi.mocked(apiRequest);
const items = {
  resort: {
    ...resortDetail,
    resortId: 7,
    name: "雪山",
    description: " 粉雪\n与雪道 ",
    contactPhone: "private",
    coverUrl: "https://assets.test/signed?token=secret",
  },
  article: {
    ...articleDetail,
    articleId: 7,
    title: "滑雪技巧",
    summary: "重心与转弯",
    content: "private body",
  },
  dynamic: {
    ...dynamicDetail,
    dynamicId: 7,
    author: { ...dynamicDetail.author, nickname: "雪友" },
    summary: "今日雪况",
    status: "published",
  },
};
beforeEach(() => {
  request.mockReset();
  vi.stubEnv("NEXT_PUBLIC_WEB_SITE_ORIGIN", "https://snow.example");
  request.mockImplementation(async (path) => {
    if (path === "/public/config") return { siteName: "凛迹雪客" } as never;
    if (path === "/resorts/7") return items.resort as never;
    if (path === "/articles/7") return items.article as never;
    if (path === "/dynamics/7") return items.dynamic as never;
    throw new Error("Unexpected request");
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("public detail sharing integration", () => {
  it.each([
    [
      "resort",
      () =>
        resort.generateMetadata({ params: Promise.resolve({ resortId: "7" }) }),
      "雪山",
    ],
    [
      "article",
      () =>
        article.generateMetadata({
          params: Promise.resolve({ articleId: "7" }),
        }),
      "滑雪技巧",
    ],
    [
      "dynamic",
      () =>
        dynamic.generateMetadata({
          params: Promise.resolve({ dynamicId: "7" }),
        }),
      "雪友的雪友动态",
    ],
  ] as const)(
    "passes async route params to metadata for %s",
    async (_kind, generate, title) => {
      expect((await generate()).title).toBe(`${title} · 凛迹雪客`);
    },
  );
});

describe("public sharing metadata behavior", () => {
  it.each([
    ["resort", "雪山", "/resorts/7", "粉雪 与雪道"],
    ["article", "滑雪技巧", "/knowledge/7", "重心与转弯"],
    ["dynamic", "雪友的雪友动态", "/dynamics/7", "今日雪况"],
  ] as const)(
    "projects public sharing data for %s",
    async (kind, title, path, description) => {
      const metadata = await publicDetailMetadata(kind, "7");
      expect(metadata.title).toBe(`${title} · 凛迹雪客`);
      expect(metadata.description).toBe(description);
      expect(metadata.alternates).toEqual({
        canonical: `https://snow.example${path}`,
      });
      expect(metadata.openGraph).toMatchObject({
        title: metadata.title,
        description,
        url: `https://snow.example${path}`,
        siteName: "凛迹雪客",
        images: [],
      });
      expect(metadata.twitter).toMatchObject({ card: "summary", images: [] });
      expect(metadata.robots).toEqual({ index: true, follow: true });
      expect(JSON.stringify(metadata)).not.toMatch(
        /token=|private|contactPhone/,
      );
      for (const [, options] of request.mock.calls)
        expect(options).toMatchObject({
          cache: "no-store",
          credentials: "omit",
          skipAuthRefresh: true,
          signal: expect.any(AbortSignal),
        });
    },
  );
  it.each([undefined, "", "   "])(
    "omits URLs without explicit origin %s",
    async (origin) => {
      vi.stubEnv("NEXT_PUBLIC_WEB_SITE_ORIGIN", origin);
      const metadata = await publicDetailMetadata("resort", "7");
      expect(metadata.alternates).toBeUndefined();
      expect(metadata.openGraph).not.toHaveProperty("url");
    },
  );
  it.each([
    "https://snow.example/path",
    "https://user:pass@snow.example",
    "https://snow.example?q=1",
    "https://snow.example#part",
    "ftp://snow.example",
    "invalid",
  ])("rejects invalid explicit origin %s", async (origin) => {
    vi.stubEnv("NEXT_PUBLIC_WEB_SITE_ORIGIN", origin);
    await expect(publicDetailMetadata("article", "7")).rejects.toThrow(
      /NEXT_PUBLIC_WEB_SITE_ORIGIN/,
    );
    expect(request).not.toHaveBeenCalled();
  });
  it.each(["0", "-1", "01", "7abc", "2147483648", "1.5"])(
    "rejects invalid id before requests %s",
    async (id) => {
      await expect(publicDetailMetadata("resort", id)).rejects.toThrow(
        "NOT_FOUND",
      );
      expect(request).not.toHaveBeenCalled();
    },
  );
  it("preserves not-found behavior", async () => {
    request.mockRejectedValue(
      new ApiError("missing", { status: 404, code: null, traceId: null }),
    );
    await expect(publicDetailMetadata("resort", "7")).rejects.toThrow(
      "NOT_FOUND",
    );
  });
  it("prevents indexing on upstream failure without exposing errors", async () => {
    request.mockRejectedValue(new Error("secret socket details"));
    const metadata = await publicDetailMetadata("article", "7");
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates).toBeUndefined();
    expect(JSON.stringify(metadata)).not.toContain("secret");
  });
  it.each([
    ["resort", { ...items.resort, resortId: 8 }],
    ["resort", { ...items.resort, name: "\u0000" }],
    ["article", { ...items.article, summary: null }],
    ["dynamic", { ...items.dynamic, status: "hidden" }],
    ["dynamic", { ...items.dynamic, author: null }],
  ] as const)(
    "does not index invalid sharing projection for %s",
    async (kind, item) => {
      request.mockResolvedValue(item as never);
      expect((await publicDetailMetadata(kind, "7")).robots).toEqual({
        index: false,
        follow: true,
      });
    },
  );
  it("uses brand fallback when config fails", async () => {
    request.mockImplementation(async (path) => {
      if (path === "/public/config") throw new Error("offline");
      return items.article as never;
    });
    expect((await publicDetailMetadata("article", "7")).title).toBe(
      "滑雪技巧 · 凛迹雪客",
    );
  });
  it.each(["resort", "article", "dynamic"] as const)(
    "handles blank description and control-only brand for %s",
    async (kind) => {
      request.mockImplementation(
        async (path) =>
          (path === "/public/config"
            ? { siteName: "\u0000" }
            : {
                ...items[kind],
                description: " \n\u0000",
                summary: " \t\u0000",
              }) as never,
      );
      const metadata = await publicDetailMetadata(kind, "7");
      expect(String(metadata.description).trim().length).toBeGreaterThan(0);
      expect(metadata.title).toContain("凛迹雪客");
    },
  );
  it("limits Unicode text without splitting surrogate pairs", async () => {
    request.mockImplementation(
      async (path) =>
        (path === "/public/config"
          ? { siteName: "雪".repeat(50) }
          : {
              ...items.article,
              title: "🎿".repeat(120),
              summary: "🎿".repeat(200),
            }) as never,
    );
    const metadata = await publicDetailMetadata("article", "7");
    expect([...String(metadata.title)]).toHaveLength(80);
    expect([...String(metadata.description)]).toHaveLength(160);
    expect(String(metadata.title).split(" · ")[0]).toBe("🎿".repeat(27));
  });
  it("uses the current public site name", async () => {
    request.mockImplementation(
      async (path) =>
        (path === "/public/config"
          ? { siteName: " 新雪季 \n" }
          : items.article) as never,
    );
    expect((await publicDetailMetadata("article", "7")).title).toBe(
      "滑雪技巧 · 新雪季",
    );
  });
  it("clears a successful read timeout", async () => {
    vi.useFakeTimers();
    await readAnonymousPublic("/resorts/7");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("aborts stalled reads and clears the timeout", async () => {
    vi.useFakeTimers();
    request.mockImplementation(
      (_path, options) =>
        new Promise((_resolve, reject) =>
          options?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          ),
        ),
    );
    const pending = expect(readAnonymousPublic("/resorts/7")).rejects.toThrow(
      "aborted",
    );
    await vi.advanceTimersByTimeAsync(10_000);
    await pending;
    expect(vi.getTimerCount()).toBe(0);
  });
});

it("includes the deployment prefix in public canonical links", async () => {
  vi.stubEnv("NEXT_PUBLIC_WEB_BASE_PATH", "/snow");
  const metadata = await publicDetailMetadata("resort", "7");
  expect(metadata.alternates?.canonical).toBe(
    "https://snow.example/snow/resorts/7",
  );
});
