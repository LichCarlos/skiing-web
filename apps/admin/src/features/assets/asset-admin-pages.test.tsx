import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, it, expect, vi } from "vitest";
import Page from "@/app/admin/content/assets/page";
import DetailPage from "@/app/admin/content/assets/[assetId]/page";
import { AssetAdminSession } from "@/features/assets/asset-admin-session";
import { AssetAdminDetail } from "@/features/assets/asset-admin-detail";
import { canAccessManagementRoute } from "@/platform/auth/access";
import { useSession } from "@/platform/auth/session-provider";
import { apiRequest } from "@/platform/api";
import { operator } from "@/features/assets/asset-admin-fixtures.test-helper";
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
vi.mock("@/platform/auth/session-provider", () => ({ useSession: vi.fn() }));
function session(
  user: typeof operator | null,
  status: "loading" | "anonymous" = "loading",
) {
  vi.mocked(useSession).mockReturnValue({
    session: user
      ? { status: "authenticated", currentUser: user, errorMessage: null }
      : { status, currentUser: null, errorMessage: null },
    signIn: vi.fn(),
    signOut: vi.fn(),
    retryRestore: vi.fn(),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  session(operator);
});
describe("asset administration routes and SSR", () => {
  it.each(["loading", "anonymous"] as const)(
    "keeps private pages closed for %s",
    (status) => {
      session(null, status);
      for (const element of [
        createElement(Page),
        createElement(AssetAdminDetail, { assetId: "42" }),
      ])
        expect(renderToStaticMarkup(element)).toContain(
          status === "loading" ? "正在确认登录身份" : "请先登录",
        );
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
  it.each(["management:portal:enter", "content:asset:list"])(
    "denies missing %s",
    (permission) => {
      session({
        ...operator,
        permissionKeys: operator.permissionKeys.filter(
          (key) => key !== permission,
        ),
      });
      expect(renderToStaticMarkup(createElement(Page))).toContain(
        "没有媒体资源读取权限",
      );
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
  it("accepts a custom read-only role without making private SSR requests", () => {
    session({
      ...operator,
      permissionKeys: operator.permissionKeys.filter(
        (key) => key !== "content:asset:delete",
      ),
    });
    expect(renderToStaticMarkup(createElement(Page))).toContain("媒体资源");
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it("keys private state by actor and target", () => {
    const props = {
        target: "42",
        children: () => createElement("p", null, "private"),
      },
      first = AssetAdminSession(props);
    session({ ...operator, userId: 2 });
    expect(AssetAdminSession(props).key).not.toBe(first.key);
    expect(AssetAdminSession({ ...props, target: "43" }).key).not.toBe(
      first.key,
    );
  });
  it.each(["1", "9223372036854775807"])(
    "accepts bigint route %s without Number coercion",
    async (assetId) => {
      const element = await DetailPage({
        params: Promise.resolve({ assetId }),
      });
      expect(element.props.assetId).toBe(assetId);
      expect(element.key).toBe(assetId);
      expect(
        canAccessManagementRoute(operator, `/admin/content/assets/${assetId}`),
      ).toBe(true);
    },
  );
  it.each([
    "0",
    "01",
    "-1",
    "1e2",
    "1.5",
    " 42",
    "9223372036854775808",
    "x",
    "42/extra",
  ])("rejects invalid route %s", async (assetId) => {
    await expect(
      DetailPage({ params: Promise.resolve({ assetId }) }),
    ).rejects.toThrow();
    expect(
      canAccessManagementRoute(operator, `/admin/content/assets/${assetId}`),
    ).toBe(false);
  });
});
