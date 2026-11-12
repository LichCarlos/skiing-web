import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPageHref } from "@/platform/config";
import { routes, adminResortEditRoute } from "@/config/routes";
import { GlobalResortActions } from "@/features/admin-resorts/global-resort-list";
import {
  operator,
  item,
} from "@/features/admin-resorts/global-resort-fixtures.test-helper";
import { RouteNotFound } from "@/features/route-state/route-state";

afterEach(() => vi.unstubAllEnvs());
describe("admin document navigation under a deployment prefix", () => {
  it.each(["", "/snow-admin", "/preview/admin"])(
    "builds native links under %s",
    (prefix) => {
      vi.stubEnv("NEXT_PUBLIC_ADMIN_BASE_PATH", prefix);
      for (const route of [
        routes.newAdminResort,
        routes.newArticle,
        routes.newProjectKnowledge,
        routes.adminResorts,
        routes.articles,
        routes.projectKnowledge,
        routes.merchantResorts,
        adminResortEditRoute(42),
      ]) {
        expect(getPageHref(route)).toBe(prefix + route);
      }
      const html = renderToStaticMarkup(
        createElement(GlobalResortActions, {
          item,
          operator,
          disabled: false,
          onCommand: vi.fn(),
        }),
      );
      expect(html).toContain(
        `href="${prefix}${adminResortEditRoute(item.resortId)}"`,
      );
      expect(renderToStaticMarkup(createElement(RouteNotFound))).toContain(
        `href="${prefix}${routes.admin}"`,
      );
    },
  );
  it.each([
    "https://example.test/",
    "//example.test/",
    "admin/content/resorts",
  ])("rejects non-application paths: %s", (path) => {
    expect(() => getPageHref(path)).toThrow("application-relative");
  });
});
