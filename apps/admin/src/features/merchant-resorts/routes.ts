import type { Route } from "next";
import { resortId } from "@/features/merchant-resorts/resort-model";
export const merchantResortRoutes = {
  merchantResorts: "/admin/merchant/resorts",
  newMerchantResort: "/admin/merchant/resorts/new",
} as const satisfies Record<string, Route>;
export function merchantResortEditRoute(id: number) {
  if (resortId(String(id)) === null) throw new Error("雪场编号无效");
  return `/admin/merchant/resorts/${id}/edit` as Route;
}
