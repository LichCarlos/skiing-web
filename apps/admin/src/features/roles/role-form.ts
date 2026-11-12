import type { components } from "@common/api-contracts/openapi";
import { RoleInputError } from "@/features/roles/role-workflow";

export interface RoleFormValues {
  roleKey: string;
  roleName: string;
  description?: string;
  dataScope: "self" | "merchant" | "all";
  status: "active" | "disabled";
}

export function createRoleBody(
  values: RoleFormValues,
  canConfigureAuthorization: boolean,
): components["schemas"]["CreateManagedRoleDto"] {
  validateRoleForm(values);
  return {
    roleKey: values.roleKey,
    roleName: values.roleName.trim(),
    description: values.description?.trim() || null,
    dataScope: canConfigureAuthorization ? values.dataScope : "self",
  };
}

export function updateRoleBody(
  values: RoleFormValues,
  canConfigureAuthorization: boolean,
): components["schemas"]["UpdateManagedRoleDto"] {
  validateRoleForm(values);
  return {
    roleKey: values.roleKey,
    roleName: values.roleName.trim(),
    description: values.description?.trim() || null,
    status: values.status,
    ...(canConfigureAuthorization ? { dataScope: values.dataScope } : {}),
  };
}

function validateRoleForm(values: RoleFormValues) {
  if (
    !/^[a-z][a-z0-9._-]{0,49}$/.test(values.roleKey) ||
    values.roleKey === "system_admin"
  )
    throw new RoleInputError("角色键格式无效或已保留");
  if (
    !values.roleName.trim() ||
    values.roleName.trim().length > 50 ||
    (values.description?.trim().length ?? 0) > 300
  )
    throw new RoleInputError("角色名称或说明无效");
  if (
    !["self", "merchant", "all"].includes(values.dataScope) ||
    !["active", "disabled"].includes(values.status)
  )
    throw new RoleInputError("角色范围或状态无效");
}
