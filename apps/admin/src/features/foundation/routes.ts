import type { Route } from "next";
/** 本域维护路径，src/config/routes.ts 聚合后供本端使用。 */
export const foundationRoutes = {
  foundation: "/foundation",
} as const satisfies Record<string, Route>;
