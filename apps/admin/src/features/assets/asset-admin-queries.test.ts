import { describe, it, expect, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import {
  readAdminAsset,
  readAssetInventory,
  prepareAssetDeletion,
  sendAssetDeletion,
  reviewAssetDeletions,
  type AssetAdminRequest,
} from "@/features/assets/asset-admin-queries";
import {
  operator,
  asset,
  deferred,
} from "@/features/assets/asset-admin-fixtures.test-helper";
const signal = () => new AbortController().signal;
function setup() {
  const mock = vi.fn(async (path: string) =>
    path === "/auth/me" ? operator : asset,
  );
  return { mock, request: mock as AssetAdminRequest };
}
describe("asset administration reads and preflight", () => {
  it("verifies identity before reading a private no-store bigint target", async () => {
    const s = setup();
    expect(
      await readAdminAsset(s.request, operator, asset.assetId, signal()),
    ).toEqual(asset);
    expect(s.mock.mock.calls.map((call) => call[0])).toEqual([
      "/auth/me",
      `/admin/assets/${asset.assetId}`,
      "/auth/me",
    ]);
    expect(s.mock).toHaveBeenNthCalledWith(
      2,
      `/admin/assets/${asset.assetId}`,
      expect.objectContaining({ cache: "no-store" }),
    );
  });
  it("does not continue after cancellation during identity lookup", async () => {
    const pending = deferred<typeof operator>(),
      mock = vi.fn(() => pending.promise),
      controller = new AbortController();
    const task = readAdminAsset(
      mock as AssetAdminRequest,
      operator,
      asset.assetId,
      controller.signal,
    );
    controller.abort();
    pending.resolve(operator);
    await expect(task).rejects.toThrow();
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it("does not read after identity/grant changes", async () => {
    const mock = vi.fn(async () => ({ ...operator, permissionKeys: [] }));
    await expect(
      readAdminAsset(
        mock as AssetAdminRequest,
        operator,
        asset.assetId,
        signal(),
      ),
    ).rejects.toThrow();
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it("rejects mismatched detail targets", async () => {
    const mock = vi.fn(async (path: string) =>
      path === "/auth/me" ? operator : { ...asset, assetId: "42" },
    );
    await expect(
      readAdminAsset(
        mock as AssetAdminRequest,
        operator,
        asset.assetId,
        signal(),
      ),
    ).rejects.toThrow();
  });
  it("uses committed list filters without user-supplied scope", async () => {
    const s = setup();
    s.mock.mockImplementation(async (path: string) =>
      path === "/auth/me"
        ? operator
        : ({
            items: [],
            total: 20,
            page: 2,
            pageSize: 20,
            hasNext: false,
          } as never),
    );
    await readAssetInventory(
      s.request,
      operator,
      { page: 2, keyword: "snow", ownerUserId: "42", status: "ready" },
      signal(),
    );
    expect(s.mock).toHaveBeenNthCalledWith(
      2,
      "/admin/assets?page=2&pageSize=20&keyword=snow&status=ready&ownerUserId=42",
      expect.anything(),
    );
  });
  it("prepares the original string ID after a fresh reference check", async () => {
    const s = setup();
    expect(
      await prepareAssetDeletion(s.request, operator, asset, signal()),
    ).toBe(asset.assetId);
  });
  it.each(["ownerUserId", "status", "originalName", "sizeBytes"] as const)(
    "rejects a changed %s",
    async (key) => {
      const mock = vi.fn(async (path: string) =>
        path === "/auth/me"
          ? operator
          : {
              ...asset,
              [key]:
                key === "ownerUserId"
                  ? 3
                  : key === "status"
                    ? "rejected"
                    : "changed",
            },
      );
      await expect(
        prepareAssetDeletion(
          mock as AssetAdminRequest,
          operator,
          asset,
          signal(),
        ),
      ).rejects.toThrow();
    },
  );
  it("refuses newly referenced media and never sends a mutation", async () => {
    const mock = vi.fn(async (path: string) =>
      path === "/auth/me"
        ? operator
        : { ...asset, references: { ...asset.references, userAvatars: 1 } },
    );
    await expect(
      prepareAssetDeletion(
        mock as AssetAdminRequest,
        operator,
        asset,
        signal(),
      ),
    ).rejects.toThrow();
    expect(mock).toHaveBeenCalledTimes(3);
  });
  it("sends bodyless DELETE using the exact bigint ID", async () => {
    const mock = vi.fn(async () => undefined);
    await sendAssetDeletion(mock as AssetAdminRequest, asset.assetId, signal());
    expect(mock).toHaveBeenCalledWith(
      `/admin/assets/${asset.assetId}`,
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(mock).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.objectContaining({ body: expect.anything() }),
    );
  });
  it.each(["01", "0", "9223372036854775808", "1e2"])(
    "rejects ID %s before network access",
    async (id) => {
      const mock = vi.fn();
      await expect(
        readAdminAsset(mock, operator, id, signal()),
      ).rejects.toThrow();
      await expect(sendAssetDeletion(mock, id, signal())).rejects.toThrow();
      expect(mock).not.toHaveBeenCalled();
    },
  );
  it("reports authoritative status for manual review", async () => {
    const s = setup();
    expect(
      (
        await reviewAssetDeletions(
          s.request,
          operator,
          [{ assetId: asset.assetId }],
          signal(),
        )
      )[0],
    ).toContain("ready");
  });
  it("does not treat a 404 as deletion proof or swallow permission failures", async () => {
    const mock = vi.fn(async (path: string) => {
      if (path === "/auth/me") return operator;
      throw new ApiError("missing", { status: 404, code: 404, traceId: null });
    });
    expect(
      (
        await reviewAssetDeletions(
          mock as AssetAdminRequest,
          operator,
          [{ assetId: asset.assetId }],
          signal(),
        )
      )[0],
    ).toContain("404不证明停用成功");
    mock.mockImplementation(async () => {
      throw new ApiError("denied", { status: 403, code: 403, traceId: null });
    });
    await expect(
      reviewAssetDeletions(
        mock as AssetAdminRequest,
        operator,
        [{ assetId: asset.assetId }],
        signal(),
      ),
    ).rejects.toThrow();
  });
});
