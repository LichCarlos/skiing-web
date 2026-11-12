import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { apiRequest } from "@/platform/api";
import { KnowledgeDirectory } from "@/features/knowledge/knowledge-directory";
import {
  buildKnowledgeQuery,
  knowledgePageHref,
  loadKnowledgeDirectory,
  readKnowledgeFilters,
  type ArticlePage,
} from "@/features/knowledge/knowledge-query";

const data: ArticlePage = {
  items: [
    {
      articleId: 11,
      title: "<安全入门>",
      summary: "雪道 & 装备",
      coverUrl: null,
      category: { value: "safety", label: "安全" },
      authorName: null,
      publishTime: "2026-10-01T00:00:00.000Z",
      favoriteByMe: false,
    },
  ],
  total: 25,
  page: 2,
  pageSize: 12,
  hasNext: true,
};
const filters = readKnowledgeFilters({
  keyword: " 雪 & %_ ",
  categoryValue: "safety",
  page: "2",
});
const query = buildKnowledgeQuery(filters).toString();

describe("Knowledge directory queries and independent recovery", () => {
  it("encodes literal keywords and category values and only sends public filters", () => {
    const value = buildKnowledgeQuery(
      readKnowledgeFilters({
        keyword: [" 雪 & %_ ", "ignored"],
        categoryValue: "a&b",
        userId: "9",
        status: "draft",
        pageSize: "999",
      }),
    );
    expect(Object.fromEntries(value)).toEqual({
      keyword: "雪 & %_",
      categoryValue: "a&b",
      page: "1",
      pageSize: "12",
    });
    expect(new URLSearchParams(value.toString()).get("categoryValue")).toBe(
      "a&b",
    );
  });
  it.each(["0", "-1", "1.5", "Infinity", "9007199254740992", "178956972"])(
    "blocks invalid page %s before either request",
    async (page) => {
      const request = vi.fn<typeof apiRequest>();
      const result = await loadKnowledgeDirectory(
        readKnowledgeFilters({ page }),
        request as typeof apiRequest,
      );
      expect(result).toMatchObject({
        status: "invalid",
        message: expect.stringContaining("页码"),
      });
      expect(request).not.toHaveBeenCalled();
    },
  );
  it.each(["keyword", "categoryValue"])(
    "rejects overlong %s rather than turning it into a generic service error",
    async (key) => {
      const request = vi.fn<typeof apiRequest>();
      expect(
        await loadKnowledgeDirectory(
          readKnowledgeFilters({ [key]: "雪".repeat(101) }),
          request as typeof apiRequest,
        ),
      ).toMatchObject({ status: "invalid" });
      expect(request).not.toHaveBeenCalled();
    },
  );
  it("retains articles when the category service fails and renders a separate retry", async () => {
    const request = vi
      .fn<typeof apiRequest>()
      .mockImplementation(async (path) => {
        if (path === "/knowledge/categories") throw new Error("offline");
        return data as never;
      });
    const state = await loadKnowledgeDirectory(
      filters,
      request as typeof apiRequest,
    );
    expect(state).toEqual({
      status: "loaded",
      query,
      articles: data,
      categories: null,
    });
    expect(
      request.mock.calls.every(([, options]) => options?.cache === "no-store"),
    ).toBe(true);
    const html = renderToStaticMarkup(
      <KnowledgeDirectory filters={filters} state={state} />,
    );
    expect(html).toContain("文章分类暂时无法加载");
    expect(html).toContain("25 篇公开文章");
    expect(html).toContain("&lt;安全入门&gt;");
    expect(html).toContain('value="safety" selected=""');
    expect(html).not.toContain("知识文章暂时无法加载");
  });
  it("retains categories and filter values when the article request fails", async () => {
    const request = vi
      .fn<typeof apiRequest>()
      .mockImplementation(async (path) => {
        if (path.startsWith("/articles?")) throw new Error("offline");
        return [{ value: "safety", label: "安全" }] as never;
      });
    const state = await loadKnowledgeDirectory(
      filters,
      request as typeof apiRequest,
    );
    const html = renderToStaticMarkup(
      <KnowledgeDirectory filters={filters} state={state} />,
    );
    expect(html).toContain("知识文章暂时无法加载");
    expect(html).toContain(">安全</option>");
    expect(html).not.toContain("文章分类暂时无法加载");
    const links = [...html.matchAll(/href="([^"]+)"/g)].map((match) =>
      match[1]!.replaceAll("&amp;", "&"),
    );
    expect(links).toContain(`/knowledge?${query}`);
  });
  it("shows independent failures without replacing the usable filter form", async () => {
    const request = vi
      .fn<typeof apiRequest>()
      .mockRejectedValue(new Error("offline"));
    const state = await loadKnowledgeDirectory(
      filters,
      request as typeof apiRequest,
    );
    const html = renderToStaticMarkup(
      <KnowledgeDirectory filters={filters} state={state} />,
    );
    expect(html).toContain("文章分类暂时无法加载");
    expect(html).toContain("知识文章暂时无法加载");
    expect(html).toContain('method="get"');
    expect(html).toContain('action="/knowledge"');
    expect(html).not.toContain('name="page"');
  });
  it("keeps keyword and category in both pagination directions", () => {
    const html = renderToStaticMarkup(
      <KnowledgeDirectory
        filters={filters}
        state={{ status: "loaded", query, articles: data, categories: [] }}
      />,
    );
    const links = [...html.matchAll(/href="([^"]+)"/g)].map((match) =>
      match[1]!.replaceAll("&amp;", "&"),
    );
    expect(links).toContain(knowledgePageHref(query, 1));
    expect(links).toContain(knowledgePageHref(query, 3));
    for (const page of [1, 3]) {
      const params = new URL(
        knowledgePageHref(query, page),
        "https://example.test",
      ).searchParams;
      expect(params.get("keyword")).toBe("雪 & %_");
      expect(params.get("categoryValue")).toBe("safety");
    }
  });
  it("lets an empty later page return to the previous page with all filters", () => {
    const html = renderToStaticMarkup(
      <KnowledgeDirectory
        filters={filters}
        state={{
          status: "loaded",
          query,
          articles: { ...data, items: [], hasNext: false },
          categories: [],
        }}
      />,
    );
    expect(html).toContain("没有找到相关文章");
    expect(html).toContain("← 上一页");
    expect(html.replaceAll("&amp;", "&")).toContain(
      knowledgePageHref(query, 1),
    );
  });
  it("renders validation as an input repair path without pretending a network request failed", () => {
    const html = renderToStaticMarkup(
      <KnowledgeDirectory
        filters={filters}
        state={{ status: "invalid", message: "页码无效，请返回第一页" }}
      />,
    );
    expect(html).toContain("请检查筛选条件");
    expect(html).toContain("返回第一页");
    expect(html).not.toContain("暂时无法加载");
  });
});
