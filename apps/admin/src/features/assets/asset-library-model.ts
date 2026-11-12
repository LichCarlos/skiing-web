import type { components, operations } from "@common/api-contracts/openapi";
import type { ApiClient } from "@common/api-contracts/client";

export type AdminAsset = components["schemas"]["AdminAssetVO"];
export type AssetImage = Pick<
  AdminAsset,
  "assetId" | "originalName" | "mimeType" | "status" | "url"
>;
export type AssetPage =
  operations["AdminAssetsController_list"]["responses"][200]["content"]["application/json"];
export type AssetRequest = ApiClient["request"];
export const assetPageSize = 12;
export class AssetPickerError extends Error {}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AssetPickerError("图片响应异常，请刷新后重试");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim())
    throw new AssetPickerError("图片响应异常，请刷新后重试");
  return value;
}
function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new AssetPickerError("图片响应异常，请刷新后重试");
  return value;
}
function imageProjection(value: unknown): AssetImage {
  const item = record(value);
  const assetId = text(item.assetId);
  if (
    !isAssetId(assetId) ||
    typeof item.status !== "string" ||
    !["pending_scan", "ready", "rejected", "deleted"].includes(item.status)
  )
    throw new AssetPickerError("图片响应异常，请刷新后重试");
  const url = item.url === null ? null : text(item.url);
  if (url !== null) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new AssetPickerError("图片地址异常，请重新选择");
    }
    if (
      !["https:", "http:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      throw new AssetPickerError("图片地址异常，请重新选择");
  }
  return {
    assetId,
    originalName: text(item.originalName),
    mimeType: text(item.mimeType),
    status: item.status as AssetImage["status"],
    url,
  };
}
export function parseAdminAsset(value: unknown): AdminAsset {
  const item = record(value),
    references = record(item.references);
  const ownerUserId = count(item.ownerUserId);
  const sizeBytes = text(item.sizeBytes),
    createdAt = text(item.createdAt);
  if (
    !ownerUserId ||
    ownerUserId > 2147483647 ||
    !/^(0|[1-9]\d*)$/.test(sizeBytes) ||
    BigInt(sizeBytes) > 9223372036854775807n ||
    !Number.isFinite(Date.parse(createdAt))
  )
    throw new AssetPickerError("图片响应异常，请刷新后重试");
  return {
    ...imageProjection(item),
    ownerUserId,
    ownerAccount: text(item.ownerAccount),
    sizeBytes,
    createdAt,
    references: {
      coverResorts: count(references.coverResorts),
      resortImages: count(references.resortImages),
      articleCovers: count(references.articleCovers),
      dynamicImages: count(references.dynamicImages),
      userAvatars: count(references.userAvatars),
    },
  };
}

export function isAssetId(value: string): boolean {
  return /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
}

export function isSelectableImage(asset: AssetImage): boolean {
  if (
    !asset ||
    typeof asset !== "object" ||
    typeof asset.assetId !== "string" ||
    !isAssetId(asset.assetId) ||
    asset.status !== "ready" ||
    !["image/jpeg", "image/png", "image/webp"].includes(asset.mimeType) ||
    !asset.url
  )
    return false;
  try {
    const parsed = new URL(asset.url);
    return (
      ["http:", "https:"].includes(parsed.protocol) &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

export async function loadAssetPage(
  request: AssetRequest,
  page: number,
  keyword: string,
  signal: AbortSignal,
): Promise<AssetPage> {
  signal.throwIfAborted();
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    (page - 1) * assetPageSize > 2147483647 ||
    keyword.trim().length > 100
  )
    throw new AssetPickerError("页码或关键词无效，请重新筛选");
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(assetPageSize),
    status: "ready",
  });
  if (keyword.trim()) query.set("keyword", keyword.trim());
  const result = await request<AssetPage>(`/admin/assets?${query}`, {
    signal,
    cache: "no-store",
  });
  signal.throwIfAborted();
  const item = record(result);
  const total = count(item.total);
  if (
    !Array.isArray(item.items) ||
    item.items.length > assetPageSize ||
    item.page !== page ||
    item.pageSize !== assetPageSize ||
    item.hasNext !== page * assetPageSize < total ||
    item.items.length > total
  )
    throw new AssetPickerError("图片分页响应异常，请刷新后重试");
  const items = item.items.map(parseAdminAsset);
  if (
    new Set(items.map((item) => item.assetId)).size !== items.length ||
    items.some((item) => item.status !== "ready")
  )
    throw new AssetPickerError("图片列表已变化，请刷新后重试");
  return {
    items,
    total,
    page,
    pageSize: assetPageSize,
    hasNext: page * assetPageSize < total,
  };
}

export async function loadReadyAsset(
  request: AssetRequest,
  id: string,
  signal: AbortSignal,
): Promise<AdminAsset> {
  signal.throwIfAborted();
  if (!isAssetId(id)) throw new AssetPickerError("图片标识无效，请重新选择");
  const asset = await request<AdminAsset>(`/admin/assets/${id}`, {
    signal,
    cache: "no-store",
  });
  signal.throwIfAborted();
  if (!asset || asset.assetId !== id || !isSelectableImage(asset))
    throw new AssetPickerError("图片当前不可用，请刷新后重新选择");
  return parseAdminAsset(asset);
}

export async function uploadImage(
  request: AssetRequest,
  file: File,
  signal: AbortSignal,
): Promise<AssetImage> {
  signal.throwIfAborted();
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size === 0 ||
    file.size > 10 * 1024 * 1024
  )
    throw new AssetPickerError(
      "请选择 JPEG、PNG 或 WebP 图片，大小不超过 10 MiB",
    );
  const body = new FormData();
  body.append("file", file);
  const result = await request<components["schemas"]["AssetVO"]>("/assets", {
    method: "POST",
    body,
    signal,
  });
  signal.throwIfAborted();
  if (!isSelectableImage(result))
    throw new AssetPickerError("图片尚未通过扫描，请先核对媒体状态");
  return imageProjection(result);
}

export function assetFailure(cause: unknown): string {
  if (cause instanceof AssetPickerError) return cause.message;
  if (typeof cause === "object" && cause !== null && "status" in cause) {
    if (cause.status === 403)
      return "当前账号没有媒体读取权限或所需的数据范围，请联系管理员";
    if (cause.status === 404)
      return "图片已删除或不在可见范围内，请刷新后重新选择";
  }
  return "图片操作暂时失败，请核对当前状态后重试";
}
