import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, it, expect, vi } from "vitest";
import Page from "@/app/admin/merchant/resorts/page";
import EditPage from "@/app/admin/merchant/resorts/[id]/edit/page";
import { ResortEditor } from "@/features/merchant-resorts/resort-editor";
import { ResortSession } from "@/features/merchant-resorts/resort-session";
import { useSession } from "@/platform/auth/session-provider";
import { canAccessManagementRoute } from "@/platform/auth/access";
import { apiRequest } from "@/platform/api";
import { merchantResortEditRoute } from "@/config/routes";
import { operator } from "@/features/merchant-resorts/resort-fixtures.test-helper";
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
describe("merchant resort pages and routes", () => {
  it.each(["loading", "anonymous"] as const)(
    "closes private content for %s",
    (status) => {
      session(null, status);
      for (const page of [
        createElement(Page),
        createElement(ResortEditor, { resortId: 42 }),
      ])
        expect(renderToStaticMarkup(page)).toContain(
          status === "loading" ? "正在确认登录身份" : "请先登录",
        );
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
  it("allows custom roles with a merchant association and closes pages after unbinding", () => {
    expect(renderToStaticMarkup(createElement(Page))).toContain("我的雪场");
    session({ ...operator, merchant: null });
    expect(renderToStaticMarkup(createElement(Page))).toContain("有效商家关联");
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it.each([
    "management:portal:enter",
    "resort:merchant:list",
    "resort:merchant:update",
  ])("closes edit without %s", (grant) => {
    session({
      ...operator,
      permissionKeys: operator.permissionKeys.filter((key) => key !== grant),
    });
    expect(
      renderToStaticMarkup(createElement(ResortEditor, { resortId: 42 })),
    ).toContain("没有雪场");
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it("does not require update for new drafts or grant create to list-only users", () => {
    session({
      ...operator,
      permissionKeys: operator.permissionKeys.filter(
        (key) => key !== "resort:merchant:update",
      ),
    });
    expect(renderToStaticMarkup(createElement(ResortEditor))).toContain(
      "新建雪场",
    );
    session({
      ...operator,
      permissionKeys: ["management:portal:enter", "resort:merchant:list"],
    });
    const html = renderToStaticMarkup(createElement(Page));
    expect(html).not.toContain("新建雪场");
    expect(html).not.toContain("停用");
  });
  it("keys private state by user, merchant association and target", () => {
    const props = {
      target: "42",
      children: () => createElement("p", null, "private"),
    };
    const first = ResortSession(props);
    session({ ...operator, merchant: { merchantId: 8 } });
    expect(ResortSession(props).key).not.toBe(first.key);
    expect(ResortSession({ ...props, target: "43" }).key).not.toBe(first.key);
  });
  it.each(["1", "2147483647"])("accepts int4 route %s", async (id) => {
    const element = await EditPage({ params: Promise.resolve({ id }) });
    expect(element.props.resortId).toBe(Number(id));
    expect(merchantResortEditRoute(Number(id))).toBe(
      `/admin/merchant/resorts/${id}/edit`,
    );
    expect(element.key).toBe(id);
    expect(
      canAccessManagementRoute(operator, `/admin/merchant/resorts/${id}/edit`),
    ).toBe(true);
  });
  it.each(["0", "01", "-1", "1e2", "1.5", "2147483648", "42/extra"])(
    "rejects invalid edit route %s",
    async (id) => {
      await expect(
        EditPage({ params: Promise.resolve({ id }) }),
      ).rejects.toThrow();
      expect(
        canAccessManagementRoute(
          operator,
          `/admin/merchant/resorts/${id}/edit`,
        ),
      ).toBe(false);
    },
  );
});
