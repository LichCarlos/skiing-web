import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const config: NextConfig = {
  output: "standalone",
  basePath: process.env.NEXT_PUBLIC_ADMIN_BASE_PATH ?? "",
  outputFileTracingRoot: root,
  typedRoutes: true,
  transpilePackages: [
    "@common/ui",
    "@common/theme",
    "@common/utils",
    "@common/config",
  ],
  turbopack: { root },
};
export default config;
