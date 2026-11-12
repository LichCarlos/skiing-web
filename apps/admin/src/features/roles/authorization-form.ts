import type { components } from "@common/api-contracts/openapi";
import {
  buildResourceScopes,
  type ScopeRow,
  type AuthorizationResource,
} from "@/features/roles/role-resource-scopes";
import { RoleInputError } from "@/features/roles/role-workflow";
export type AuthorizationSnapshot =
  components["schemas"]["RoleAuthorizationSnapshotVO"];
type Policy = components["schemas"]["RoleAuthorizationFieldPolicyDto"];
export interface FieldPolicyRow extends Policy {
  localKey: string;
}
/** Tree callbacks can include unknown checked keys; retain each old orphan once. */
export function reconcilePermissionSelection(
  checked: readonly unknown[],
  previous: readonly number[],
  known: ReadonlySet<number>,
) {
  return [
    ...new Set([
      ...checked
        .filter(
          (key) =>
            typeof key === "number" ||
            typeof key === "string" ||
            typeof key === "bigint",
        )
        .map(Number)
        .filter((id) => known.has(id)),
      ...previous.filter((id) => !known.has(id)),
    ]),
  ].sort((a, b) => a - b);
}
export function permissionTreeIds(
  nodes: components["schemas"]["PermissionNodeVO"][],
): Set<number> {
  const stack = [...nodes],
    ids = new Set<number>();
  while (stack.length) {
    const node = stack.pop()!;
    if (
      !Number.isInteger(node.permissionId) ||
      node.permissionId < 1 ||
      node.permissionId > 2147483647 ||
      ids.has(node.permissionId)
    )
      throw new RoleInputError("权限目录结构异常，请刷新");
    ids.add(node.permissionId);
    stack.push(...node.children);
  }
  return ids;
}
export function buildAuthorizationBody(
  permissionIds: number[],
  scopes: ScopeRow[],
  policies: FieldPolicyRow[],
  resources: AuthorizationResource[],
  previous: AuthorizationSnapshot,
): components["schemas"]["ReplaceRoleAuthorizationDto"] {
  if (
    permissionIds.some(
      (id) => !Number.isSafeInteger(id) || id < 1 || id > 2147483647,
    ) ||
    new Set(permissionIds).size !== permissionIds.length
  )
    throw new RoleInputError("权限编号无效或重复");
  let dataScopes: ReturnType<typeof buildResourceScopes>;
  try {
    dataScopes = buildResourceScopes(scopes, resources, previous.dataScopes);
  } catch (cause) {
    throw new RoleInputError(
      cause instanceof Error ? cause.message : "资源范围无效",
    );
  }
  const keys = new Set<string>();
  const fieldPolicies = policies.map((policy) => {
    const fieldKey = policy.fieldKey.trim();
    if (
      !["ski_resort", "article", "dynamic", "merchant_profile"].includes(
        policy.entityType,
      ) ||
      !/^[a-z][a-z0-9_]{0,99}$/.test(fieldKey) ||
      typeof policy.canRead !== "boolean" ||
      typeof policy.canWrite !== "boolean"
    )
      throw new RoleInputError("字段策略无效");
    const key = `${policy.entityType}:${fieldKey}`;
    if (keys.has(key)) throw new RoleInputError(`字段策略重复：${key}`);
    keys.add(key);
    return {
      entityType: policy.entityType,
      fieldKey,
      canRead: policy.canRead,
      canWrite: policy.canWrite,
    };
  });
  return {
    permissionIds: [...permissionIds].sort((a, b) => a - b),
    dataScopes,
    fieldPolicies,
  };
}
