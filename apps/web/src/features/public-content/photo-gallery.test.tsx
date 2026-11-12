import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  galleryPosition,
  PhotoGallery,
} from "@/features/public-content/photo-gallery";

describe("public photo gallery", () => {
  it.each([
    [-1, 3, 0],
    [4, 3, 2],
    [1, 3, 1],
    [8, 0, 0],
  ])("clamps %s within %s photos", (index, count, expected) => {
    expect(galleryPosition(index, count)).toBe(expected);
  });
  it("keeps all already-authorized photos accessible in SSR without animation or duplicate hidden images", () => {
    const html = renderToStaticMarkup(
      <PhotoGallery
        label="雪场相册"
        urls={[
          "https://example.com/1.jpg?signature=abc",
          "https://example.com/2.jpg",
        ]}
      />,
    );
    expect(html.match(/<img /g)).toHaveLength(2);
    expect(html).toContain('href="https://example.com/1.jpg?signature=abc"');
    expect(html).toContain("雪场相册 2");
    expect(html).toContain('aria-label="下一张照片"');
    expect(html).toContain('aria-label="关闭大图"');
    expect(html).not.toContain("autoplay");
  });
  it("has no empty gallery and no pointless single-image navigation", () => {
    expect(renderToStaticMarkup(<PhotoGallery label="相册" urls={[]} />)).toBe(
      "",
    );
    const html = renderToStaticMarkup(
      <PhotoGallery label="相册" urls={["", "https://example.com/1.jpg"]} />,
    );
    expect(html).not.toContain('aria-label="下一张照片"');
    expect(html).toContain('aria-label="放大相册第 1 张"');
  });
});
