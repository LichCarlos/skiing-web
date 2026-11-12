import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, it, expect, vi } from "vitest";
import Page from "@/app/admin/content/dynamics/page";
import DetailPage from "@/app/admin/content/dynamics/[id]/page";
import { AdminDynamicDetail } from "@/features/community/admin-dynamic-detail";
import { ModerationSession } from "@/features/community/moderation-session";
import {
  DynamicControls,
  CommentControls,
} from "@/features/community/moderation-controls";
import { canAccessManagementRoute } from "@/platform/auth/access";
import { useSession } from "@/platform/auth/session-provider";
import { apiRequest } from "@/platform/api";
import {
  operator,
  dynamic,
  comment,
} from "@/features/community/moderation-fixtures.test-helper";
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
describe("moderation route and rendering boundaries", () => {
  it.each(["loading", "anonymous"] as const)(
    "keeps private data closed for %s",
    (status) => {
      session(null, status);
      for (const element of [
        createElement(Page),
        createElement(AdminDynamicDetail, { dynamicId: 7 }),
      ]) {
        expect(renderToStaticMarkup(element)).toContain(
          status === "loading" ? "正在确认登录身份" : "请先登录",
        );
      }
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
  it.each(["management:portal:enter", "content:dynamic:moderate"])(
    "denies missing %s",
    (grant) => {
      session({
        ...operator,
        permissionKeys: operator.permissionKeys.filter((key) => key !== grant),
      });
      expect(renderToStaticMarkup(createElement(Page))).toContain(
        "没有社区审核权限",
      );
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
  it("allows explicit grants without hardcoding an admin role", () => {
    expect(renderToStaticMarkup(createElement(Page))).toContain("社区审核");
    expect(apiRequest).not.toHaveBeenCalled();
    expect(canAccessManagementRoute(operator, "/admin/content/dynamics")).toBe(
      true,
    );
  });
  it("keys state by actor, grants and target", () => {
    const props = {
      target: "7",
      children: () => createElement("p", null, "private"),
    };
    const current = ModerationSession(props);
    session({ ...operator, userId: 2 });
    expect(ModerationSession(props).key).not.toBe(current.key);
    expect(ModerationSession({ ...props, target: "8" }).key).not.toBe(
      current.key,
    );
  });
  it.each(["1", "2147483647"])("accepts route %s", async (id) => {
    const element = await DetailPage({ params: Promise.resolve({ id }) });
    expect(element.props.dynamicId).toBe(Number(id));
    expect(String(element.key)).toBe(id);
    expect(
      canAccessManagementRoute(operator, `/admin/content/dynamics/${id}`),
    ).toBe(true);
  });
  it.each(["0", "01", "-1", "1.5", "1e2", "+7", " 7", "2147483648", "x"])(
    "rejects route %s",
    async (id) => {
      await expect(
        DetailPage({ params: Promise.resolve({ id }) }),
      ).rejects.toThrow();
      expect(
        canAccessManagementRoute(operator, `/admin/content/dynamics/${id}`),
      ).toBe(false);
    },
  );
  it("renders only valid dynamic actions and confirms each through selection", () => {
    const html = renderToStaticMarkup(
      createElement(DynamicControls, {
        item: dynamic,
        disabled: false,
        select: vi.fn(),
      }),
    );
    expect(html).toContain("通过并公开");
    expect(html).toContain("隐藏");
    expect(html).not.toContain("恢复公开");
  });
  it("renders hidden comment restore and delete", () => {
    const html = renderToStaticMarkup(
      createElement(CommentControls, {
        item: { ...comment, status: "hidden" },
        page: 2,
        disabled: true,
        select: vi.fn(),
      }),
    );
    expect(html).toContain("恢复可见");
    expect(html).toContain("软删除");
    expect(html).toContain("disabled");
  });
});
