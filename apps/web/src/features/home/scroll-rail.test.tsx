import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  railOffset,
  railScrollTop,
  ScrollRail,
} from "@/features/home/scroll-rail";
import { SectionHold } from "@/features/home/section-hold";

describe("progressive resort rail", () => {
  it.each([
    [200, 800, 0],
    [24, 800, 0],
    [0, 800, 0],
    [-75, 800, 0],
    [-76, 800, 0],
    [-77, 800, 1],
    [-176, 800, 100],
    [-276, 800, 200],
    [-875, 800, 799],
    [-876, 800, 800],
    [-926, 800, 800],
    [-976, 800, 800],
    [-2000, 800, 800],
    [-100, 0, 0],
  ])("clamps scroll position %s and travel %s to %s", (top, travel, offset) => {
    expect(railOffset(top, travel)).toBe(offset);
  });
  it.each([0, 1, 200, 799, 800])(
    "maps focus/step target %s back to the same horizontal offset",
    (offset) => {
      const stageTop = 1500;
      const scrollTop = railScrollTop(stageTop, offset, 800);
      expect(railOffset(stageTop - scrollTop, 800)).toBe(offset);
      expect(scrollTop).toBe(stageTop - 24 + 100 + offset);
    },
  );
  it("clamps control targets to the moving interval without consuming exit hold", () => {
    expect(railScrollTop(1500, -20, 800)).toBe(1576);
    expect(railScrollTop(1500, 900, 800)).toBe(2376);
    expect(railScrollTop(1500, 20, 0)).toBe(1576);
  });
  it("renders children and controls without requiring JavaScript or browser APIs", () => {
    const html = renderToStaticMarkup(
      createElement(ScrollRail, {
        children: createElement("a", { href: "/resorts/3" }, "测试雪场"),
      }),
    );
    expect(html).toContain('href="/resorts/3"');
    expect(html).toContain('aria-label="向后浏览雪场"');
    expect(html).not.toContain("data-enhanced");
    expect(html).not.toContain("translate3d");
  });
  it("renders held sections in readable normal flow before enhancement", () => {
    const html = renderToStaticMarkup(
      createElement(SectionHold, {
        children: createElement("section", null, "完整的知识与社区内容"),
      }),
    );
    expect(html).toContain("<section>完整的知识与社区内容</section>");
    expect(html).toContain("data-section-hold");
    expect(html).not.toContain("data-enhanced");
    expect(html).not.toContain("style=");
  });
});
