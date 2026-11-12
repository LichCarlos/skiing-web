import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { apiRequest } from "@/platform/api";
import { ResortDirectory } from "@/features/resorts/resort-directory";
import {
  buildResortQuery,
  formatResortDistance,
  loadResortDirectory,
  loadResortFitTags,
  readResortFilters,
  resortPageHref,
  type ResortPage,
  type ResortFitTag,
  type Search,
} from "@/features/resorts/resort-query";

const selected: Search = {
  keyword: " 林海 & 雪 ",
  province: "吉林",
  city: "吉林市",
  district: "丰满区",
  minPrice: "0",
  maxPrice: "300",
  minRating: "4.2",
  openStatus: "open",
  latitude: "0",
  longitude: "0",
  sortBy: "distance",
  sortOrder: "asc",
  fitTags: ["family", "a&b", "family"],
  page: "2",
};
const page: ResortPage = {
  page: 2,
  pageSize: 12,
  total: 27,
  hasNext: true,
  items: [
    {
      resortId: 7,
      name: "<雪场>",
      region: { province: "吉林", city: "吉林市", district: "丰满区" },
      coverUrl: null,
      rating: 4.2,
      ratingCount: 3,
      distanceMeters: 0,
      startingPrice: "0.00",
      fitTags: [{ value: "family", label: "亲子" }],
      openStatus: "open",
      favoriteByMe: false,
      customFields: [],
    },
  ],
};
describe("public resort directory filters", () => {
  it("loads public fit tags independently and degrades without affecting resort filters", async () => {
    const tags: ResortFitTag[] = [{ value: "family", label: "亲子" }];
    const request = vi.fn().mockResolvedValue(tags);
    await expect(
      loadResortFitTags(request as typeof apiRequest),
    ).resolves.toEqual(tags);
    expect(request).toHaveBeenCalledWith("/resorts/fit-tags", {
      cache: "no-store",
      credentials: "omit",
      skipAuthRefresh: true,
      signal: expect.any(AbortSignal),
    });
    await expect(
      loadResortFitTags(
        vi.fn().mockRejectedValue(new Error("offline")) as typeof apiRequest,
      ),
    ).resolves.toBeNull();
  });
  it("combines all contract filters, keeps zero coordinates/prices, and encodes repeated tags separately", () => {
    const query = buildResortQuery(readResortFilters(selected));
    expect(Object.fromEntries(query)).toMatchObject({
      keyword: "林海 & 雪",
      province: "吉林",
      city: "吉林市",
      district: "丰满区",
      minPrice: "0",
      maxPrice: "300",
      minRating: "4.2",
      latitude: "0",
      longitude: "0",
      sortBy: "distance",
      sortOrder: "asc",
      page: "2",
      pageSize: "12",
      openStatus: "open",
    });
    expect(query.getAll("fitTags")).toEqual(["family", "a&b"]);
    expect(query.has("merchantId")).toBe(false);
    expect(new URLSearchParams(query.toString()).getAll("fitTags")).toEqual([
      "family",
      "a&b",
    ]);
  });
  it("uses deliberate defaults and never passes unrecognized input to the API", () => {
    const query = buildResortQuery(
      readResortFilters({ merchantId: "9", status: "draft", pageSize: "999" }),
    );
    expect(Object.fromEntries(query)).toEqual({
      sortBy: "rating",
      sortOrder: "desc",
      page: "1",
      pageSize: "12",
    });
    expect(
      buildResortQuery(readResortFilters({ sortBy: "price" })).get("sortOrder"),
    ).toBe("asc");
  });
  it.each([
    { minPrice: "-1" },
    { minPrice: "0.1" },
    { minPrice: "9007199254740992" },
    { minPrice: "20", maxPrice: "10" },
    { minRating: "NaN" },
    { minRating: "5.1" },
    { latitude: "0" },
    { longitude: "0" },
    { latitude: "91", longitude: "0" },
    { latitude: "0", longitude: "181" },
    { sortBy: "distance" },
    { sortBy: "private" },
    { sortOrder: "sql" },
    { openStatus: "pending" },
    { keyword: "x".repeat(101) },
    { page: "2147483648" },
    { page: "0" },
    { page: "1.5" },
    { fitTags: Array.from({ length: 21 }, (_, i) => String(i)) },
  ])("reports malformed filters without calling backend: %j", async (patch) => {
    const request = vi.fn();
    const state = await loadResortDirectory(
      readResortFilters(patch),
      request as typeof apiRequest,
    );
    expect(state.status).toBe("invalid");
    expect(request).not.toHaveBeenCalled();
  });
  it("retains every selected filter and tag across pagination and retry links", async () => {
    const filters = readResortFilters(selected),
      request = vi.fn().mockResolvedValue(page);
    const state = await loadResortDirectory(
      filters,
      request as typeof apiRequest,
    );
    expect(state.status).toBe("ready");
    expect(request).toHaveBeenCalledWith(expect.stringContaining("/resorts?"), {
      cache: "no-store",
      credentials: "omit",
      skipAuthRefresh: true,
      signal: expect.any(AbortSignal),
    });
    if (state.status !== "ready") throw new Error("Expected ready");
    const next = new URL(
      resortPageHref(state.query, 3),
      "https://local.invalid",
    );
    expect(next.searchParams.get("district")).toBe("丰满区");
    expect(next.searchParams.get("minPrice")).toBe("0");
    expect(next.searchParams.getAll("fitTags")).toEqual(["family", "a&b"]);
    expect(next.searchParams.get("page")).toBe("3");
    const html = renderToStaticMarkup(
      <ResortDirectory filters={filters} state={state} />,
    );
    for (const text of [
      "<strong>27</strong>",
      "&lt;雪场&gt;",
      "丰满区",
      "¥0.00 起",
      "距参考点 0 米",
      'name="minRating"',
      'name="latitude"',
      'name="sortOrder"',
    ])
      expect(html).toContain(text);
    expect(html).not.toContain("unsplash.com");
    expect(html).toContain('type="checkbox" name="fitTags"');
    expect(html).toContain('value="family"');
    expect(html).toContain('type="checkbox" name="fitTags" checked');
    const failed = await loadResortDirectory(
      filters,
      vi
        .fn()
        .mockRejectedValue(new Error("secret diagnostic")) as typeof apiRequest,
    );
    const errorHtml = renderToStaticMarkup(
      <ResortDirectory filters={filters} state={failed} />,
    );
    expect(errorHtml).toContain("重新加载");
    expect(errorHtml).toContain('value="family"');
    expect(errorHtml).not.toContain("secret diagnostic");
    expect(errorHtml).not.toContain("&lt;雪场&gt;");
  });
  it("provides recovery from an empty later page and shows field errors instead of connection failure", () => {
    const filters = readResortFilters(selected),
      query = buildResortQuery(filters).toString();
    const html = renderToStaticMarkup(
      <ResortDirectory
        filters={filters}
        state={{
          status: "ready",
          query,
          data: { ...page, items: [], hasNext: false },
        }}
      />,
    );
    expect(html).toContain("没有找到符合条件的雪场");
    expect(html).toContain("上一页");
    expect(html).toContain("page=1");
    const invalid = renderToStaticMarkup(
      <ResortDirectory
        filters={filters}
        state={{ status: "invalid", message: "请同时填写参考纬度和经度" }}
      />,
    );
    expect(invalid).toContain('role="alert"');
    expect(invalid).toContain("请同时填写参考纬度和经度");
    expect(invalid).not.toContain("连接服务失败");
  });
  it("distinguishes absent distance from a valid zero distance", () => {
    expect(formatResortDistance(null)).toBeNull();
    expect(formatResortDistance(-1)).toBeNull();
    expect(formatResortDistance(Number.NaN)).toBeNull();
    expect(formatResortDistance(0)).toBe("0 米");
    expect(formatResortDistance(12345)).toBe("12.3 公里");
  });
});
