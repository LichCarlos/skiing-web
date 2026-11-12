import type { components } from "@common/api-contracts/openapi";

export type AuthorizationResource =
  components["schemas"]["AuthorizationResourceVO"];
export type ResourceScope =
  components["schemas"]["RoleAuthorizationDataScopeDto"];
export interface ScopeRow {
  localKey: string;
  resourceKey: string;
  scopeType: ResourceScope["scopeType"];
  selectedIds: string;
}

function selectedIds(input: string): number[] {
  const ids = input
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map(Number);
  if (
    !ids.length ||
    ids.some((id) => !Number.isSafeInteger(id) || id < 1) ||
    new Set(ids).size !== ids.length
  )
    throw new Error("指定范围 ID 无效或重复");
  return ids.sort((a, b) => a - b);
}

export function buildResourceScopes(
  rows: readonly ScopeRow[],
  catalog: readonly AuthorizationResource[],
  previous: readonly ResourceScope[],
): ResourceScope[] {
  const known = new Set(catalog.map((resource) => resource.resourceKey));
  const oldScopes = new Map(
    previous.map((scope) => [scope.resourceKey, scope]),
  );
  const keys = new Set<string>();
  return rows.map((row) => {
    const resourceKey = row.resourceKey.trim();
    if (!/^[a-z][a-z0-9._:-]{0,99}$/.test(resourceKey))
      throw new Error("请选择有效资源");
    if (keys.has(resourceKey)) throw new Error(`资源重复：${resourceKey}`);
    keys.add(resourceKey);
    const scope: ResourceScope = {
      resourceKey,
      scopeType: row.scopeType,
      ...(row.scopeType === "selected"
        ? { selectedIds: selectedIds(row.selectedIds) }
        : {}),
    };
    if (!known.has(resourceKey)) {
      const old = oldScopes.get(resourceKey);
      const left = [...(old?.selectedIds ?? [])].sort((a, b) => a - b);
      const right = scope.selectedIds ?? [];
      if (
        !old ||
        old.scopeType !== scope.scopeType ||
        left.length !== right.length ||
        left.some((id, index) => id !== right[index])
      )
        throw new Error("历史未知资源只能原样保留或移除");
    }
    return scope;
  });
}
