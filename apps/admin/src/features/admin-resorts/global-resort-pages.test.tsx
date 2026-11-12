import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, it, expect, vi } from "vitest";
import Page from "@/app/admin/content/resorts/page";
import EditPage from "@/app/admin/content/resorts/[id]/edit/page";
import { GlobalResortActions } from "@/features/admin-resorts/global-resort-list";
import { GlobalResortSession } from "@/features/admin-resorts/global-resort-session";
import { MerchantResortForm } from "@/features/merchant-resorts/merchant-resort-form";
import { useSession } from "@/platform/auth/session-provider";
import { apiRequest } from "@/platform/api";
import { canAccessManagementRoute } from "@/platform/auth/access";
import {
  operator,
  item,
} from "@/features/admin-resorts/global-resort-fixtures.test-helper";
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
vi.mock("@/platform/auth/session-provider", () => ({ useSession: vi.fn() }));
function session(
  status: "authenticated" | "loading" | "anonymous" = "authenticated",
  user = operator,
) {
  vi.mocked(useSession).mockReturnValue({
    session:
      status === "authenticated"
        ? { status, currentUser: user, errorMessage: null }
        : { status, currentUser: null, errorMessage: null },
    signIn: vi.fn(),
    signOut: vi.fn(),
    retryRestore: vi.fn(),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  session();
});
describe("global resort management pages", () => {
  it.each(["loading", "anonymous"] as const)(
    "closes private workspaces while %s",
    (status) => {
      session(status);
      for (const element of [
        createElement(Page),
        createElement(MerchantResortForm, { scope: "admin", resortId: 42 }),
      ]) {
        const html = renderToStaticMarkup(element);
        expect(html).toContain(
          status === "loading" ? "正在确认登录身份" : "会话暂时不可用",
        );
        expect(html).not.toContain("关联商家 ID");
      }
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
  it("renders the authorized administrator form and blocks save until all reads finish", () => {
    const html = renderToStaticMarkup(
      createElement(MerchantResortForm, { scope: "admin", resortId: 42 }),
    );
    expect(html).toContain("维护全局雪场");
    expect(html).toContain("关联商家 ID");
    expect(html).not.toContain("当前账号没有此雪场编辑权限");
    expect(html).toContain("disabled");
  });
  it("offers delete independently and only the valid lifecycle command", () => {
    const html = renderToStaticMarkup(
      createElement(GlobalResortActions, {
        item: { ...item, status: "published" },
        operator,
        disabled: false,
        onCommand: vi.fn(),
      }),
    );
    expect(html).toContain("删除");
    expect(html).toContain("下架");
    expect(html).not.toContain(">发布<");
    const readOnly = {
      ...operator,
      permissionKeys: ["management:portal:enter", "content:resort:list-all"],
    };
    const denied = renderToStaticMarkup(
      createElement(GlobalResortActions, {
        item,
        operator: readOnly,
        disabled: false,
        onCommand: vi.fn(),
      }),
    );
    expect(denied).not.toContain("删除");
    expect(denied).not.toContain("编辑");
  });
  it("keys state by target and current operator permissions", () => {
    const props = {
      target: "42",
      children: () => createElement("p", null, "private"),
    };
    const first = GlobalResortSession(props);
    expect(GlobalResortSession({ ...props, target: "43" }).key).not.toBe(
      first.key,
    );
    session("authenticated", {
      ...operator,
      permissionKeys: operator.permissionKeys.filter(
        (key) => key !== "content:resort:publish",
      ),
    });
    expect(GlobalResortSession(props).key).not.toBe(first.key);
  });
  it.each(["0", "01", "-1", "1.5", "1e2", "2147483648", "42/extra"])(
    "rejects noncanonical global edit target %s",
    async (id) => {
      await expect(
        EditPage({ params: Promise.resolve({ id }) }),
      ).rejects.toThrow();
      expect(
        canAccessManagementRoute(operator, `/admin/content/resorts/${id}/edit`),
      ).toBe(false);
    },
  );
  it.each(["1", "2147483647"])(
    "supports valid global edit target %s",
    async (id) => {
      const element = await EditPage({ params: Promise.resolve({ id }) });
      expect(element.props.resortId).toBe(Number(id));
      expect(element.key).toBe(id);
    },
  );
});
