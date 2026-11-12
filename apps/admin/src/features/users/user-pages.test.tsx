import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Page from "@/app/admin/system/users/page";
import DetailPage from "@/app/admin/system/users/[id]/page";
import { AccountWriteRecovery } from "@/features/users/user-session";
import {
  accountIdFromSegment,
  managedUserDetailRoute,
} from "@/features/users/routes";
import { canAccessManagementRoute } from "@/platform/auth/access";
import { useSession } from "@/platform/auth/session-provider";
import { apiRequest } from "@/platform/api";
import { operator } from "@/features/users/user-fixtures.test-helper";
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
vi.mock("@/platform/auth/session-provider", () => ({ useSession: vi.fn() }));
const session = (
  current: typeof operator | null,
  status: "loading" | "anonymous" = "loading",
) =>
  vi.mocked(useSession).mockReturnValue({
    session: current
      ? { status: "authenticated", currentUser: current, errorMessage: null }
      : { status, currentUser: null, errorMessage: null },
    signIn: vi.fn(),
    signOut: vi.fn(),
    retryRestore: vi.fn(),
  });
beforeEach(() => {
  vi.clearAllMocks();
  session(operator);
});
describe("account page boundaries", () => {
  it.each(["loading", "anonymous"] as const)(
    "renders %s without private SSR requests",
    (status) => {
      session(null, status);
      const html = renderToStaticMarkup(createElement(Page));
      expect(html).toContain(
        status === "loading" ? "正在确认登录身份" : "请先登录",
      );
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
  it.each(["management:portal:enter", "system:user:list"])(
    "fails closed without %s",
    (key) => {
      session({
        ...operator,
        permissionKeys: operator.permissionKeys.filter((k) => k !== key),
      });
      expect(renderToStaticMarkup(createElement(Page))).toContain(
        "无权读取账号管理",
      );
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
  it("allows a custom read-only role with no create controls", () => {
    session({
      ...operator,
      permissionKeys: ["management:portal:enter", "system:user:list"],
    });
    const html = renderToStaticMarkup(createElement(Page));
    expect(html).toContain("账号管理");
    expect(html).not.toContain("新建账号");
  });
  it("shows granted create action disabled while initial data is loading", () => {
    const html = renderToStaticMarkup(createElement(Page));
    expect(html).toContain("新建账号");
    expect(html).toMatch(/<button[^>]*disabled=""/);
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it.each(["1", "2147483647"])("awaits valid account params %s", async (id) => {
    const element = await DetailPage({ params: Promise.resolve({ id }) });
    expect(element.props.userId).toBe(Number(id));
    expect(String(element.key)).toBe(id);
    expect(
      canAccessManagementRoute(operator, `/admin/system/users/${id}`),
    ).toBe(true);
  });
  it.each(["0", "-1", "01", "1.1", "1e2", " 7", "2147483648", "abc", "7/edit"])(
    "rejects malformed account route %s",
    async (id) => {
      expect(accountIdFromSegment(id)).toBeNull();
      await expect(
        DetailPage({ params: Promise.resolve({ id }) }),
      ).rejects.toThrow();
      expect(
        canAccessManagementRoute(operator, `/admin/system/users/${id}`),
      ).toBe(false);
    },
  );
  it("validates typed account links", () => {
    expect(managedUserDetailRoute(7)).toBe("/admin/system/users/7");
    expect(() => managedUserDetailRoute(0)).toThrow();
    expect(() => managedUserDetailRoute(2147483648)).toThrow();
  });
  it("requires successful target review before enabling explicit recovery acknowledgement", () => {
    const render = (pending: boolean, saving: boolean) =>
      renderToStaticMarkup(
        createElement(AccountWriteRecovery, {
          operator,
          pending,
          saving,
          reload: async () => true,
          acknowledge: vi.fn(),
        }),
      );
    expect(render(false, false)).toBe("");
    expect(render(true, true)).toBe("");
    const html = render(true, false);
    expect(html).toContain("读取目标并刷新");
    expect(html).toContain("我已核对");
    expect(html).toMatch(/<button[^>]*disabled=""/);
  });
});
