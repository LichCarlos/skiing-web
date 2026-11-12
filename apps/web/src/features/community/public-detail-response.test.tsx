import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dynamics",
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
import { apiRequest } from "@/platform/api";
import {
  readPublicDetail,
  readPublicComments,
} from "@/features/public-content/public-detail";
import { publicDetailMetadata } from "@/features/public-content/public-metadata";
import ResortPage from "@/app/resorts/[resortId]/page";
import ArticlePage from "@/app/knowledge/[articleId]/page";
import DynamicPage from "@/app/dynamics/[dynamicId]/page";
import {
  resort,
  article,
  dynamic,
  comments,
  comment,
} from "@/features/public-content/public-detail-fixtures.test-helper";
const request = vi.mocked(apiRequest);
const detail = () =>
  DynamicPage({
    params: Promise.resolve({ dynamicId: "7" }),
    searchParams: Promise.resolve({}),
  });
beforeEach(() => request.mockReset());
describe("public detail response regressions", () => {
  it("contains malformed resort galleries in the detail error state", async () => {
    request.mockResolvedValue({ ...resort, galleryUrls: null });
    const html = renderToStaticMarkup(
      await ResortPage({ params: Promise.resolve({ resortId: "7" }) }),
    );
    expect(html).toContain("雪场详情暂时无法加载");
  });
  it("contains malformed article categories in the detail error state", async () => {
    request.mockResolvedValue({ ...article, category: null });
    const html = renderToStaticMarkup(
      await ArticlePage({ params: Promise.resolve({ articleId: "7" }) }),
    );
    expect(html).toContain("文章暂时无法加载");
  });
  it("rejects malformed dynamic images before reading comments", async () => {
    request.mockResolvedValue({ ...dynamic, imageUrls: null });
    const html = renderToStaticMarkup(await detail());
    expect(html).toContain("动态详情暂时无法加载");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("keeps dynamic content when a comment author is malformed", async () => {
    request.mockResolvedValueOnce(dynamic).mockResolvedValueOnce({
      ...comments,
      items: [{ ...comment, author: null }],
    });
    const html = renderToStaticMarkup(await detail());
    expect(html).toContain("评论暂时无法加载");
    expect(html).toContain("&lt;雪道正文&gt;");
  });
  it("rejects hidden comments in public pages", async () => {
    request.mockResolvedValueOnce(dynamic).mockResolvedValueOnce({
      ...comments,
      items: [
        { ...comment, status: "hidden", content: "private-comment-body" },
      ],
    });
    const html = renderToStaticMarkup(await detail());
    expect(html).not.toContain("private-comment-body");
    expect(html).toContain("评论暂时无法加载");
  });
  it("projects full detail data without undeclared fields", async () => {
    request.mockResolvedValue({
      ...resort,
      contactPhone: "private",
      snowCondition: { ...resort.snowCondition, private: true },
    });
    expect(await readPublicDetail("resort", "7")).toEqual(resort);
  });
  it("reads public comments anonymously without authentication refresh", async () => {
    request.mockResolvedValueOnce(dynamic).mockResolvedValueOnce(comments);
    await detail();
    expect(request).toHaveBeenLastCalledWith(
      "/dynamics/7/comments?page=1&pageSize=20",
      expect.objectContaining({
        credentials: "omit",
        skipAuthRefresh: true,
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    );
  });
  it("renders public custom fields including zero and false", async () => {
    request.mockResolvedValue({
      ...resort,
      customFields: [
        { fieldKey: "n", label: "零值字段", value: 0 },
        { fieldKey: "b", label: "布尔字段", value: false },
        { fieldKey: "tags", label: "组合字段", value: ["入门", "亲子"] },
      ],
    });
    const html = renderToStaticMarkup(
      await ResortPage({ params: Promise.resolve({ resortId: "7" }) }),
    );
    expect(html).toContain("零值字段");
    expect(html).toContain(">0</dd>");
    expect(html).toContain("布尔字段");
    expect(html).toContain(">否</dd>");
    expect(html).toContain("入门、亲子");
  });
});

describe("complete public detail projections", () => {
  it.each([
    ["resort", { ...resort, snowCondition: null }],
    [
      "resort",
      {
        ...resort,
        snowCondition: { ...resort.snowCondition, verifiedAt: "bad-time" },
      },
    ],
    ["resort", { ...resort, latitude: 91 }],
    ["resort", { ...resort, longitude: 181 }],
    ["resort", { ...resort, officialUrl: "javascript:alert(1)" }],
    ["resort", { ...resort, address: {} }],
    [
      "resort",
      {
        ...resort,
        customFields: [
          { fieldKey: "same", label: "A", value: 0 },
          { fieldKey: "same", label: "B", value: 1 },
        ],
      },
    ],
    [
      "resort",
      {
        ...resort,
        fitTags: [
          { value: "same", label: "A" },
          { value: "same", label: "B" },
        ],
      },
    ],
    ["resort", { ...resort, updatedAt: "bad-time" }],
    ["article", { ...article, body: {} }],
    ["article", { ...article, body: undefined }],
    ["article", { ...article, category: { label: "missing value" } }],
    ["dynamic", { ...dynamic, imageCount: 1 }],
    ["dynamic", { ...dynamic, updatedAt: "bad-time" }],
    ["dynamic", { ...dynamic, content: {} }],
  ] as const)("rejects invalid full %s data %j", async (kind, value) => {
    request.mockResolvedValue(value);
    await expect(readPublicDetail(kind, "7")).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each(["resort", "article", "dynamic"] as const)(
    "rejects mismatched %s IDs",
    async (kind) => {
      request.mockResolvedValue({
        ...{ resort, article, dynamic }[kind],
        [`${kind === "article" ? "article" : kind}Id`]: 8,
      });
      await expect(readPublicDetail(kind, "7")).rejects.toThrow("Mismatched");
    },
  );
  it("prevents indexing when a full detail cannot render", async () => {
    request.mockImplementation(
      async (path) =>
        (path === "/public/config"
          ? { siteName: "凛迹雪客" }
          : { ...resort, galleryUrls: null }) as never,
    );
    expect((await publicDetailMetadata("resort", "7")).robots).toEqual({
      index: false,
      follow: true,
    });
  });
  it.each([
    null,
    { ...comments, total: "1" },
    { ...comments, page: 2 },
    { ...comments, hasNext: true },
    { ...comments, total: -1 },
    {
      ...comments,
      items: Array.from({ length: 21 }, (_, index) => ({
        ...comment,
        commentId: index + 1,
      })),
      total: 21,
      hasNext: true,
    },
    { ...comments, items: [{ ...comment, commentId: -1 }] },
    { ...comments, items: [comment, comment], total: 2 },
    { ...comments, items: [{ ...comment, createdAt: "bad-time" }] },
    {
      ...comments,
      items: [{ ...comment, author: { ...comment.author, nickname: {} } }],
    },
    { ...comments, items: [{ ...comment, content: {} }] },
  ])("rejects malformed comment pages %j", async (value) => {
    request.mockResolvedValue(value);
    await expect(readPublicComments("7", 1)).rejects.toThrow();
  });
  it.each([
    ["0", 1],
    ["2147483648", 1],
    ["7", 0],
    ["7", -1],
    ["7", 1.5],
    ["7", Number.NaN],
    ["7", 107374184],
  ] as const)(
    "rejects invalid comment query %s/%s before requesting",
    async (id, page) => {
      await expect(readPublicComments(id, page)).rejects.toThrow(
        "Invalid public comments query",
      );
      expect(request).not.toHaveBeenCalled();
    },
  );
  it("preserves signed images and precise prices while dropping extra nested and body fields", async () => {
    const url = "https://storage.invalid/image?sig=a%2Fb&expires=900";
    request.mockResolvedValue({
      ...resort,
      startingPrice: "9999999999999999.99",
      galleryUrls: [url],
      officialUrl: "https://snow.example/path?x=1",
      snowCondition: { ...resort.snowCondition, private: "secret" },
    });
    expect(await readPublicDetail("resort", "7")).toEqual({
      ...resort,
      startingPrice: "9999999999999999.99",
      galleryUrls: [url],
      officialUrl: "https://snow.example/path?x=1",
    });
    request.mockResolvedValue({
      ...dynamic,
      imageCount: 1,
      imageUrls: [url],
      private: "secret",
      author: { ...dynamic.author, account: "secret" },
    });
    expect(await readPublicDetail("dynamic", "7")).toEqual({
      ...dynamic,
      imageCount: 1,
      imageUrls: [url],
    });
    request.mockResolvedValue({
      ...article,
      private: "secret",
      category: { ...article.category, internal: "secret" },
    });
    expect(await readPublicDetail("article", "7")).toEqual(article);
  });
  it("projects visible comments and preserves valid empty later pages", async () => {
    request.mockResolvedValue({
      ...comments,
      private: "secret",
      items: [
        {
          ...comment,
          author: { ...comment.author, account: "secret" },
          moderationReason: "secret",
        },
      ],
    });
    expect(await readPublicComments("7", 1)).toEqual(comments);
    const empty = {
      items: [],
      total: 1,
      page: 3,
      pageSize: 20,
      hasNext: false,
    };
    request.mockResolvedValue(empty);
    expect(await readPublicComments("7", 3)).toEqual(empty);
  });
});
