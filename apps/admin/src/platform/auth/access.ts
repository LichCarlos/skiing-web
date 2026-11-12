import type { components } from "@common/api-contracts/openapi";
import { routes } from "@/config/routes";
import { dictionaryTypeFromPath } from "@/features/dictionaries/routes";
import { fieldEntityFromPath } from "@/features/custom-fields/routes";
import { roleIdFromSegment } from "@/features/roles/routes";
import { accountIdFromSegment } from "@/features/users/routes";
import { articleIdFromSegment } from "@/features/articles/article-model";
import { isAssetId } from "@/features/assets/asset-library-model";
import { moderationId } from "@/features/community/moderation-model";
import { knowledgeId } from "@/features/project-knowledge/knowledge-model";
import { resortId } from "@/features/merchant-resorts/resort-model";
import {
  ragSourceId,
  conversationAuditId,
} from "@/features/ai-operations/routes";

type CurrentUser = components["schemas"]["CurrentUserVO"];

export const MANAGEMENT_PORTAL_ACCESS_PERMISSION = "management:portal:enter";
const MANAGEMENT_ROUTE_GRANTS: Readonly<Record<string, readonly string[]>> = {
  [routes.permissions]: ["system:permission:list"],
  [routes.roles]: ["system:role:list"],
  [routes.users]: ["system:user:list"],
  [routes.dictionaries]: ["system:dict:list"],
  [routes.fields]: ["system:field:list"],
  [routes.merchantResorts]: ["resort:merchant:list"],
  [routes.merchantDashboard]: ["merchant:dashboard:read"],
  [routes.newMerchantResort]: [
    "resort:merchant:list",
    "resort:merchant:create",
  ],
  [routes.adminResorts]: ["content:resort:list-all"],
  [routes.newAdminResort]: [
    "content:resort:list-all",
    "content:resort:create-all",
  ],
  [routes.adminAssets]: ["content:asset:list"],
  [routes.articles]: ["content:article:manage"],
  [routes.newArticle]: ["content:article:manage"],
  [routes.dynamics]: ["content:dynamic:moderate"],
  [routes.merchantRevenue]: ["revenue:merchant:list"],
  [routes.adminRevenue]: ["revenue:system:upsert"],
};

export function hasManagementPortalAccess(
  user: Pick<CurrentUser, "permissionKeys"> | null | undefined,
): boolean {
  return (
    user?.permissionKeys.includes(MANAGEMENT_PORTAL_ACCESS_PERMISSION) ?? false
  );
}

export function canReadPermissionCatalog(
  user: Pick<CurrentUser, "permissionKeys"> | null | undefined,
): boolean {
  if (!user) return false;
  return user.permissionKeys.includes("system:permission:list");
}

export function canManageRoles(
  user: Pick<CurrentUser, "permissionKeys"> | null | undefined,
): boolean {
  return user?.permissionKeys.includes("system:role:list") ?? false;
}

export function canConfigureRoleAuthorization(
  user: Partial<Pick<CurrentUser, "roles">> | null | undefined,
): boolean {
  return user?.roles?.some((role) => role.roleKey === "system_admin") ?? false;
}

export function canAccessManagementRoute(
  user:
    | (Pick<CurrentUser, "permissionKeys"> &
        Partial<Pick<CurrentUser, "roles">>)
    | null
    | undefined,
  routePath: string,
): boolean {
  if (!user || !hasManagementPortalAccess(user)) return false;
  if (routePath === routes.admin) return true;
  const has = (...grants: string[]) =>
    grants.every((grant) => user.permissionKeys.includes(grant));
  const isSystemAdmin = canConfigureRoleAuthorization(user);
  if (
    routePath === routes.ragSources ||
    (routePath.startsWith(`${routes.ragSources}/`) &&
      ragSourceId(routePath.slice(routes.ragSources.length + 1)) !== null)
  )
    return isSystemAdmin && has("ai:knowledge:list");
  if (
    routePath === routes.aiConversationAudits ||
    (routePath.startsWith(`${routes.aiConversationAudits}/`) &&
      conversationAuditId(
        routePath.slice(routes.aiConversationAudits.length + 1),
      ))
  )
    return has("system:ai-conversation:list");
  if (dictionaryTypeFromPath(routePath) !== null)
    return has("system:dict:list");
  if (fieldEntityFromPath(routePath) !== null) return has("system:field:list");
  if (routePath === routes.systemConfig)
    return isSystemAdmin && has("system:config:list");
  if (routePath === routes.events) {
    return isSystemAdmin && has("system:event:list");
  }
  if (routePath === routes.operationLogs) {
    return isSystemAdmin && has("system:operation-log:list");
  }
  if (routePath === routes.adminRevenue) {
    return (
      user.permissionKeys.includes("revenue:system:upsert") &&
      user.roles?.some((role) => role.roleKey === "system_admin") === true
    );
  }

  if (routePath.startsWith(`${routes.roles}/`)) {
    const tail = routePath.slice(routes.roles.length + 1);
    const authorization = tail.endsWith("/permissions");
    const id = authorization ? tail.slice(0, -"/permissions".length) : tail;
    if (roleIdFromSegment(id) === null) return false;
    return authorization
      ? has("system:role:list", "system:permission:assign") && isSystemAdmin
      : has("system:role:list");
  }

  const requiredGrants = MANAGEMENT_ROUTE_GRANTS[routePath];
  if (requiredGrants) {
    return requiredGrants.every((permission) =>
      user.permissionKeys.includes(permission),
    );
  }
  if (routePath === routes.projectKnowledge) {
    return isSystemAdmin && has("content:project-knowledge:list");
  }
  if (routePath === routes.newProjectKnowledge) {
    return isSystemAdmin && has("content:project-knowledge:create");
  }
  if (routePath.startsWith(`${routes.projectKnowledge}/`)) {
    const tail = routePath.slice(routes.projectKnowledge.length + 1);
    return (
      tail.endsWith("/edit") &&
      knowledgeId(tail.slice(0, -"/edit".length)) !== null &&
      isSystemAdmin &&
      has("content:project-knowledge:list", "content:project-knowledge:update")
    );
  }
  if (routePath.startsWith(`${routes.adminAssets}/`))
    return (
      isAssetId(routePath.slice(routes.adminAssets.length + 1)) &&
      has("content:asset:list")
    );
  if (routePath.startsWith(`${routes.users}/`))
    return (
      accountIdFromSegment(routePath.slice(routes.users.length + 1)) !== null &&
      has("system:user:list")
    );
  if (routePath.startsWith(`${routes.merchantResorts}/`)) {
    const tail = routePath.slice(routes.merchantResorts.length + 1);
    return (
      tail.endsWith("/edit") &&
      resortId(tail.slice(0, -"/edit".length)) !== null &&
      has("resort:merchant:list", "resort:merchant:update")
    );
  }
  if (routePath.startsWith(`${routes.adminResorts}/`)) {
    const tail = routePath.slice(routes.adminResorts.length + 1);
    return (
      tail.endsWith("/edit") &&
      resortId(tail.slice(0, -"/edit".length)) !== null &&
      has("content:resort:list-all", "content:resort:update-all")
    );
  }
  if (routePath.startsWith(`${routes.articles}/`)) {
    const tail = routePath.slice(routes.articles.length + 1);
    return (
      tail.endsWith("/edit") &&
      articleIdFromSegment(tail.slice(0, -"/edit".length)) !== null &&
      has("content:article:manage")
    );
  }
  if (routePath.startsWith(`${routes.dynamics}/`)) {
    if (moderationId(routePath.slice(routes.dynamics.length + 1)) === null)
      return false;
    return has("content:dynamic:moderate");
  }
  return false;
}

/** Navigation, dashboard and page guard share business prerequisites as well as grants. */
export function canAccessManagementPage(
  user: CurrentUser | null | undefined,
  routePath: string,
): boolean {
  if (!canAccessManagementRoute(user, routePath)) return false;
  if (
    routePath === routes.merchantDashboard ||
    routePath.startsWith(`${routes.merchantDashboard}/`)
  ) {
    const merchantId = user?.merchant?.merchantId;
    return (
      typeof merchantId === "number" &&
      Number.isSafeInteger(merchantId) &&
      merchantId > 0
    );
  }
  return true;
}

function isItemRoute(path: string, base: string, suffix = ""): boolean {
  if (!path.startsWith(`${base}/`)) return false;
  const item = path.slice(base.length + 1);
  if (suffix && !item.endsWith(suffix)) return false;
  const id = suffix ? item.slice(0, -suffix.length) : item;
  return /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id));
}
