import { describe, expect, it, vi } from "vitest";
import {
  isAssetId,
  isSelectableImage,
  loadAssetPage,
  loadReadyAsset,
  uploadImage,
  assetFailure,
  type AdminAsset,
  type AssetRequest,
} from "@/features/assets/asset-library-model";

const image: AdminAsset = {
  assetId: "42",
  ownerUserId: 8,
  ownerAccount: "uploader",
  originalName: "snow.webp",
  mimeType: "image/webp",
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
const signal = () => new AbortController().signal;

describe("asset library protocol and selection validation", () => {
  it.each([
    { items: [null] },
    { items: [image, image] },
    { total: -1 },
    { page: 2 },
    { pageSize: 20 },
    { hasNext: true },
    { items: [{ ...image, ownerUserId: 0 }] },
    { items: [{ ...image, references: null }] },
    {
      items: [{ ...image, url: "https://user:password@private.example/image" }],
    },
    { items: [{ ...image, sizeBytes: "9223372036854775808" }] },
  ])("rejects invalid media page projection %j", async (change) => {
    const request = vi.fn().mockResolvedValue({
      items: [image],
      total: 1,
      page: 1,
      pageSize: 12,
      hasNext: false,
      ...change,
    });
    await expect(
      loadAssetPage(request as AssetRequest, 1, "", signal()),
    ).rejects.toThrow();
  });
  it("keeps exact signed URL and projects page/details without extra metadata", async () => {
    const url = "https://assets.example/image?X-Amz-Signature=abc%2F123&x=2";
    const value = {
      ...image,
      assetId: "9223372036854775807",
      url,
      privateKey: "secret",
      references: { ...image.references, secret: 1 },
    };
    const request = vi.fn().mockResolvedValue({
      items: [value],
      total: 1,
      page: 1,
      pageSize: 12,
      hasNext: false,
      debug: "secret",
    });
    const result = await loadAssetPage(
      request as AssetRequest,
      1,
      "",
      signal(),
    );
    expect(result.items[0]?.url).toBe(url);
    expect(result.items[0]?.assetId).toBe(value.assetId);
    expect(JSON.stringify(result)).not.toContain("secret");
    request.mockResolvedValue(value);
    expect(
      await loadReadyAsset(request as AssetRequest, value.assetId, signal()),
    ).not.toHaveProperty("privateKey");
  });
  it.each([0, -1, 1.1, 178956972, Number.MAX_SAFE_INTEGER])(
    "rejects invalid pagination before requesting %s",
    async (page) => {
      const request = vi.fn();
      await expect(
        loadAssetPage(request as AssetRequest, page, "", signal()),
      ).rejects.toThrow();
      expect(request).not.toHaveBeenCalled();
    },
  );
  it("rejects malformed page data before it reaches the image grid", async () => {
    const request = vi.fn().mockResolvedValue({
      items: null,
      total: 1,
      page: 1,
      pageSize: 12,
      hasNext: false,
    });
    await expect(
      loadAssetPage(request as AssetRequest, 1, "", signal()),
    ).rejects.toThrow();
  });
  it("projects the upload response instead of retaining unknown private fields", async () => {
    const request = vi
      .fn()
      .mockResolvedValue({ ...image, internalObjectKey: "private" });
    const result = await uploadImage(
      request as AssetRequest,
      new File(["image"], "snow.webp", { type: "image/webp" }),
      signal(),
    );
    expect(result).not.toHaveProperty("internalObjectKey");
  });
  it("handles a null image response without a renderer exception", () => {
    expect(isSelectableImage(null as unknown as AdminAsset)).toBe(false);
  });
  it("does not expose raw backend errors in the picker", () => {
    expect(assetFailure(new Error("secret storage host"))).not.toContain(
      "secret storage host",
    );
  });
  it("keeps bigint IDs exact and rejects invalid/out-of-range IDs", () => {
    for (const id of ["42", "9007199254740993", "9223372036854775807"])
      expect(isAssetId(id)).toBe(true);
    for (const id of ["", "0", "-1", "01", "1.5", "1/2", "9223372036854775808"])
      expect(isAssetId(id)).toBe(false);
  });
  it.each([
    { status: "pending_scan" },
    { status: "deleted" },
    { status: "rejected" },
    { mimeType: "image/svg+xml" },
    { url: null },
    { url: "javascript:alert(1)" },
    { url: "not-a-url" },
  ] satisfies Array<Partial<AdminAsset>>)(
    "does not offer unavailable or unsupported images %j",
    (change) => {
      expect(isSelectableImage({ ...image, ...change })).toBe(false);
      expect(isSelectableImage(image)).toBe(true);
    },
  );
  it("requests ready-only server pagination with trimmed and encoded search", async () => {
    const page = {
      items: [image],
      total: 13,
      page: 2,
      pageSize: 12,
      hasNext: false,
    };
    const request = vi.fn().mockResolvedValue(page);
    const abort = signal();
    expect(
      await loadAssetPage(request as AssetRequest, 2, " 雪 & slope ", abort),
    ).toEqual(page);
    const url = new URL(
      request.mock.calls[0]![0] as string,
      "https://api.example",
    );
    expect(url.pathname).toBe("/admin/assets");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: "2",
      pageSize: "12",
      status: "ready",
      keyword: "雪 & slope",
    });
    expect(request.mock.calls[0]![1]).toEqual({
      signal: abort,
      cache: "no-store",
    });
  });
  it("revalidates the selected record rather than trusting an old page card", async () => {
    const request = vi
      .fn()
      .mockResolvedValue({ ...image, status: "deleted", url: null });
    await expect(
      loadReadyAsset(request as AssetRequest, "42", signal()),
    ).rejects.toThrow("图片当前不可用");
    expect(request).toHaveBeenCalledWith(
      "/admin/assets/42",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
  it("rejects a mismatched detail response and refuses invalid IDs before requesting", async () => {
    const request = vi.fn().mockResolvedValue({ ...image, assetId: "43" });
    await expect(
      loadReadyAsset(request as AssetRequest, "42", signal()),
    ).rejects.toThrow("图片当前不可用");
    request.mockClear();
    await expect(
      loadReadyAsset(request as AssetRequest, "../42", signal()),
    ).rejects.toThrow("图片标识无效");
    expect(request).not.toHaveBeenCalled();
  });
  it("returns fresh signed details and rejects late results after cancellation", async () => {
    const request = vi.fn().mockResolvedValue(image);
    expect(
      await loadReadyAsset(request as AssetRequest, "42", signal()),
    ).toEqual(image);
    const controller = new AbortController();
    controller.abort();
    await expect(
      loadReadyAsset(request as AssetRequest, "42", controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    await expect(
      loadAssetPage(request as AssetRequest, 1, "", controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
  it("uploads only multipart file content and accepts scanned images", async () => {
    const request = vi.fn().mockResolvedValue(image);
    const file = new File(["image-data"], "snow.webp", { type: "image/webp" });
    expect(
      await uploadImage(request as AssetRequest, file, signal()),
    ).toMatchObject({ assetId: image.assetId });
    const [path, options] = request.mock.calls[0]!;
    expect(path).toBe("/assets");
    const body = (options as { body: FormData; method: string }).body;
    expect(body.get("file")).toEqual(file);
    expect([...body.keys()]).toEqual(["file"]);
    expect(options).toMatchObject({ method: "POST" });
  });
  it.each([
    new File(["svg"], "x.svg", { type: "image/svg+xml" }),
    new File([], "empty.png", { type: "image/png" }),
    new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.png", {
      type: "image/png",
    }),
  ])("rejects invalid file before uploading ($name)", async (file) => {
    const request = vi.fn();
    await expect(
      uploadImage(request as AssetRequest, file, signal()),
    ).rejects.toThrow("10 MiB");
    expect(request).not.toHaveBeenCalled();
  });
  it("does not attach pending uploads or canceled successful responses", async () => {
    const request = vi
      .fn()
      .mockResolvedValue({ ...image, status: "pending_scan" });
    const file = new File(["image-data"], "snow.webp", { type: "image/webp" });
    await expect(
      uploadImage(request as AssetRequest, file, signal()),
    ).rejects.toThrow("图片尚未通过扫描");
    request.mockResolvedValue(image);
    const controller = new AbortController();
    controller.abort();
    await expect(
      uploadImage(request as AssetRequest, file, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
  it("preserves actionable permission, visibility and network errors", () => {
    expect(assetFailure({ status: 403 })).toContain("权限或所需的数据范围");
    expect(assetFailure({ status: 404 })).toContain("可见范围");
    expect(assetFailure(new Error("Network failed"))).toContain("核对");
    expect(assetFailure(null)).toContain("重试");
  });
});
