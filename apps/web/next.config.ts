import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const config: NextConfig = {
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
