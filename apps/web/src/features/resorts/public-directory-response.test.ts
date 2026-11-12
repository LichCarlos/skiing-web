import { describe, expect, it, vi } from "vitest";
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
import { readAnonymousPublic } from "@/features/public-content/public-read";

const page = (item: unknown) => ({
  items: [item],
  total: 1,
  page: 1,
  pageSize: 12,
  hasNext: false,
});
const requestFor = (value: unknown) =>
  vi.fn().mockResolvedValue(value) as typeof apiRequest;
describe("public directory response regressions", () => {
  it("rejects malformed resort regions before rendering", async () => {
    expect(
      await loadResortDirectory(
        readResortFilters({}),
        requestFor(page({ ...resort, region: null })),
      ),
    ).toMatchObject({ status: "error" });
  });
  it("rejects malformed fit tag options independently", async () => {
    expect(await loadResortFitTags(requestFor([null]))).toBeNull();
  });
  it("isolates malformed article records from valid categories", async () => {
    const request = vi
      .fn()
      .mockImplementation(async (path: string) =>
        path.startsWith("/articles")
          ? page({ ...article, category: null })
          : [{ value: "safety", label: "安全" }],
      );
    expect(
      await loadKnowledgeDirectory(
        readKnowledgeFilters({}),
        request as typeof apiRequest,
      ),
    ).toMatchObject({
      status: "loaded",
      articles: null,
      categories: [{ value: "safety", label: "安全" }],
    });
  });
  it("isolates malformed categories from valid articles", async () => {
    const request = vi
      .fn()
      .mockImplementation(async (path: string) =>
        path.startsWith("/articles") ? page(article) : [null],
      );
    expect(
      await loadKnowledgeDirectory(
        readKnowledgeFilters({}),
        request as typeof apiRequest,
      ),
    ).toMatchObject({
      status: "loaded",
      articles: page(article),
      categories: null,
    });
  });
  it("rejects nonpublished feed cards", async () => {
    expect(
      await loadFeed(
        readFeedFilters({}),
        requestFor({
          items: [{ ...dynamic, status: "hidden" }],
          hasNext: false,
          nextCursor: null,
        }),
      ),
    ).toMatchObject({ status: "error" });
  });
  it("projects only public resort fields", async () => {
    const result = await loadResortDirectory(
      readResortFilters({}),
      requestFor({
        ...page({
          ...resort,
          merchantContact: "private",
          region: { ...resort.region, internal: "private" },
        }),
        diagnostic: "private",
      }),
    );
    expect(JSON.stringify(result)).not.toContain("private");
    expect(result.status).toBe("ready");
  });
  it("makes public list reads anonymous without authentication refresh", async () => {
    const request = vi.fn().mockResolvedValue(page(resort));
    await loadResortDirectory(
      readResortFilters({}),
      request as typeof apiRequest,
    );
    expect(request).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        cache: "no-store",
        credentials: "omit",
        skipAuthRefresh: true,
        signal: expect.any(AbortSignal),
      }),
    );
  });
});

describe("public directory pagination and projection", () => {
  it.each([
    null,
    { ...page(resort), items: null },
    { ...page(resort), items: [null] },
    { ...page(resort), items: [resort, resort], total: 2 },
    {
      ...page(resort),
      items: Array.from({ length: 13 }, (_, index) => ({
        ...resort,
        resortId: index + 1,
      })),
      total: 13,
      hasNext: true,
    },
    { ...page(resort), page: 2 },
    { ...page(resort), pageSize: 20 },
    { ...page(resort), total: -1 },
    { ...page(resort), total: 0.5 },
    { ...page(resort), total: "1" },
    { ...page(resort), total: 0 },
    { ...page(resort), hasNext: true },
    { ...page(resort), hasNext: "false" },
    page({ ...resort, resortId: 2147483648 }),
    page({ ...resort, rating: "4.5" }),
    page({ ...resort, distanceMeters: -1 }),
    page({ ...resort, coverUrl: "https://user:password@invalid.test/image" }),
  ])("rejects malformed resort pages %j", async (value) => {
    expect(
      await loadResortDirectory(readResortFilters({}), requestFor(value)),
    ).toMatchObject({ status: "error" });
  });
  it.each([
    null,
    {},
    [null],
    [{ value: "", label: "empty" }],
    [{ value: "a", label: {} }],
    [
      { value: "a", label: "A" },
      { value: "a", label: "B" },
    ],
  ])("rejects malformed tag catalogs %j", async (value) => {
    expect(await loadResortFitTags(requestFor(value))).toBeNull();
  });
  it.each([
    { items: [dynamic], hasNext: true, nextCursor: null },
    { items: [dynamic], hasNext: true, nextCursor: "same_cursor" },
    { items: [], hasNext: true, nextCursor: "next_cursor" },
    { items: [dynamic], hasNext: true, nextCursor: "?invalid" },
    { items: [dynamic], hasNext: true, nextCursor: "a".repeat(513) },
    { items: [dynamic], hasNext: false, nextCursor: "next_cursor" },
    { items: [dynamic, dynamic], hasNext: false, nextCursor: null },
    { items: [{ ...dynamic, author: null }], hasNext: false, nextCursor: null },
  ])("rejects malformed or looping feeds %j", async (value) => {
    expect(
      await loadFeed(
        readFeedFilters({ cursor: "same_cursor" }),
        requestFor(value),
      ),
    ).toMatchObject({ status: "error" });
  });
  it("preserves precise prices, signed images, zero coordinates/distances and allowed field values", async () => {
    const url = "https://storage.invalid/a?X-Signature=a%2Fb&expires=900";
    const value = {
      ...resort,
      coverUrl: url,
      rating: 0,
      ratingCount: 0,
      startingPrice: "9999999999999999.99",
      distanceMeters: 0,
      customFields: [
        { fieldKey: "levels", label: "等级", value: ["a", "b"], private: true },
      ],
    };
    const result = await loadResortDirectory(
      readResortFilters({ latitude: "0", longitude: "0" }),
      requestFor(page(value)),
    );
    expect(result).toMatchObject({
      status: "ready",
      data: {
        items: [
          {
            coverUrl: url,
            startingPrice: "9999999999999999.99",
            distanceMeters: 0,
            rating: 0,
            customFields: [
              { fieldKey: "levels", label: "等级", value: ["a", "b"] },
            ],
          },
        ],
      },
    });
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it("projects categories and article/feed records without additional fields", async () => {
    const request = vi.fn().mockImplementation(async (path: string) =>
      path.startsWith("/articles")
        ? {
            ...page({
              ...article,
              category: { ...article.category, secret: "private" },
              sourceUrl: "private",
            }),
            secret: "private",
          }
        : [{ value: "safety", label: "安全", secret: "private" }],
    );
    const result = await loadKnowledgeDirectory(
      readKnowledgeFilters({}),
      request as typeof apiRequest,
    );
    expect(result).toMatchObject({
      status: "loaded",
      articles: page(article),
      categories: [{ value: "safety", label: "安全" }],
    });
    const feed = await loadFeed(
      readFeedFilters({}),
      requestFor({
        items: [
          {
            ...dynamic,
            author: { ...dynamic.author, account: "private" },
            content: "private",
          },
        ],
        hasNext: true,
        nextCursor: "next_A",
      }),
    );
    expect(feed).toMatchObject({
      status: "ready",
      data: { items: [dynamic], nextCursor: "next_A" },
    });
    expect(JSON.stringify([result, feed])).not.toContain("private");
  });
  it("keeps valid empty catalogs and out-of-range pages", async () => {
    expect(await loadResortFitTags(requestFor([]))).toEqual([]);
    expect(
      await loadResortDirectory(
        readResortFilters({ page: "3" }),
        requestFor({
          items: [],
          total: 2,
          page: 3,
          pageSize: 12,
          hasNext: false,
        }),
      ),
    ).toMatchObject({
      status: "ready",
      data: { items: [], total: 2, page: 3 },
    });
    expect(
      await loadFeed(
        readFeedFilters({ cursor: "old_A" }),
        requestFor({ items: [], hasNext: false, nextCursor: null }),
      ),
    ).toMatchObject({ status: "ready", data: { items: [], nextCursor: null } });
  });
  it("catches a synchronous request failure in each knowledge section", async () => {
    const request = vi.fn(() => {
      throw new Error("private internal failure");
    });
    expect(
      await loadKnowledgeDirectory(
        readKnowledgeFilters({}),
        request as typeof apiRequest,
      ),
    ).toMatchObject({ status: "loaded", articles: null, categories: null });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("discards a late success after the read deadline and clears the timer", async () => {
    vi.useFakeTimers();
    try {
      let finish!: (value: unknown) => void;
      const request = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const pending = expect(
        readAnonymousPublic("/resorts", request as typeof apiRequest),
      ).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(10_000);
      finish(page(resort));
      await pending;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
