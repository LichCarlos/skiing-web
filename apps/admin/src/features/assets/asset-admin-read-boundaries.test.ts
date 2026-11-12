import { expect, it, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import {
  operator,
  asset,
} from "@/features/assets/asset-admin-fixtures.test-helper";
import {
  readAdminAsset,
  readAssetInventory,
  sendAssetDeletion,
  reviewAssetDeletions,
  type AssetAdminRequest,
} from "@/features/assets/asset-admin-queries";
import {
  assetInventoryPath,
  assetOperatorKey,
} from "@/features/assets/asset-admin-model";
const signal = () => new AbortController().signal;
function requestFor(value: unknown) {
  return vi.fn(async (path: string) =>
    path === "/auth/me" ? operator : value,
  );
}
it.each([
  null,
  [],
  { ...asset, ownerUserId: 0 },
  { ...asset, ownerAccount: null },
  { ...asset, sizeBytes: "01" },
  { ...asset, sizeBytes: "9223372036854775808" },
  { ...asset, status: ["ready"] },
  { ...asset, url: "javascript:alert(1)" },
  { ...asset, url: "https://user:pass@example.com/a" },
  { ...asset, createdAt: "2026-11-01" },
  { ...asset, mimeType: null },
  { ...asset, references: { ...asset.references, userAvatars: -1 } },
  { ...asset, references: { ...asset.references, coverResorts: 0.5 } },
  { ...asset, references: null },
])("rejects malformed private asset %j", async (value) => {
  await expect(
    readAdminAsset(
      requestFor(value) as AssetAdminRequest,
      operator,
      asset.assetId,
      signal(),
    ),
  ).rejects.toThrow();
});
it("projects full assets without storage internals and copies reference counts", async () => {
  const value = {
    ...asset,
    storageKey: "private-secret",
    references: { ...asset.references, metadata: "secret" },
  };
  const result = await readAdminAsset(
    requestFor(value) as AssetAdminRequest,
    operator,
    asset.assetId,
    signal(),
  );
  expect(result).toEqual(asset);
  expect(result.references).not.toBe(value.references);
});
const page = {
  items: [asset],
  page: 1,
  pageSize: 20,
  total: 1,
  hasNext: false,
};
it.each([
  { ...page, page: 2 },
  { ...page, pageSize: 12 },
  { ...page, total: -1 },
  { ...page, total: 21 },
  { ...page, total: 0 },
  { ...page, hasNext: true },
  { ...page, items: [asset, asset], total: 2 },
  { ...page, items: [{ ...asset, status: "rejected" }] },
])("rejects malformed or mismatched media pages %j", async (value) => {
  await expect(
    readAssetInventory(
      requestFor(value) as AssetAdminRequest,
      operator,
      { page: 1, status: "ready" },
      signal(),
    ),
  ).rejects.toThrow();
});
it("rejects a different owner filter", async () => {
  await expect(
    readAssetInventory(
      requestFor(page) as AssetAdminRequest,
      operator,
      { page: 1, ownerUserId: "3" },
      signal(),
    ),
  ).rejects.toThrow();
});
it.each(["keyword", "ownerUserId", "status"] as const)(
  "rejects coerced %s filters",
  (key) => {
    expect(() =>
      assetInventoryPath({ page: 1, [key]: ["ready"] } as never),
    ).toThrow();
  },
);
it.each(["account", "merchant"] as const)(
  "includes %s in the private asset identity",
  (key) => {
    const changed =
      key === "account"
        ? { ...operator, account: "changed" }
        : { ...operator, merchant: { merchantId: 3, businessName: "changed" } };
    expect(assetOperatorKey(changed)).not.toBe(assetOperatorKey(operator));
  },
);
it("rejects invalid local identity before requesting private data", async () => {
  const mock = requestFor(asset);
  await expect(
    readAdminAsset(
      mock as AssetAdminRequest,
      { ...operator, account: "" },
      asset.assetId,
      signal(),
    ),
  ).rejects.toThrow();
  expect(mock).not.toHaveBeenCalled();
});
it.each([false, true])(
  "rejects read-end permission loss (missing=%s)",
  async (missing) => {
    let identities = 0;
    const mock = vi.fn(async (path: string) => {
      if (path === "/auth/me")
        return ++identities === 1
          ? operator
          : { ...operator, permissionKeys: [] };
      if (missing)
        throw new ApiError("missing", {
          status: 404,
          code: 404,
          traceId: null,
        });
      return asset;
    });
    const task = missing
      ? reviewAssetDeletions(
          mock as AssetAdminRequest,
          operator,
          [{ assetId: asset.assetId }],
          signal(),
        )
      : readAdminAsset(
          mock as AssetAdminRequest,
          operator,
          asset.assetId,
          signal(),
        );
    await expect(task).rejects.toThrow("权限");
    expect(identities).toBe(2);
  },
);
it("requires an empty deletion response", async () => {
  await expect(
    sendAssetDeletion(
      requestFor({ storageKey: "secret" }) as AssetAdminRequest,
      asset.assetId,
      signal(),
    ),
  ).rejects.toThrow();
});
