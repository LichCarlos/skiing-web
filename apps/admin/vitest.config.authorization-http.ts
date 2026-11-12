import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  resolve: { alias: { "@": resolve(root, "src") } },
  test: {
    environment: "node",
    include: ["apps/admin/test/authorization.http-spec.ts"],
    fileParallelism: false,
    hookTimeout: 60000,
    testTimeout: 30000,
  },
});
