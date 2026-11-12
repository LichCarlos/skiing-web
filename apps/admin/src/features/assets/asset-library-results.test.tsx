import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AssetLibraryResults } from "@/features/assets/asset-library-results";
import type { AdminAsset } from "@/features/assets/asset-library-model";

function render(
  overrides: Partial<Parameters<typeof AssetLibraryResults>[0]> = {},
) {
  return renderToStaticMarkup(
    createElement(AssetLibraryResults, {
      items: [],
      selectedIds: [],
      loading: false,
      onRetry: vi.fn(),
      onSelect: vi.fn(),
      ...overrides,
    }),
  );
}

describe("asset selection result presentation", () => {
  it("distinguishes loading, failure with retry and empty states", () => {
    expect(render({ loading: true })).toContain("正在加载图片");
    const error = render({ error: "没有媒体权限" });
    expect(error).toContain('role="alert"');
    expect(error).toContain("重试加载");
    expect(error).not.toContain("没有符合条件");
    expect(render()).toContain("没有符合条件的图片");
  });
  it("previews ready images, escapes filenames and disables duplicate or unavailable selections", () => {
    const asset: AdminAsset = {
      assetId: "42",
      originalName: "<script>snow</script>",
      ownerAccount: "owner",
      ownerUserId: 8,
      mimeType: "image/png",
      sizeBytes: "1024",
      status: "ready",
      url: "https://assets.example/signed",
      createdAt: "2026-10-29T00:00:00Z",
      references: {
        coverResorts: 0,
        resortImages: 0,
        articleCovers: 0,
        dynamicImages: 0,
        userAvatars: 0,
      },
    };
    const html = render({
      items: [asset, { ...asset, assetId: "43", status: "deleted", url: null }],
      selectedIds: ["42"],
    });
    expect(html).toContain("https://assets.example/signed");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("已选择");
    expect(html).toContain("图片暂不可用");
    expect(html.match(/<button[^>]*disabled=""/g)).toHaveLength(2);
  });
});
