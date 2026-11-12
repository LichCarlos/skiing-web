import { apiRequest } from "@/platform/api";
import {
  verifyRoleReader,
  RoleInputError,
  isRoleAdministrator,
  type RoleUser,
} from "@/features/roles/role-workflow";
import {
  roleId,
  parseManagedRole,
  parseRolePage,
  parseRoleAuthorization,
  parseRolePermissionTree,
  parseRoleResources,
} from "@/features/roles/role-response";

export async function verifyRoleIdentity(
  user: RoleUser,
  signal: AbortSignal,
  authorization = false,
) {
  signal.throwIfAborted();
  verifyRoleReader(user, user);
  const current = await apiRequest<unknown>("/auth/me", {
    signal,
    cache: "no-store",
  });
  signal.throwIfAborted();
  verifyRoleReader(current, user);
  if (
    authorization &&
    (!isRoleAdministrator(user) ||
      !user.permissionKeys.includes("system:permission:assign"))
  )
    throw new RoleInputError("当前身份无权读取授权配置");
}
export async function readRoleTarget(id: number, signal: AbortSignal) {
  roleId(id);
  signal.throwIfAborted();
  const value = await apiRequest<unknown>(`/admin/roles/${id}`, {
    signal,
    cache: "no-store",
  });
  signal.throwIfAborted();
  return parseManagedRole(value, id);
}
export async function readRoleDetail(
  user: RoleUser,
  id: number,
  signal: AbortSignal,
) {
  roleId(id);
  await verifyRoleIdentity(user, signal);
  const result = await readRoleTarget(id, signal);
  await verifyRoleIdentity(user, signal);
  return result;
}
export async function readRolePage(
  user: RoleUser,
  page: number,
  keyword: string,
  status: string | undefined,
  signal: AbortSignal,
) {
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    (page - 1) * 20 > 2147483647 ||
    typeof keyword !== "string" ||
    keyword.trim().length > 100 ||
    (status !== undefined && status !== "active" && status !== "disabled")
  )
    throw new RoleInputError("页码、关键词或状态无效，请重新筛选");
  await verifyRoleIdentity(user, signal);
  const query = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (keyword.trim()) query.set("keyword", keyword.trim());
  if (status) query.set("status", status);
  const value = await apiRequest<unknown>(`/admin/roles?${query}`, {
    signal,
    cache: "no-store",
  });
  signal.throwIfAborted();
  const result = parseRolePage(value, page, status);
  await verifyRoleIdentity(user, signal);
  return result;
}
export async function readRoleAuthorization(
  user: RoleUser,
  id: number,
  signal: AbortSignal,
) {
  roleId(id);
  await verifyRoleIdentity(user, signal, true);
  const [role, permissions, resources] = await Promise.all([
    apiRequest<unknown>(`/admin/roles/${id}/permissions`, {
      signal,
      cache: "no-store",
    }),
    apiRequest<unknown>("/admin/permissions/tree", {
      signal,
      cache: "no-store",
    }),
    apiRequest<unknown>("/admin/authorization/resources", {
      signal,
      cache: "no-store",
    }),
  ]);
  signal.throwIfAborted();
  const result = {
    role: parseRoleAuthorization(role, id),
    permissions: parseRolePermissionTree(permissions),
    resources: parseRoleResources(resources),
  };
  await verifyRoleIdentity(user, signal, true);
  return result;
}
