import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Page from "@/app/admin/system/permissions/page";
import { apiRequest } from "@/platform/api";
import { useSession } from "@/platform/auth/session-provider";
import type { CatalogUser } from "@/features/permissions/catalog-model";
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
vi.mock("@/platform/auth/session-provider", () => ({ useSession: vi.fn() }));
const user: CatalogUser = {
  userId: 7,
  account: "operator",
  nickname: "Operator",
  avatarUrl: null,
  merchant: null,
  roles: [{ roleKey: "custom_operator", roleName: "Operator" }],
  menuTree: [],
  permissionKeys: ["management:portal:enter", "system:permission:list"],
};
function render(
  current: CatalogUser | null,
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
  return renderToStaticMarkup(createElement(Page));
}
beforeEach(() => vi.clearAllMocks());
describe("catalog page session and actions", () => {
  it("shows session loading and login without fetching private data during SSR", () => {
    expect(render(null)).toContain("正在确认登录身份");
    expect(render(null, "anonymous")).toContain("请先登录");
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it.each(["management:portal:enter", "system:permission:list"])(
    "denies missing %s",
    (permission) => {
      expect(
        render({
          ...user,
          permissionKeys: user.permissionKeys.filter((k) => k !== permission),
        }),
      ).toContain("无权读取权限目录");
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
  it("accepts a custom read-only role and hides create/sync controls", () => {
    const html = render(user);
    expect(html).toContain("权限目录");
    expect(html).not.toContain("新建目录");
    expect(html).not.toContain("同步 API 权限");
  });
  it("shows granted creation actions for custom roles", () => {
    const html = render({
      ...user,
      permissionKeys: [
        ...user.permissionKeys,
        "system:permission:create",
        "system:permission:update",
      ],
    });
    expect(html).toContain("新建菜单");
    expect(html).not.toContain("同步 API 权限");
  });
  it("requires both protected identity indication and update grant for sync control", () => {
    const admin = {
      ...user,
      roles: [{ roleKey: "system_admin", roleName: "Admin" }],
    };
    expect(render(admin)).not.toContain("同步 API 权限");
    expect(
      render({
        ...admin,
        permissionKeys: [...admin.permissionKeys, "system:permission:update"],
      }),
    ).toContain("同步 API 权限");
  });
});
