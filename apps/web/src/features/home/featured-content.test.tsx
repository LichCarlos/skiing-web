import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
import { apiRequest } from "@/platform/api";
import { loadFeaturedContent } from "@/features/home/featured-content";
import { HomePageView } from "@/features/home/home-page-view";
import {
  resort,
  article,
  dynamic,
} from "@/features/home/home-fixtures.test-helper";
let payloads: Record<string, unknown>;
beforeEach(() => {
  payloads = {
    resorts: { items: [resort] },
    articles: { items: [article] },
    dynamics: { items: [dynamic] },
  };
  vi.mocked(apiRequest)
    .mockReset()
    .mockImplementation(async (path) => payloads[path.split("?")[0]!.slice(1)]);
});
describe("homepage malformed response isolation", () => {
  it.each([
    { resortId: 0 },
    { rating: Number.NaN },
    { rating: Number.POSITIVE_INFINITY },
    { rating: -1 },
    { rating: 6 },
    { region: { ...resort.region, city: null } },
    { fitTags: null },
    { startingPrice: 99 },
    { customFields: [{ fieldKey: "x", label: "字段", value: {} }] },
    { openStatus: "pending" },
    { coverUrl: "broken-image" },
    { ratingCount: -1 },
  ])("isolates an invalid resort card", async (patch) => {
    payloads.resorts = { items: [{ ...resort, ...patch }] };
    const result = await loadFeaturedContent();
    expect(result.resorts.status).toBe("unavailable");
    expect(result.articles.status).toBe("ready");
    expect(result.dynamics.status).toBe("ready");
  });
  it.each([
    { title: {} },
    { category: null },
    { authorName: 7 },
    { publishTime: "not-a-date" },
    { favoriteByMe: "false" },
  ])("isolates an invalid article card", async (patch) => {
    payloads.articles = { items: [{ ...article, ...patch }] };
    const result = await loadFeaturedContent();
    expect(result.articles.status).toBe("unavailable");
    expect(result.resorts.status).toBe("ready");
    expect(result.dynamics.status).toBe("ready");
  });
  it.each([
    { status: "pending" },
    { imageCount: -1 },
    { likeCount: -1 },
    { createdAt: "not-a-date" },
    { author: { ...dynamic.author, userId: "44" } },
    { resort: {} },
  ])("isolates an invalid community card", async (patch) => {
    payloads.dynamics = { items: [{ ...dynamic, ...patch }] };
    const result = await loadFeaturedContent();
    expect(result.dynamics.status).toBe("unavailable");
    expect(result.resorts.status).toBe("ready");
    expect(result.articles.status).toBe("ready");
  });
  it.each(["resorts", "articles", "dynamics"] as const)(
    "rejects invalid %s list shapes without throwing from the view",
    async (key) => {
      for (const body of [null, [], {}, { items: {} }, { items: [null] }]) {
        payloads[key] = body;
        const result = await loadFeaturedContent();
        expect(result[key].status).toBe("unavailable");
        expect(() =>
          renderToStaticMarkup(createElement(HomePageView, result)),
        ).not.toThrow();
      }
    },
  );
  it.each([
    ["resorts", resort, "resortId", 5],
    ["articles", article, "articleId", 3],
    ["dynamics", dynamic, "dynamicId", 3],
  ] as const)(
    "rejects duplicate or over-limit %s lists",
    async (key, item, id, limit) => {
      for (const items of [
        [item, item],
        Array.from({ length: limit + 1 }, (_, index) => ({
          ...item,
          [id]: index + 1,
        })),
      ]) {
        payloads[key] = { items };
        expect((await loadFeaturedContent())[key].status).toBe("unavailable");
      }
    },
  );
  it("accepts five distinct recommended resorts and renders all five detail links", async () => {
    payloads.resorts = {
      items: Array.from({ length: 5 }, (_, index) => ({
        ...resort,
        resortId: index + 1,
      })),
    };
    const result = await loadFeaturedContent();
    expect(result.resorts.status).toBe("ready");
    if (result.resorts.status !== "ready") throw new Error("Expected resorts");
    expect(result.resorts.items).toHaveLength(5);
    const html = renderToStaticMarkup(createElement(HomePageView, result));
    for (let id = 1; id <= 5; id++)
      expect(html).toContain(`href="/resorts/${id}"`);
  });
  it("preserves nullable values, decimal strings, signed images and typed public custom fields", async () => {
    const fields = [null, "text", -1, true, ["one", "two"]].map(
      (value, index) => ({
        fieldKey: `field${index}`,
        label: `字段${index}`,
        value,
      }),
    );
    const coverUrl =
      "https://assets.example.com/resort.jpg?signature=a%2Bb&expires=900";
    payloads.resorts = {
      items: [
        {
          ...resort,
          rating: null,
          startingPrice: "0.00",
          coverUrl,
          customFields: fields,
        },
      ],
    };
    payloads.dynamics = {
      items: [
        {
          ...dynamic,
          imageCount: 9,
          resort: { resortId: 11, name: "北岭雪场" },
          author: { ...dynamic.author, avatarUrl: "legacy-avatar" },
        },
      ],
    };
    const result = await loadFeaturedContent();
    expect(result.resorts).toMatchObject({
      status: "ready",
      items: [
        { rating: null, startingPrice: "0.00", coverUrl, customFields: fields },
      ],
    });
    expect(result.dynamics.status).toBe("ready");
    const html = renderToStaticMarkup(createElement(HomePageView, result));
    expect(html).toContain("暂无评分");
    expect(html).toContain("¥0.00 起");
    expect(html).toContain("9 张");
  });
  it("keeps valid sections renderable when a list body has no item array", async () => {
    payloads.resorts = { items: null };
    const result = await loadFeaturedContent();
    expect(result.resorts).toEqual({ status: "unavailable" });
    const html = renderToStaticMarkup(createElement(HomePageView, result));
    expect(html).toContain("雪场资料暂时无法加载");
    expect(html).toContain("学会观察雪道");
    expect(html).toContain("第一次上雪道");
  });
  it("does not let a malformed score crash the entire homepage", async () => {
    payloads.resorts = { items: [{ ...resort, rating: "4.5" }] };
    const result = await loadFeaturedContent();
    expect(result.resorts.status).toBe("unavailable");
    expect(() =>
      renderToStaticMarkup(createElement(HomePageView, result)),
    ).not.toThrow();
  });
  it("rejects a malformed author only in the community section", async () => {
    payloads.dynamics = { items: [{ ...dynamic, author: null }] };
    const result = await loadFeaturedContent();
    expect(result.dynamics.status).toBe("unavailable");
    expect(result.resorts.status).toBe("ready");
    expect(result.articles.status).toBe("ready");
  });
  it("does not pass extra fields into server-rendered page or client props", async () => {
    payloads.articles = {
      items: [
        {
          ...article,
          internalNote: "private-marker",
          category: { ...article.category, internalNote: "private-marker" },
        },
      ],
    };
    expect(JSON.stringify(await loadFeaturedContent())).not.toContain(
      "private-marker",
    );
  });
  it("makes anonymous public reads without auth refresh", async () => {
    await loadFeaturedContent();
    expect(apiRequest).toHaveBeenCalledTimes(3);
    for (const [, options] of vi.mocked(apiRequest).mock.calls)
      expect(options).toMatchObject({
        cache: "no-store",
        credentials: "omit",
        skipAuthRefresh: true,
      });
  });
});
