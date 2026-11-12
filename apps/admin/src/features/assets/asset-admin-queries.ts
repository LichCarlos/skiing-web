import { ApiError, type ApiRequestOptions } from "@common/api-contracts/client";
import { isAssetId } from "@/features/assets/asset-library-model";
import {
  parseInventoryAsset,
  parseInventoryPage,
} from "@/features/assets/asset-admin-responses";
import {
  verifyAssetOperator,
  assetInventoryPath,
  assertAssetDeletion,
  assetFingerprint,
  AssetInputError,
  type AssetOperator,
  type AdminAsset,
  type AssetMutation,
} from "@/features/assets/asset-admin-model";
export type AssetAdminRequest = <T>(
  path: string,
  options?: ApiRequestOptions,
) => Promise<T>;
export async function verifyAssetReader(
  request: AssetAdminRequest,
  user: AssetOperator,
  signal: AbortSignal,
) {
  verifyAssetOperator(user, user);
  signal.throwIfAborted();
  const current = await request<AssetOperator>("/auth/me", {
    signal,
    cache: "no-store",
  });
  signal.throwIfAborted();
  verifyAssetOperator(current, user);
}
export async function readAdminAsset(
  request: AssetAdminRequest,
  user: AssetOperator,
  id: string,
  signal: AbortSignal,
) {
  if (!isAssetId(id)) throw new AssetInputError("媒体编号无效");
  await verifyAssetReader(request, user, signal);
  let response: unknown;
  try {
    response = await request<unknown>(`/admin/assets/${id}`, {
      signal,
      cache: "no-store",
    });
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 404)
      await verifyAssetReader(request, user, signal);
    throw cause;
  }
  signal.throwIfAborted();
  const asset = parseInventoryAsset(response, id);
  await verifyAssetReader(request, user, signal);
  return asset;
}
export async function readAssetInventory(
  request: AssetAdminRequest,
  user: AssetOperator,
  query: Parameters<typeof assetInventoryPath>[0],
  signal: AbortSignal,
) {
  const path = assetInventoryPath(query);
  await verifyAssetReader(request, user, signal);
  const response = await request<unknown>(path, { signal, cache: "no-store" });
  signal.throwIfAborted();
  const data = parseInventoryPage(response, query);
  await verifyAssetReader(request, user, signal);
  return data;
}
export async function prepareAssetDeletion(
  request: AssetAdminRequest,
  user: AssetOperator,
  displayed: AdminAsset,
  signal: AbortSignal,
) {
  assertAssetDeletion(displayed);
  const latest = await readAdminAsset(request, user, displayed.assetId, signal);
  assertAssetDeletion(latest);
  if (assetFingerprint(latest) !== assetFingerprint(displayed))
    throw new AssetInputError("媒体内容、归属或引用已变化，请刷新后重新选择");
  return latest.assetId;
}
export async function sendAssetDeletion(
  request: AssetAdminRequest,
  id: string,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  if (!isAssetId(id)) throw new AssetInputError("媒体编号无效");
  const response = await request<unknown>(`/admin/assets/${id}`, {
    method: "DELETE",
    signal,
  });
  if (response !== undefined)
    throw new AssetInputError("媒体停用回执异常，请读取并核对");
}
export async function reviewAssetDeletions(
  request: AssetAdminRequest,
  user: AssetOperator,
  mutations: readonly AssetMutation[],
  signal: AbortSignal,
) {
  const summaries: string[] = [];
  for (const mutation of mutations) {
    try {
      const asset = await readAdminAsset(
        request,
        user,
        mutation.assetId,
        signal,
      );
      summaries.push(
        `媒体 #${asset.assetId} ${asset.originalName}：${asset.status}，请人工核对`,
      );
    } catch (cause) {
      if (!(cause instanceof ApiError) || cause.status !== 404) throw cause;
      signal.throwIfAborted();
      summaries.push(
        `媒体 #${mutation.assetId}不存在或无权读取，404不证明停用成功`,
      );
    }
  }
  return summaries;
}
