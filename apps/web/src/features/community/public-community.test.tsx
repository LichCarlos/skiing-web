import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { components } from "@common/api-contracts/openapi";
import { ApiError } from "@common/api-contracts/client";
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dynamics",
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
import { apiRequest } from "@/platform/api";
import { FeedDirectory } from "@/features/community/feed-directory";
import {
  buildFeedQuery,
  feedHref,
  loadFeed,
  readFeedFilters,
} from "@/features/community/feed-query";
import DynamicPage from "@/app/dynamics/[dynamicId]/page";
import ResortPage from "@/app/resorts/[resortId]/page";

const request = vi.mocked(apiRequest);
const dynamic: components["schemas"]["DynamicDetailVO"] = {
  dynamicId: 11,
  author: { userId: 7, nickname: "<雪友>", avatarUrl: null },
  content: "<script>雪道记录</script>",
  summary: "雪道记录",
  coverUrl: null,
  imageCount: 0,
  imageUrls: [],
  resort: null,
  likeCount: 2,
  commentCount: 23,
  likedByMe: false,
  status: "published",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};
const emptyComments = {
  items: [],
  total: 23,
  page: 2,
  pageSize: 20,
  hasNext: false,
};
const filters = readFeedFilters({ keyword: " 雪 & %_ ", cursor: "opaque_A-9" });
const query = buildFeedQuery(filters).toString();
beforeEach(() => {
  request.mockReset();
});
function detail(page?: string, id = "11") {
  return DynamicPage({
    params: Promise.resolve({ dynamicId: id }),
    searchParams: Promise.resolve(page === undefined ? {} : { page }),
  });
}
describe("Public community browsing and recovery", () => {
  it("encodes keyword and opaque cursor without leaking unknown parameters", () => {
    const params = buildFeedQuery(
      readFeedFilters({
        ...filters,
        userId: "9",
        status: "hidden",
        limit: "999",
      }),
    );
    expect(Object.fromEntries(params)).toEqual({
      keyword: "雪 & %_",
      cursor: "opaque_A-9",
      limit: "12",
    });
    expect(new URLSearchParams(params.toString()).get("keyword")).toBe(
      "雪 & %_",
    );
  });
  it.each([
    { keyword: "雪".repeat(201) },
    { cursor: "?bad" },
    { cursor: "x".repeat(513) },
  ])("rejects invalid feed input %j before requests", async (search) => {
    expect(await loadFeed(readFeedFilters(search), apiRequest)).toMatchObject({
      status: "invalid",
    });
    expect(request).not.toHaveBeenCalled();
  });
  it("preserves search and cursor in retries and search alone in the return-to-latest link", async () => {
    request.mockRejectedValue(new Error("offline"));
    const state = await loadFeed(filters, apiRequest);
    const html = renderToStaticMarkup(
      <FeedDirectory filters={filters} state={state} />,
    ).replaceAll("&amp;", "&");
    expect(html).toContain(`/dynamics?${query}`);
    expect(html).toContain(feedHref(query));
    expect(html).toContain("返回最新动态");
    expect(request).toHaveBeenCalledExactlyOnceWith(`/dynamics?${query}`, {
      cache: "no-store",
      credentials: "omit",
      skipAuthRefresh: true,
      signal: expect.any(AbortSignal),
    });
  });
  it("paginates with only the server nextCursor and preserves search, without reusing the old cursor", () => {
    const html = renderToStaticMarkup(
      <FeedDirectory
        filters={filters}
        state={{
          status: "ready",
          query,
          data: { items: [dynamic], hasNext: true, nextCursor: "next_2-B" },
        }}
      />,
    ).replaceAll("&amp;", "&");
    expect(html).toContain(feedHref(query, "next_2-B"));
    expect(html).toContain("&lt;雪友&gt;");
    expect(html).not.toContain('name="cursor"');
  });
  it("returns from an empty later slice without losing the keyword", () => {
    const html = renderToStaticMarkup(
      <FeedDirectory
        filters={filters}
        state={{
          status: "ready",
          query,
          data: { items: [], hasNext: false, nextCursor: null },
        }}
      />,
    ).replaceAll("&amp;", "&");
    expect(html).toContain("返回最新动态");
    expect(html).toContain(feedHref(query));
  });
  it("does not create a repeated next link when no server cursor exists", () => {
    const html = renderToStaticMarkup(
      <FeedDirectory
        filters={filters}
        state={{
          status: "ready",
          query,
          data: { items: [dynamic], hasNext: true, nextCursor: null },
        }}
      />,
    );
    expect(html).not.toContain("更多动态");
    expect(html).toContain("已到末尾");
  });
  it.each(["0", "-1", "1.5", "2147483648", "9007199254740992", "11?x=7"])(
    "rejects invalid dynamic/resort ID %s before API calls",
    async (id) => {
      await expect(detail(undefined, id)).rejects.toThrow("NOT_FOUND");
      await expect(
        ResortPage({ params: Promise.resolve({ resortId: id }) }),
      ).rejects.toThrow("NOT_FOUND");
      expect(request).not.toHaveBeenCalled();
    },
  );
  it("maps unpublished/missing dynamic 404 to the route 404 and does not request comments", async () => {
    request.mockRejectedValue(
      new ApiError("missing", { status: 404, code: 404, traceId: "t" }),
    );
    await expect(detail()).rejects.toThrow("NOT_FOUND");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each(["0", "1.5", "107374184", "Infinity"])(
    "preserves the dynamic but blocks invalid comment page %s",
    async (page) => {
      request.mockResolvedValue(dynamic);
      const html = renderToStaticMarkup(await detail(page));
      expect(html).toContain("评论页码无效");
      expect(html).toContain("返回评论第一页");
      expect(html).toContain("&lt;script&gt;雪道记录&lt;/script&gt;");
      expect(request).toHaveBeenCalledTimes(1);
    },
  );
  it("keeps dynamic content and the exact comment page retry after a comment service failure", async () => {
    request
      .mockResolvedValueOnce(dynamic)
      .mockRejectedValueOnce(new Error("offline"));
    const html = renderToStaticMarkup(await detail("2"));
    expect(html).toContain("评论暂时无法加载");
    expect(html).toContain("雪道记录");
    expect(html).toContain("/dynamics/11?page=2");
  });
  it("returns to a previous comment page when a later page becomes empty", async () => {
    request.mockResolvedValueOnce(dynamic).mockResolvedValueOnce(emptyComments);
    const html = renderToStaticMarkup(await detail("2"));
    expect(html).toContain("本页暂无评论");
    expect(html).toContain("/dynamics/11?page=1");
    expect(request).toHaveBeenLastCalledWith(
      "/dynamics/11/comments?page=2&pageSize=20",
      {
        cache: "no-store",
        credentials: "omit",
        skipAuthRefresh: true,
        signal: expect.any(AbortSignal),
      },
    );
  });
  it("renders actual visible comments with stable links in both directions", async () => {
    request.mockResolvedValueOnce(dynamic).mockResolvedValueOnce({
      ...emptyComments,
      total: 43,
      hasNext: true,
      items: [
        {
          commentId: 19,
          content: "<评论>",
          author: dynamic.author,
          status: "visible",
          createdAt: dynamic.createdAt,
        },
      ],
    });
    const html = renderToStaticMarkup(await detail("2"));
    expect(html).toContain("&lt;评论&gt;");
    expect(html).toContain("/dynamics/11?page=1");
    expect(html).toContain("/dynamics/11?page=3");
  });
});
