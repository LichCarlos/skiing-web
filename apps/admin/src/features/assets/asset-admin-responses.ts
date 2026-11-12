import { parseAdminAsset } from "@/features/assets/asset-library-model";
import {
  AssetInputError,
  type AdminAsset,
  type AssetPage,
  type assetInventoryPath,
} from "@/features/assets/asset-admin-model";
function invalid(): never {
  throw new AssetInputError("媒体资料或分页不匹配，请刷新后核对");
}
export function parseInventoryAsset(
  value: unknown,
  expected?: string,
): AdminAsset {
  let asset: AdminAsset;
  try {
    asset = parseAdminAsset(value);
  } catch {
    invalid();
  }
  if (
    (expected !== undefined && asset.assetId !== expected) ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(
      asset.createdAt,
    )
  )
    invalid();
  return asset;
}
export function parseInventoryPage(
  value: unknown,
  query: Parameters<typeof assetInventoryPath>[0],
): AssetPage {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const source = value as Record<string, unknown>;
  if (
    source.page !== query.page ||
    source.pageSize !== 20 ||
    typeof source.total !== "number" ||
    !Number.isSafeInteger(source.total) ||
    source.total < 0 ||
    !Array.isArray(source.items) ||
    source.items.length !==
      Math.min(20, Math.max(0, source.total - (query.page - 1) * 20)) ||
    source.hasNext !== query.page * 20 < source.total
  )
    invalid();
  const items = source.items.map((item) => parseInventoryAsset(item));
  const owner = query.ownerUserId?.trim();
  if (
    new Set(items.map((item) => item.assetId)).size !== items.length ||
    items.some(
      (item) =>
        (query.status !== undefined && item.status !== query.status) ||
        (owner && item.ownerUserId !== Number(owner)),
    )
  )
    invalid();
  return {
    items,
    total: source.total,
    page: query.page,
    pageSize: 20,
    hasNext: source.hasNext as boolean,
  };
}
