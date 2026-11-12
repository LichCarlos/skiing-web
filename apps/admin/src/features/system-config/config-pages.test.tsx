import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { ConfigList } from "@/features/system-config/config-list";
import { ConfigSession } from "@/features/system-config/config-session";
import { useSession } from "@/platform/auth/session-provider";
import { apiRequest } from "@/platform/api";
import { operator } from "@/features/system-config/config-fixtures.test-helper";
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
describe("system configuration page identity boundaries", () => {
  it.each(["loading", "anonymous"] as const)(
    "does not read private values for %s",
    (status) => {
      session(null, status);
      expect(renderToStaticMarkup(createElement(ConfigList))).toContain(
        status === "loading" ? "正在确认登录身份" : "请先登录",
      );
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
  it.each(["management:portal:enter", "system:config:list"])(
    "closes the page without %s",
    (grant) => {
      session({
        ...operator,
        permissionKeys: operator.permissionKeys.filter((key) => key !== grant),
      });
      expect(renderToStaticMarkup(createElement(ConfigList))).toContain(
        "没有系统配置",
      );
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
  it("denies a custom role even with matching grants", () => {
    session({
      ...operator,
      roles: [{ roleKey: "custom", roleName: "自定义" }],
    });
    expect(renderToStaticMarkup(createElement(ConfigList))).toContain(
      "管理员身份",
    );
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it("allows readonly admins without starting private requests in SSR", () => {
    session({
      ...operator,
      permissionKeys: operator.permissionKeys.filter(
        (key) => key !== "system:config:update",
      ),
    });
    expect(renderToStaticMarkup(createElement(ConfigList))).toContain(
      "系统配置",
    );
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it("rekeys private state for same-account permission/role changes", () => {
    const props = {
      target: "catalog",
      children: () => createElement("p", null, "private"),
    };
    const first = ConfigSession(props);
    session({
      ...operator,
      permissionKeys: operator.permissionKeys.filter(
        (key) => key !== "system:config:update",
      ),
    });
    expect(ConfigSession(props).key).not.toBe(first.key);
    session({
      ...operator,
      roles: [...operator.roles, { roleKey: "reader", roleName: "只读" }],
    });
    expect(ConfigSession(props).key).not.toBe(first.key);
  });
});
