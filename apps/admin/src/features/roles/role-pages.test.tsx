import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Page from "@/app/admin/system/roles/page";
import DetailPage from "@/app/admin/system/roles/[id]/page";
import AuthorizationPage from "@/app/admin/system/roles/[id]/permissions/page";
import { RoleSession, RoleRecovery } from "@/features/roles/role-session";
import {
  roleIdFromSegment,
  managedRoleDetailRoute,
  roleAuthorizationRoute,
} from "@/features/roles/routes";
import { apiRequest } from "@/platform/api";
import { useSession } from "@/platform/auth/session-provider";
import type { RoleUser } from "@/features/roles/role-workflow";
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
vi.mock("@/platform/auth/session-provider", () => ({ useSession: vi.fn() }));
const user: RoleUser = {
  userId: 7,
  account: "operator",
  nickname: "运营",
  avatarUrl: null,
  merchant: null,
  roles: [{ roleKey: "custom_operator", roleName: "运营" }],
  permissionKeys: ["management:portal:enter", "system:role:list"],
  menuTree: [],
};
function session(
  current: RoleUser | null,
  status: "loading" | "anonymous" = "loading",
) {
  vi.mocked(useSession).mockReturnValue({
    session: current
      ? { status: "authenticated", currentUser: current, errorMessage: null }
      : { status, currentUser: null, errorMessage: null },
    signIn: vi.fn(),
    signOut: vi.fn(),
    retryRestore: vi.fn(),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  session(user);
});
describe("role page boundaries", () => {
  it("renders loading and anonymous states without private SSR requests", () => {
    session(null);
    expect(renderToStaticMarkup(createElement(Page))).toContain(
      "正在确认登录身份",
    );
    session(null, "anonymous");
    expect(renderToStaticMarkup(createElement(Page))).toContain("请先登录");
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it.each(["management:portal:enter", "system:role:list"])(
    "rejects missing %s",
    (key) => {
      session({
        ...user,
        permissionKeys: user.permissionKeys.filter((k) => k !== key),
      });
      expect(renderToStaticMarkup(createElement(Page))).toContain(
        "无权读取此角色页面",
      );
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
  it("allows a custom read-only role without creation controls", () => {
    const html = renderToStaticMarkup(createElement(Page));
    expect(html).toContain("角色管理");
    expect(html).not.toContain("新建角色");
  });
  it("shows granted creation while initial loading keeps actions disabled", () => {
    session({
      ...user,
      permissionKeys: [...user.permissionKeys, "system:role:create"],
    });
    const html = renderToStaticMarkup(createElement(Page));
    expect(html).toContain("新建角色");
    expect(html).toMatch(/<button[^>]*disabled=""/);
  });
  it("requires administrator and explicit assign grant for authorization view", () => {
    const render = () =>
      renderToStaticMarkup(
        createElement(RoleSession, {
          authorization: true,
          children: () => "authorization-ready",
        }),
      );
    session({
      ...user,
      permissionKeys: [...user.permissionKeys, "system:permission:assign"],
    });
    expect(render()).not.toContain("authorization-ready");
    session({
      ...user,
      roles: [{ roleKey: "system_admin", roleName: "Admin" }],
    });
    expect(render()).not.toContain("authorization-ready");
    session({
      ...user,
      roles: [{ roleKey: "system_admin", roleName: "Admin" }],
      permissionKeys: [...user.permissionKeys, "system:permission:assign"],
    });
    expect(render()).toContain("authorization-ready");
  });
  it.each(["1", "2147483647"])("awaits dynamic role params %s", async (id) => {
    const detail = await DetailPage({ params: Promise.resolve({ id }) });
    const authorization = await AuthorizationPage({
      params: Promise.resolve({ id }),
    });
    expect(detail.props.roleId).toBe(Number(id));
    expect(authorization.props.roleId).toBe(Number(id));
    expect(String(detail.key)).toBe(id);
  });
  it.each([
    "0",
    "-1",
    "01",
    "1.1",
    "1e2",
    " 7",
    "2147483648",
    "abc",
    "7/permissions",
  ])("rejects malformed URL segment %s", async (id) => {
    expect(roleIdFromSegment(id)).toBeNull();
    await expect(
      DetailPage({ params: Promise.resolve({ id }) }),
    ).rejects.toThrow();
    await expect(
      AuthorizationPage({ params: Promise.resolve({ id }) }),
    ).rejects.toThrow();
  });
  it("generates typed detail and authorization links and rejects out of bounds IDs", () => {
    expect(managedRoleDetailRoute(7)).toBe("/admin/system/roles/7");
    expect(roleAuthorizationRoute(7)).toBe("/admin/system/roles/7/permissions");
    expect(() => managedRoleDetailRoute(2147483648)).toThrow();
    expect(() => roleAuthorizationRoute(0)).toThrow();
  });
  it("shows explicit unknown-result recovery only when no write is running", () => {
    const render = (pending: boolean, saving: boolean) =>
      renderToStaticMarkup(
        createElement(RoleRecovery, {
          pending,
          saving,
          reload: async () => true,
          acknowledge: vi.fn(),
        }),
      );
    expect(render(false, false)).toBe("");
    expect(render(true, true)).toBe("");
    expect(render(true, false)).toContain("刷新核对");
    expect(render(true, false)).toMatch(/<button[^>]*disabled=""/);
  });
});
