import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { KnowledgeDirectory } from "@/features/knowledge/knowledge-directory";
import { readKnowledgeFilters } from "@/features/knowledge/knowledge-query";
import { ResortDirectory } from "@/features/resorts/resort-directory";
import { readResortFilters } from "@/features/resorts/resort-query";
import { FeedDirectory } from "@/features/community/feed-directory";
import { readFeedFilters } from "@/features/community/feed-query";
import { RouteError, RouteNotFound } from "@/features/route-state/route-state";
import { getPageHref } from "@/platform/config";

afterEach(() => vi.unstubAllEnvs());

describe("native document navigation under deployment prefixes", () => {
  it.each(["", "/snow", "/club/snow"])(
    "keeps all three GET filter forms inside %s with their native controls",
    (base) => {
      vi.stubEnv("NEXT_PUBLIC_WEB_BASE_PATH", base);
      const cases = [
        [
          "/knowledge",
          <KnowledgeDirectory
            filters={readKnowledgeFilters({ keyword: "测试 & 雪" })}
            state={{ status: "invalid", message: "筛选条件" }}
          />,
        ],
        [
          "/resorts",
          <ResortDirectory
            filters={readResortFilters({ keyword: "测试 & 雪" })}
            state={{ status: "invalid", message: "筛选条件" }}
          />,
        ],
        [
          "/dynamics",
          <FeedDirectory
            filters={readFeedFilters({ keyword: "测试 & 雪" })}
            state={{ status: "invalid", message: "筛选条件" }}
          />,
        ],
      ] as const;
      for (const [route, element] of cases) {
        const html = renderToStaticMarkup(element);
        expect(html).toContain(`action="${base}${route}"`);
        expect(html).toContain('method="get"');
        expect(html).toContain('name="keyword"');
        expect(html).toContain('value="测试 &amp; 雪"');
        expect(html).not.toContain('name="page"');
        expect(html).not.toContain('name="cursor"');
      }
    },
  );
  it.each(["", "/snow", "/club/snow"])(
    "keeps missing-page and failed-router document recovery inside %s",
    (base) => {
      vi.stubEnv("NEXT_PUBLIC_WEB_BASE_PATH", base);
      for (const element of [
        <RouteNotFound />,
        <RouteError error={null} retry={vi.fn()} />,
      ]) {
        expect(renderToStaticMarkup(element)).toContain(
          `href="${base || "/"}"`,
        );
      }
      expect(
        getPageHref("/knowledge?keyword=%E6%B5%8B%E8%AF%95&categoryValue="),
      ).toBe(`${base}/knowledge?keyword=%E6%B5%8B%E8%AF%95&categoryValue=`);
      expect(() => getPageHref("//external.example")).toThrow();
    },
  );
});
