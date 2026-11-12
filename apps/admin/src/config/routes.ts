import type { Route } from "next";
import { baseRoutes } from "@common/config/routes";
import { foundationRoutes } from "@/features/foundation/routes";
import { userRoutes } from "@/features/users/routes";
import { operationLogRoutes } from "@/features/operation-logs/routes";
import { eventRoutes } from "@/features/events/routes";
import { aiOperationRoutes } from "@/features/ai-operations/routes";
export {
  ragSourceRoute,
  conversationAuditRoute,
} from "@/features/ai-operations/routes";
import { systemConfigRoutes } from "@/features/system-config/routes";
import { dictionaryRoutes } from "@/features/dictionaries/routes";
import { fieldRoutes } from "@/features/custom-fields/routes";
import { assetRoutes } from "@/features/assets/routes";
import { merchantResortRoutes } from "@/features/merchant-resorts/routes";
export { merchantResortEditRoute } from "@/features/merchant-resorts/routes";
export { adminAssetRoute } from "@/features/assets/routes";
import { roleRoutes } from "@/features/roles/routes";
export {
  managedRoleDetailRoute,
  roleAuthorizationRoute,
} from "@/features/roles/routes";
export { fieldEntityRoute } from "@/features/custom-fields/routes";
export { dictionaryDetailRoute } from "@/features/dictionaries/routes";
export { managedUserDetailRoute } from "@/features/users/routes";
/** 当前应用的唯一页面路径入口；不从另一个应用导入路径。 */
export const routes = {
  ...baseRoutes,
  ...foundationRoutes,
  ...userRoutes,
  ...operationLogRoutes,
  ...eventRoutes,
  ...aiOperationRoutes,
  ...systemConfigRoutes,
  ...dictionaryRoutes,
  ...fieldRoutes,
  ...roleRoutes,
  ...assetRoutes,
  ...merchantResortRoutes,
  admin: "/admin" as const,
  login: "/login" as const,
  permissions: "/admin/system/permissions" as const,
  merchantDashboard: "/admin/merchant" as const,
  merchantRevenue: "/admin/merchant/revenue" as const,
  adminRevenue: "/admin/system/revenue" as const,
  adminResorts: "/admin/content/resorts" as const,
  newAdminResort: "/admin/content/resorts/new" as const,
  articles: "/admin/content/articles" as const,
  newArticle: "/admin/content/articles/new" as const,
  projectKnowledge: "/admin/content/project-knowledge" as const,
  newProjectKnowledge: "/admin/content/project-knowledge/new" as const,
  dynamics: "/admin/content/dynamics" as const,
} as const satisfies Record<string, Route>;

export const adminResortEditRoute = (resortId: number) =>
  `/admin/content/resorts/${resortId}/edit` as Route;

export const adminArticleEditRoute = (articleId: number) =>
  `/admin/content/articles/${articleId}/edit` as Route;

export const projectKnowledgeEditRoute = (id: number) =>
  `/admin/content/project-knowledge/${id}/edit` as Route;

export const adminDynamicRoute = (id: number) =>
  `/admin/content/dynamics/${id}` as Route;
