import { catalogRoutes } from "@/features/catalog/routes";
import { memberRoutes } from "@/features/member/routes";
import { aiRoutes } from "@/features/ai/routes";
import { authRoutes } from "@/features/auth/routes";
import type { Route } from "next";
import { baseRoutes } from "@common/config/routes";
import { foundationRoutes } from "@/features/foundation/routes";
import { siteConfigRoutes } from "@/features/site-config/routes";
/** 当前应用的唯一页面路径入口；不从另一个应用导入路径。 */
export const routes = {
  ...baseRoutes,
  ...memberRoutes,
  ...aiRoutes,
  ...authRoutes,
  ...catalogRoutes,
  ...foundationRoutes,
  ...siteConfigRoutes,
  resorts: "/resorts" as Route,
  resortDetail: (resortId: number) => `/resorts/${resortId}` as Route,
  dynamics: "/dynamics" as Route,
  dynamicDetail: (dynamicId: number) => `/dynamics/${dynamicId}` as Route,
  knowledge: "/knowledge" as Route,
  articleDetail: (articleId: number) => `/knowledge/${articleId}` as Route,
} as const;
