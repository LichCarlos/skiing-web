import type { components } from "@common/api-contracts/openapi";
import { ApiError } from "@common/api-contracts/client";
import { parseCurrentUser } from "@/platform/auth/session-model";
import {
  isAssetId,
  type AdminAsset,
  type AssetPage,
} from "@/features/assets/asset-library-model";
export type { AdminAsset, AssetPage };
export type AssetOperator = components["schemas"]["CurrentUserVO"];
export type AssetMutation = { assetId: string };
export class AssetInputError extends Error {}
export const assetStatuses = {
  pending_scan: "扫描中",
  ready: "可用",
  rejected: "已拒绝",
  deleted: "已删除",
} as const;
export const assetReferenceLabels: Record<
  keyof AdminAsset["references"],
  string
> = {
  coverResorts: "雪场封面",
  resortImages: "雪场相册",
  articleCovers: "文章图片（封面及正文）",
  dynamicImages: "动态图片",
  userAvatars: "用户头像",
};
export function canManageAssets(
  user: AssetOperator,
  action: "list" | "delete" = "list",
) {
  return (
    Number.isInteger(user.userId) &&
    user.userId > 0 &&
    user.userId <= 2147483647 &&
    user.permissionKeys.includes("management:portal:enter") &&
    user.permissionKeys.includes(`content:asset:${action}`)
  );
}
export function assetOperatorKey(user: AssetOperator) {
  return JSON.stringify([
    user.userId,
    user.account,
    user.merchant?.merchantId ?? null,
    [...new Set(user.permissionKeys)].sort(),
    user.roles.map((role) => role.roleKey).sort(),
  ]);
}
export function verifyAssetOperator(
  currentValue: unknown,
  expectedValue: unknown,
  action: "list" | "delete" = "list",
) {
  let current: AssetOperator, expected: AssetOperator;
  try {
    current = parseCurrentUser(currentValue);
    expected = parseCurrentUser(expectedValue);
  } catch {
    throw new AssetInputError("身份或媒体权限已变化，请重新读取身份");
  }
  if (
    !canManageAssets(current, action) ||
    assetOperatorKey(current) !== assetOperatorKey(expected)
  )
    throw new AssetInputError("身份或媒体权限已变化，请重新读取身份");
}
export function assetInventoryPath(query: {
  page: number;
  keyword?: string;
  status?: AdminAsset["status"];
  ownerUserId?: string;
}) {
  if (
    (query.keyword !== undefined && typeof query.keyword !== "string") ||
    (query.ownerUserId !== undefined &&
      typeof query.ownerUserId !== "string") ||
    (query.status !== undefined && typeof query.status !== "string")
  )
    throw new AssetInputError("页码、关键词、状态或上传账号编号无效");
  const keyword = query.keyword?.trim() ?? "",
    owner = query.ownerUserId?.trim() ?? "";
  if (
    !Number.isInteger(query.page) ||
    query.page < 1 ||
    query.page > 107374183 ||
    keyword.length > 100 ||
    (query.status !== undefined &&
      !Object.hasOwn(assetStatuses, query.status)) ||
    (owner !== "" && (!/^[1-9]\d*$/.test(owner) || Number(owner) > 2147483647))
  )
    throw new AssetInputError("页码、关键词、状态或上传账号编号无效");
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: "20",
  });
  if (keyword) params.set("keyword", keyword);
  if (query.status) params.set("status", query.status);
  if (owner) params.set("ownerUserId", owner);
  return `/admin/assets?${params}`;
}
export function assetReferenceCount(asset: AdminAsset) {
  return Object.values(asset.references).reduce(
    (total, value) => total + value,
    0,
  );
}
export function assertAssetDeletion(asset: AdminAsset) {
  if (!isAssetId(asset.assetId) || asset.status === "deleted")
    throw new AssetInputError("媒体已停用或编号无效，请刷新核对");
  if (assetReferenceCount(asset) !== 0)
    throw new AssetInputError("媒体仍被业务引用，不能停用");
}
export function assetFingerprint(asset: AdminAsset) {
  return JSON.stringify([
    asset.assetId,
    asset.ownerUserId,
    asset.originalName,
    asset.mimeType,
    asset.sizeBytes,
    asset.status,
    asset.createdAt,
    ...Object.keys(assetReferenceLabels).map(
      (key) => asset.references[key as keyof typeof asset.references],
    ),
  ]);
}
export function assetSize(value: string) {
  if (!/^\d+$/.test(value)) return `${value} B`;
  const bytes = BigInt(value);
  if (bytes < 1024n) return `${bytes} B`;
  const unit = bytes < 1048576n ? 1024n : 1048576n;
  const tenths = (bytes * 10n + unit / 2n) / unit;
  return `${tenths / 10n}.${tenths % 10n} ${unit === 1024n ? "KiB" : "MiB"}`;
}
export function assetAdminError(cause: unknown) {
  const message =
    cause instanceof AssetInputError
      ? cause.message
      : cause instanceof ApiError && cause.status === 403
        ? "当前账号没有媒体权限或所需数据范围"
        : cause instanceof ApiError && cause.status === 404
          ? "媒体不存在或不在可见范围，请刷新核对"
          : cause instanceof ApiError && cause.status === 409
            ? "媒体已变化，请刷新核对后操作"
            : cause instanceof ApiError && cause.status === 422
              ? "媒体仍有引用或当前状态不允许停用"
              : "媒体操作暂时不可用，请稍后重试";
  return cause instanceof ApiError && cause.traceId
    ? `${message}（traceId: ${cause.traceId}）`
    : message;
}
