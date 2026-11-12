import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { EventList } from "@/features/events/event-list";
import { EventSession } from "@/features/events/event-session";
import { useSession } from "@/platform/auth/session-provider";
import { apiRequest } from "@/platform/api";
import { operator, item } from "@/features/events/event-fixtures.test-helper";
import { eventRecoveryLedger } from "@/features/events/event-workflow";
import { eventMutation } from "@/features/events/event-model";
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
afterEach(() => vi.unstubAllGlobals());
describe("system event retry page identity boundaries", () => {
  it("keeps browser-only recovery out of the SSR snapshot before hydration", () => {
    vi.stubGlobal("window", {});
    const ledger = eventRecoveryLedger();
    ledger.begin(operator.userId, eventMutation(item))(false);
    const html = renderToStaticMarkup(createElement(EventList));
    expect(html).not.toContain("消息任务重试结果未确认");
    expect(html).not.toContain("我已核对");
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it.each(["loading", "anonymous"] as const)(
    "does not read private values for %s",
    (status) => {
      session(null, status);
      expect(renderToStaticMarkup(createElement(EventList))).toContain(
        status === "loading" ? "正在确认登录身份" : "请先登录",
      );
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
  it.each(["management:portal:enter", "system:event:list"])(
    "closes the page without %s",
    (grant) => {
      session({
        ...operator,
        permissionKeys: operator.permissionKeys.filter((key) => key !== grant),
      });
      expect(renderToStaticMarkup(createElement(EventList))).toContain(
        "没有消息任务",
      );
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
  it("denies a custom role even with matching grants", () => {
    session({
      ...operator,
      roles: [{ roleKey: "custom", roleName: "自定义" }],
    });
    expect(renderToStaticMarkup(createElement(EventList))).toContain(
      "管理员身份",
    );
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it("allows readonly admins without starting private requests in SSR", () => {
    session({
      ...operator,
      permissionKeys: operator.permissionKeys.filter(
        (key) => key !== "system:event:retry",
      ),
    });
    expect(renderToStaticMarkup(createElement(EventList))).toContain(
      "消息任务",
    );
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it("rekeys private state for same-account permission/role changes", () => {
    const props = {
      target: "catalog",
      children: () => createElement("p", null, "private"),
    };
    const first = EventSession(props);
    session({
      ...operator,
      permissionKeys: operator.permissionKeys.filter(
        (key) => key !== "system:event:retry",
      ),
    });
    expect(EventSession(props).key).not.toBe(first.key);
    session({
      ...operator,
      roles: [...operator.roles, { roleKey: "reader", roleName: "只读" }],
    });
    expect(EventSession(props).key).not.toBe(first.key);
  });
});
