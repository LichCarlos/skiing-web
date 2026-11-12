import type { Route } from "next";
export const roleRoutes = { roles: "/admin/system/roles" as const };
export function roleIdFromSegment(value: string): number | null {
  const id = Number(value);
  return /^[1-9]\d*$/.test(value) && Number.isInteger(id) && id <= 2147483647
    ? id
    : null;
}
export function managedRoleDetailRoute(id: number) {
  if (roleIdFromSegment(String(id)) === null) throw new Error("角色编号无效");
  return `/admin/system/roles/${id}` as Route;
}
export function roleAuthorizationRoute(id: number) {
  if (roleIdFromSegment(String(id)) === null) throw new Error("角色编号无效");
  return `/admin/system/roles/${id}/permissions` as Route;
}
