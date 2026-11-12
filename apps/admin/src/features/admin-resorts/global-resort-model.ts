import type { components } from "@common/api-contracts/openapi";
import { parseCurrentUser } from "@/platform/auth/session-model";
import {
  resortId,
  resortStatuses,
  ResortInputError,
} from "@/features/merchant-resorts/resort-model";
export { resortId, resortStatuses };
export type GlobalResort = components["schemas"]["AdminResortVO"];
export type GlobalResortPage = components["schemas"]["AdminResortPageVO"];
export type GlobalResortOperator = components["schemas"]["CurrentUserVO"];
export type GlobalResortAction =
  "list" | "create" | "update" | "delete" | "publish" | "offline";
export type GlobalResortMutation =
  | { action: "create"; name: string }
  | {
      action: Exclude<GlobalResortAction, "list" | "create">;
      resortId: number;
    };
export type GlobalResortFilters = {
  page: number;
  keyword?: string;
  status?: string;
  merchantId?: number | null;
};
export class GlobalResortError extends ResortInputError {}
const permissions: Record<GlobalResortAction, string> = {
  list: "content:resort:list-all",
  create: "content:resort:create-all",
  update: "content:resort:update-all",
  delete: "content:resort:delete-all",
  publish: "content:resort:publish",
  offline: "content:resort:offline",
};
export function canManageGlobalResorts(
  user: GlobalResortOperator,
  action: GlobalResortAction = "list",
) {
  return (
    resortId(String(user.userId)) !== null &&
    ["management:portal:enter", permissions.list, permissions[action]].every(
      (key) => user.permissionKeys.includes(key),
    )
  );
}
export function globalOperatorKey(user: GlobalResortOperator) {
  return JSON.stringify([
    user.userId,
    user.account,
    user.merchant?.merchantId ?? null,
    [...new Set(user.permissionKeys)].sort(),
    [...new Set(user.roles.map((role) => role.roleKey))].sort(),
  ]);
}
export function verifyGlobalOperator(
  currentValue: unknown,
  expectedValue: unknown,
  action: GlobalResortAction = "list",
) {
  let current: GlobalResortOperator, expected: GlobalResortOperator;
  try {
    current = parseCurrentUser(currentValue);
    expected = parseCurrentUser(expectedValue);
  } catch {
    throw new GlobalResortError("账号或权限已变化，请重新读取身份后继续");
  }
  if (
    !canManageGlobalResorts(current, action) ||
    globalOperatorKey(current) !== globalOperatorKey(expected)
  )
    throw new GlobalResortError("账号或权限已变化，请重新读取身份后继续");
}
export function globalResortListPath(filters: GlobalResortFilters) {
  if (
    !Number.isInteger(filters.page) ||
    filters.page < 1 ||
    filters.page > 107374183 ||
    (filters.status !== undefined &&
      (typeof filters.status !== "string" ||
        !Object.hasOwn(resortStatuses, filters.status))) ||
    (filters.merchantId != null &&
      (typeof filters.merchantId !== "number" ||
        resortId(String(filters.merchantId)) === null)) ||
    (filters.keyword !== undefined &&
      (typeof filters.keyword !== "string" ||
        [...filters.keyword.trim()].length > 100))
  )
    throw new GlobalResortError("页码、关键词、商家编号或状态无效");
  const query = new URLSearchParams({
    page: String(filters.page),
    pageSize: "20",
  });
  if (filters.keyword?.trim()) query.set("keyword", filters.keyword.trim());
  if (filters.status) query.set("status", filters.status);
  if (filters.merchantId != null)
    query.set("merchantId", String(filters.merchantId));
  return `/admin/resorts?${query}`;
}
export function mayRunGlobalCommand(
  item: GlobalResort,
  action: "publish" | "offline" | "delete",
) {
  if (!Object.hasOwn(resortStatuses, item.status)) return false;
  return (
    action === "delete" ||
    (action === "offline"
      ? item.status === "published"
      : item.status !== "published")
  );
}
export function globalResortFingerprint(item: GlobalResort) {
  const { coverUrl: _coverUrl, gallery, ...data } = item;
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : value !== null && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, canonical(v)]),
          )
        : value;
  return JSON.stringify(
    canonical({
      ...data,
      gallery: gallery.map(({ assetId, sortOrder }) => ({
        assetId,
        sortOrder,
      })),
    }),
  );
}
