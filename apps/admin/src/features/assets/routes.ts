import type { Route } from "next";
import { isAssetId } from "@/features/assets/asset-library-model";
export const assetRoutes = { adminAssets: "/admin/content/assets" as const };
export function adminAssetRoute(id: string) {
  if (!isAssetId(id)) throw new Error("媒体编号无效");
  return `/admin/content/assets/${id}` as Route;
}
