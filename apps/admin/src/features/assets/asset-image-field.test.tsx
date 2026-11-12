import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AssetImageField } from "@/features/assets/asset-image-field";

const controls = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("@/platform/auth/session-provider", () => ({
  useSession: () => ({
    session: {
      status: "authenticated",
      currentUser: {
        userId: 8,
        permissionKeys: controls.permissions,
        roles: [],
        merchant: null,
      },
    },
  }),
}));
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));

describe("asset image form control", () => {
  it("renders an empty field safely with explicit missing permissions and no manual ID input", () => {
    controls.permissions = [];
    const html = renderToStaticMarkup(createElement(AssetImageField));
    expect(html).toContain("尚未选择图片");
    expect(html).toContain("当前账号没有图片读取或上传权限");
    expect(html).not.toContain("从媒体库选择");
    expect(html).not.toContain('type="text"');
  });
  it("preserves an existing cover preview without requiring inventory access", () => {
    controls.permissions = [];
    const html = renderToStaticMarkup(
      createElement(AssetImageField, {
        value: "42",
        existingImage: { assetId: "42", url: "https://assets.example/cover" },
      }),
    );
    expect(html).toContain("https://assets.example/cover");
    expect(html).toContain("已有图片会保留");
    const changed = renderToStaticMarkup(
      createElement(AssetImageField, {
        value: "43",
        existingImage: { assetId: "42", url: "https://assets.example/cover" },
      }),
    );
    expect(changed).not.toContain("https://assets.example/cover");
  });
  it("exposes library/upload capabilities separately and disables controls during a parent save", () => {
    controls.permissions = ["content:asset:list", "asset:upload"];
    const html = renderToStaticMarkup(
      createElement(AssetImageField, { disabled: true, value: "42" }),
    );
    expect(html).toContain("从媒体库选择");
    expect(html).toContain("上传图片");
    expect(html).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(html.match(/<button[^>]*disabled=""/g)).toHaveLength(3);
    controls.permissions = ["asset:upload"];
    const onlyUpload = renderToStaticMarkup(createElement(AssetImageField));
    expect(onlyUpload).toContain("上传图片");
    expect(onlyUpload).not.toContain("从媒体库选择");
  });
});
