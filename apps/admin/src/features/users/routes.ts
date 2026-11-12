import type { Route } from "next";

export const userRoutes = { users: "/admin/system/users" as const };

export function accountIdFromSegment(value: string): number | null {
  const id = Number(value);
  return /^[1-9]\d*$/.test(value) && Number.isInteger(id) && id <= 2147483647
    ? id
    : null;
}
export function managedUserDetailRoute(userId: number) {
  if (accountIdFromSegment(String(userId)) === null)
    throw new Error("账号编号无效");
  return `/admin/system/users/${userId}` as Route;
}
