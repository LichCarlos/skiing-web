import { describe, it, expect } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import {
  canManageAssets,
  assetOperatorKey,
  verifyAssetOperator,
  assetInventoryPath,
  assertAssetDeletion,
  assetFingerprint,
  assetSize,
  assetAdminError,
} from "@/features/assets/asset-admin-model";
import { adminAssetRoute } from "@/features/assets/routes";
import {
  operator,
  asset,
} from "@/features/assets/asset-admin-fixtures.test-helper";
describe("asset administration contract", () => {
  it("permits configured custom roles and separates deletion from reading", () => {
    expect(canManageAssets(operator)).toBe(true);
    const reader = {
      ...operator,
      permissionKeys: operator.permissionKeys.filter(
        (p) => p !== "content:asset:delete",
      ),
    };
    expect(canManageAssets(reader)).toBe(true);
    expect(canManageAssets(reader, "delete")).toBe(false);
  });
  it.each(["management:portal:enter", "content:asset:list"])(
    "requires %s",
    (permission) =>
      expect(
        canManageAssets({
          ...operator,
          permissionKeys: operator.permissionKeys.filter(
            (p) => p !== permission,
          ),
        }),
      ).toBe(false),
  );
  it("normalizes grant order and detects identity changes", () => {
    expect(
      assetOperatorKey({
        ...operator,
        permissionKeys: [...operator.permissionKeys].reverse(),
      }),
    ).toBe(assetOperatorKey(operator));
    expect(() =>
      verifyAssetOperator({ ...operator, userId: 2 }, operator),
    ).toThrow();
  });
  it("uses only declared filters and no identity or scope claims", () => {
    expect(
      assetInventoryPath({
        page: 2,
        keyword: " snow ",
        status: "ready",
        ownerUserId: " 42 ",
      }),
    ).toBe(
      "/admin/assets?page=2&pageSize=20&keyword=snow&status=ready&ownerUserId=42",
    );
    expect(assetInventoryPath({ page: 1, ownerUserId: "", keyword: " " })).toBe(
      "/admin/assets?page=1&pageSize=20",
    );
  });
  it.each([0, -1, 1.5, NaN, 107374184])("rejects page %s", (page) =>
    expect(() => assetInventoryPath({ page })).toThrow(),
  );
  it.each(["01", "0", "-1", "1e2", "2147483648", "x"])(
    "rejects owner %s",
    (ownerUserId) =>
      expect(() => assetInventoryPath({ page: 1, ownerUserId })).toThrow(),
  );
  it("rejects unknown statuses and excessive keyword", () => {
    expect(() =>
      assetInventoryPath({ page: 1, status: "active" as never }),
    ).toThrow();
    expect(() =>
      assetInventoryPath({ page: 1, keyword: "x".repeat(101) }),
    ).toThrow();
  });
  it.each([
    "coverResorts",
    "resortImages",
    "articleCovers",
    "dynamicImages",
    "userAvatars",
  ] as const)("blocks referenced %s", (key) =>
    expect(() =>
      assertAssetDeletion({
        ...asset,
        references: { ...asset.references, [key]: 1 },
      }),
    ).toThrow(),
  );
  it("blocks already deleted assets and permits ready, rejected and scanning", () => {
    expect(() =>
      assertAssetDeletion({ ...asset, status: "deleted" }),
    ).toThrow();
    for (const status of ["ready", "rejected", "pending_scan"] as const)
      expect(() => assertAssetDeletion({ ...asset, status })).not.toThrow();
  });
  it("ignores renewed signed URLs but detects owner and reference changes", () => {
    expect(
      assetFingerprint({ ...asset, url: "https://example.com/renewed" }),
    ).toBe(assetFingerprint(asset));
    expect(assetFingerprint({ ...asset, ownerUserId: 3 })).not.toBe(
      assetFingerprint(asset),
    );
    expect(
      assetFingerprint({
        ...asset,
        references: { ...asset.references, userAvatars: 1 },
      }),
    ).not.toBe(assetFingerprint(asset));
  });
  it("retains bigint IDs and byte sizes without Number conversion", () => {
    expect(adminAssetRoute(asset.assetId)).toBe(
      `/admin/content/assets/${asset.assetId}`,
    );
    expect(() => adminAssetRoute("9223372036854775808")).toThrow();
    expect(assetSize("2048")).toBe("2.0 KiB");
    expect(assetSize("1048576")).toBe("1.0 MiB");
    expect(assetSize("5")).toBe("5 B");
    expect(assetSize("9223372036854775807")).toBe("8796093022208.0 MiB");
  });
  it("does not expose raw server errors", () => {
    expect(
      assetAdminError(
        new ApiError("secret", { status: 500, code: 500, traceId: "trace" }),
      ),
    ).not.toContain("secret");
    expect(
      assetAdminError(
        new ApiError("secret", { status: 403, code: 403, traceId: "trace" }),
      ),
    ).toContain("trace");
  });
});
