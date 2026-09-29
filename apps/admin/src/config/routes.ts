import type { Route } from "next";
import { baseRoutes } from "@common/config/routes";
import { foundationRoutes } from "@/features/foundation/routes";
/** 当前应用的唯一页面路径入口；不从另一个应用导入路径。 */
export const routes = {
  ...baseRoutes,
  ...foundationRoutes,
} as const satisfies Record<string, Route>;
