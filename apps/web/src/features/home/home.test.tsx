import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/platform/api";
import {
  loadFeaturedContent,
  type FeaturedContent,
} from "@/features/home/featured-content";
import { HomePageView } from "@/features/home/home-page-view";

vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
// Next's static image loader returns metadata; Vite's default asset loader returns a URL.
vi.mock("@/features/home/assets/alpine-landscape.webp", () => ({
  default: { src: "/assets/alpine-landscape.webp", width: 1800, height: 1192 },
}));
vi.mock("@/features/home/assets/alpine-landscape-mobile.webp", () => ({
  default: {
    src: "/assets/alpine-landscape-mobile.webp",
    width: 800,
    height: 530,
  },
}));
afterEach(() => vi.resetAllMocks());

const ready: FeaturedContent = {
  resorts: {
    status: "ready",
    items: [
      {
        resortId: 11,
        name: "北岭雪场",
        region: { province: "河北", city: "张家口", district: null },
        coverUrl: null,
        rating: 4.5,
        ratingCount: 2,
        distanceMeters: null,
        startingPrice: "99.00",
        fitTags: [{ value: "beginner", label: "入门" }],
        openStatus: "open",
        favoriteByMe: false,
        customFields: [],
      },
    ],
  },
  articles: {
    status: "ready",
    items: [
      {
        articleId: 22,
        favoriteByMe: false,
        title: "安全入门 <script>alert(1)</script>",
        summary: "学会观察雪道",
        coverUrl: null,
        category: { value: "safety", label: "安全" },
        authorName: "雪场教练",
        publishTime: "2026-10-29T00:00:00Z",
      },
    ],
  },
  dynamics: {
    status: "ready",
    items: [
      {
        dynamicId: 33,
        author: { userId: 44, nickname: "雪友小白", avatarUrl: null },
        summary: "第一次上雪道",
        coverUrl: null,
        imageCount: 0,
        resort: { resortId: 11, name: "北岭雪场" },
        likeCount: 5,
        commentCount: 2,
        likedByMe: false,
        status: "published",
        createdAt: "2026-10-28T02:00:00Z",
      },
    ],
  },
};

function render(content: FeaturedContent) {
  return renderToStaticMarkup(createElement(HomePageView, content));
}

describe("homepage public content", () => {
  it("renders the grid opening and retains direct resort links on community cards", () => {
    const html = render(ready);
    expect(html).toContain("data-home-opening");
    expect(html).toContain('id="opening-title"');
    expect(html).not.toContain("--tile-delay:");
    expect(html).not.toContain("浏览目录");
    expect(html).toContain("<span>生活向前，</span>");
    expect(html).toContain("<span>快乐向山。</span>");
    expect(html).toContain('aria-label="查看关联雪场：北岭雪场"');
    expect(html).not.toContain("<canvas");
  });
  it("provides a keyboard skip target and a high-priority decorative hero image", () => {
    const html = render(ready);
    expect(html).toContain('href="#main-content"');
    expect(html).toContain('id="main-content" tabindex="-1"');
    expect(html).toContain('aria-labelledby="home-title"');
    expect(html).toContain('fetchPriority="high"');
    expect(html).toContain('loading="eager"');
    expect(html).toContain('alt=""');
  });

  it("keeps the landscape illustrative, uses a mobile source and never presents it as a resort cover", () => {
    const html = render(ready);
    expect(html).toContain('media="(max-width: 760px)"');
    expect(html).toContain('type="image/webp"');
    expect(html).toContain('srcSet="/assets/alpine-landscape-mobile.webp"');
    expect(html).toContain("雪山意象 · 非雪场实拍");
    expect(html).toContain("暂无雪场图片");
    expect(html).toContain('href="#resort-discovery"');
    expect(html).not.toContain('alt="北岭雪场雪场"');
    expect(html).not.toContain("images.unsplash.com");
  });

  it("keeps real uploaded covers when public content provides them", () => {
    if (
      ready.resorts.status !== "ready" ||
      ready.articles.status !== "ready" ||
      ready.dynamics.status !== "ready"
    )
      throw new Error("Invalid fixture");
    const html = render({
      resorts: {
        status: "ready",
        items: [
          {
            ...ready.resorts.items[0]!,
            coverUrl: "https://media.example/resort.webp",
          },
        ],
      },
      articles: {
        status: "ready",
        items: [
          {
            ...ready.articles.items[0]!,
            coverUrl: "https://media.example/article.webp",
          },
        ],
      },
      dynamics: {
        status: "ready",
        items: [
          {
            ...ready.dynamics.items[0]!,
            coverUrl: "https://media.example/dynamic.webp",
            imageCount: 2,
          },
        ],
      },
    });
    for (const kind of ["resort", "article", "dynamic"])
      expect(html).toContain(`src="https://media.example/${kind}.webp"`);
    expect(html).not.toContain("暂无雪场图片");
    expect(html).toContain("2 张");
  });

  it("requests only bounded public endpoints without caching personalized data", async () => {
    vi.mocked(apiRequest).mockImplementation(async (path) => {
      if (path.startsWith("/resorts?"))
        return {
          items: ready.resorts.status === "ready" ? ready.resorts.items : [],
        };
      if (path.startsWith("/articles?"))
        return {
          items: ready.articles.status === "ready" ? ready.articles.items : [],
        };
      return {
        items: ready.dynamics.status === "ready" ? ready.dynamics.items : [],
      };
    });
    expect(await loadFeaturedContent()).toEqual(ready);
    expect(apiRequest).toHaveBeenCalledTimes(3);
    for (const path of [
      "/resorts?page=1&pageSize=5&sortBy=rating&sortOrder=desc",
      "/articles?page=1&pageSize=3",
      "/dynamics?limit=3",
    ])
      expect(apiRequest).toHaveBeenCalledWith(path, {
        cache: "no-store",
        credentials: "omit",
        skipAuthRefresh: true,
        signal: expect.any(AbortSignal),
      });
  });

  it("starts all three reads before waiting and preserves successful sections on partial failure", async () => {
    let release!: (value: { items: unknown[] }) => void;
    vi.mocked(apiRequest)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          release = resolve;
        }),
      )
      .mockRejectedValueOnce(new Error("article unavailable"))
      .mockResolvedValueOnce({
        items: ready.dynamics.status === "ready" ? ready.dynamics.items : [],
      });
    const pending = loadFeaturedContent();
    expect(apiRequest).toHaveBeenCalledTimes(3);
    release({ items: [] });
    expect(await pending).toEqual({
      resorts: { status: "ready", items: [] },
      articles: { status: "unavailable" },
      dynamics: ready.dynamics,
    });
  });

  it("renders actual VO content, dates and direct detail links as escaped text", () => {
    const html = render(ready);
    for (const value of [
      "北岭雪场",
      "河北",
      "4.5",
      "99.00",
      "入门",
      "学会观察雪道",
      "安全",
      "雪场教练",
      "雪友小白",
      "第一次上雪道",
      'href="/resorts/11"',
      'href="/knowledge/22"',
      'href="/dynamics/33"',
      'dateTime="2026-10-29T00:00:00Z"',
      'dateTime="2026-10-28T02:00:00Z"',
      "&lt;script&gt;",
    ])
      expect(html).toContain(value);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("正在准备中");
  });

  it("keeps content and browse links when another section fails without exposing raw errors", () => {
    const html = render({ ...ready, articles: { status: "unavailable" } });
    expect(html).toContain("知识文章暂时无法加载");
    expect(html).toContain("北岭雪场");
    expect(html).toContain("第一次上雪道");
    expect(html).toContain('href="/knowledge"');
    expect(html).not.toContain("学会观察雪道");
  });

  it("distinguishes empty public content from service failure", () => {
    const html = render({
      resorts: { status: "ready", items: [] },
      articles: { status: "ready", items: [] },
      dynamics: { status: "ready", items: [] },
    });
    expect(html).toContain("雪场资料正在整理中");
    expect(html).toContain("暂时没有公开文章");
    expect(html).toContain("还没有公开动态");
    expect(html).not.toContain("暂时无法加载");
  });

  it("keeps navigation usable when every public service fails", async () => {
    vi.mocked(apiRequest).mockRejectedValue(
      new Error("internal credentials must not appear"),
    );
    const result = await loadFeaturedContent();
    const html = render(result);
    for (const label of [
      "雪场资料暂时无法加载",
      "知识文章暂时无法加载",
      "雪友动态暂时无法加载",
    ])
      expect(html).toContain(label);
    for (const route of ["/resorts", "/knowledge", "/dynamics"])
      expect(html).toContain(`href="${route}"`);
    expect(html).not.toContain("internal credentials");
  });
});
