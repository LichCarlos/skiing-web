import type { Route } from "next";
import type { EntityType } from "@/features/custom-fields/field-model";

export const fieldRoutes = { fields: "/admin/system/fields" as const };
export const fieldEntities = [
  { value: "ski_resort", label: "滑雪场" },
  { value: "article", label: "文章" },
  { value: "dynamic", label: "动态" },
  { value: "merchant_profile", label: "商家资料" },
] as const satisfies readonly { value: EntityType; label: string }[];

export function isFieldEntity(value: string): value is EntityType {
  return fieldEntities.some((entity) => entity.value === value);
}
export function fieldEntityRoute(entityType: EntityType): Route {
  if (!isFieldEntity(entityType)) throw new Error("字段实体类型无效");
  return `${fieldRoutes.fields}/${entityType}` as Route;
}
export function fieldEntityFromPath(path: string): EntityType | null {
  const prefix = `${fieldRoutes.fields}/`;
  if (!path.startsWith(prefix)) return null;
  try {
    const entityType = decodeURIComponent(path.slice(prefix.length));
    return isFieldEntity(entityType) ? entityType : null;
  } catch {
    return null;
  }
}
