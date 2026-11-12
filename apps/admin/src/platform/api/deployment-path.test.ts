import { afterEach, expect, it, vi } from "vitest";
import { getPageHref } from "@/platform/config";
afterEach(() => vi.unstubAllEnvs());
it("keeps hard navigations inside the configured application prefix", () => {
  vi.stubEnv("NEXT_PUBLIC_ADMIN_BASE_PATH", "/snow-admin");
  expect(getPageHref("/admin/content/resorts")).toBe(
    "/snow-admin/admin/content/resorts",
  );
  expect(() => getPageHref("//other.example/path")).toThrow();
});
it("preserves root deployments and rejects malformed deployment prefixes", () => {
  vi.stubEnv("NEXT_PUBLIC_ADMIN_BASE_PATH", "");
  expect(getPageHref("/login")).toBe("/login");
  vi.stubEnv("NEXT_PUBLIC_ADMIN_BASE_PATH", "/snow-admin/");
  expect(() => getPageHref("/login")).toThrow();
});
