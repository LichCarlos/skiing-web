import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownManager } from "@tiptap/markdown";
import { inspectMarkdown, MarkdownContent } from "@common/ui";
import { articleEditorExtensions } from "@/features/articles/article-editor-schema";
import {
  allowedArticleLink,
  articleAssetReference,
  plainTextDocument,
} from "@/features/articles/article-content-links";

const manager = new MarkdownManager({ extensions: articleEditorExtensions() });
const policy = { image: articleAssetReference, link: allowedArticleLink };
const fixture =
  "# 雪地笔记\n\n**安全第一**，*循序渐进*。\n\n- 头盔\n- 雪镜\n\n> 先热身\n\n[万龙](resort:7) [知识](article:9)\n\n![雪道](asset:12)\n\n| 装备 | 用途 |\n| --- | --- |\n| 头盔 | 保护 |\n\n###### 小字标题";
describe("Tiptap Markdown persistence and shared safe reader", () => {
  it("round-trips and renders 150 distinct images without count truncation", () => {
    const ids = Array.from({ length: 150 }, (_, i) => String(i + 1));
    const source = ids.map((id) => `![雪](asset:${id})`).join("\n\n");
    expect(inspectMarkdown(source, policy)).toBeNull();
    expect(
      inspectMarkdown("[来源](https://example.com) ".repeat(101), policy),
    ).not.toBeNull();
    expect(
      inspectMarkdown(manager.serialize(manager.parse(source)), policy),
    ).toBeNull();
    const html = renderToStaticMarkup(
      createElement(MarkdownContent, {
        source,
        format: "markdown_v1",
        images: Object.fromEntries(
          ids.map((id) => [`asset:${id}`, `https://assets.test/${id}.jpg`]),
        ),
      }),
    );
    expect((html.match(/<img /g) ?? []).length).toBe(150);
  });
  it("preserves literal pipes inside table cells", () => {
    const doc = manager.parse("|a|b|\n|---|---|\n|1|2|");
    doc.content![0]!.content![1]!.content![0]!.content![0]!.content = [
      { type: "text", text: "left | right" },
    ];
    expect(manager.parse(manager.serialize(doc))).toEqual(doc);
  });
  it("keeps unresolved logical links readable without disabling all Markdown", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownContent, {
        source: "## 安全\n\n[雪场](resort:7)",
        format: "markdown_v1",
      }),
    );
    expect(html).toContain("<h2>");
    expect(html).toContain("雪场");
    expect(html).not.toContain("href=");
  });
  it("round trips supported semantic JSON without requiring a DOM or server HTML", () => {
    const document = manager.parse(fixture);
    const source = manager.serialize(document);
    expect(inspectMarkdown(source, policy)).toBeNull();
    expect(manager.parse(source)).toEqual(document);
    expect(source).toContain("asset:12");
    expect(source).toContain("resort:7");
    expect(source).toContain("######");
  });
  it("converts literal legacy text without interpreting its syntax", () => {
    const source = manager.serialize(
      plainTextDocument("# old **literal** <tag>"),
    );
    const doc = manager.parse(source);
    expect(doc.content?.[0]?.type).toBe("paragraph");
    expect(doc.content?.[0]?.content?.map((node) => node.text).join("")).toBe(
      "# old **literal** <tag>",
    );
    expect(inspectMarkdown(source, policy)).toBeNull();
  });
  it.each([
    "# literal",
    "> quote",
    "- item",
    "+ item",
    "1. item",
    "1) item",
    "---",
    "====",
    "    indented",
  ])("preserves paragraph text %s after editor serialization", (text) => {
    const source = manager.serialize(plainTextDocument(text));
    const doc = manager.parse(source);
    expect(doc.content?.[0]?.type).toBe("paragraph");
    expect(doc.content?.[0]?.content?.map((node) => node.text).join("")).toBe(
      text,
    );
  });
  it.each([
    "- [x] task",
    "<script>alert(1)</script>",
    "![x](https://remote.test/a.png)",
    "[x](javascript:alert)",
    "[x](#missing)",
  ])("rejects lossy or unsafe import %s", (source) =>
    expect(inspectMarkdown(source, policy)).not.toBeNull(),
  );
  it("renders heading, GFM table and controlled image/links without persisting signed URLs", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownContent, {
        source: fixture,
        format: "markdown_v1",
        images: { "asset:12": "https://assets.test/signed" },
        resolveLink: (url) =>
          url === "resort:7"
            ? "/resorts/7"
            : url === "article:9"
              ? "/knowledge/9"
              : undefined,
      }),
    );
    expect(html).toContain("<h1>");
    expect(html).toContain("<table>");
    expect(html).toContain('href="/resorts/7"');
    expect(html).toContain('src="https://assets.test/signed"');
    expect(html).not.toContain('src="asset:');
    expect(fixture).not.toContain("signed");
  });
  it("does not fetch arbitrary image sources even if the caller mistakenly supplies a map entry", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownContent, {
        source: "![x](https://remote.test/x.png)",
        format: "markdown_v1",
        images: { "https://remote.test/x.png": "https://remote.test/x.png" },
      }),
    );
    expect(html).not.toContain("<img");
  });
  it("keeps legacy symbols literal and escapes HTML", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownContent, {
        source: "# old <script>alert(1)</script>",
        format: "plain_text",
      }),
    );
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("<script>");
    expect(html).toContain("# old");
  });
});
