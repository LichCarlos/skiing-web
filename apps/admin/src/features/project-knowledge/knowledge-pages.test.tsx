import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Page from "@/app/admin/content/project-knowledge/page";
import NewPage from "@/app/admin/content/project-knowledge/new/page";
import EditPage from "@/app/admin/content/project-knowledge/[id]/edit/page";
import { KnowledgeSession } from "@/features/project-knowledge/knowledge-session";
import { canAccessManagementRoute } from "@/platform/auth/access";
import { useSession } from "@/platform/auth/session-provider";
import { apiRequest } from "@/platform/api";
import { operator } from "@/features/project-knowledge/knowledge-fixtures.test-helper";
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
describe("project knowledge routes and SSR permissions", () => {
  it.each(["loading", "anonymous"] as const)(
    "keeps private pages closed while %s",
    (status) => {
      session(null, status);
      for (const Component of [Page, NewPage])
        expect(renderToStaticMarkup(createElement(Component))).toContain(
          status === "loading" ? "正在确认登录身份" : "请先登录",
        );
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
  it("denies a custom role with all copied grants", () => {
    session({
      ...operator,
      roles: [{ roleKey: "custom", roleName: "管理员" }],
    });
    expect(renderToStaticMarkup(createElement(Page))).toContain(
      "无权管理项目知识",
    );
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it("honors read-only permissions without create controls", () => {
    session({
      ...operator,
      permissionKeys: [
        "management:portal:enter",
        "content:project-knowledge:list",
      ],
    });
    const html = renderToStaticMarkup(createElement(Page));
    expect(html).toContain("项目知识");
    expect(html).not.toContain("新建项目知识");
  });
  it("permits a create-only operator without making private reads during SSR", () => {
    session({
      ...operator,
      permissionKeys: [
        "management:portal:enter",
        "content:project-knowledge:create",
      ],
    });
    expect(renderToStaticMarkup(createElement(NewPage))).not.toContain(
      "无权管理项目知识",
    );
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it("requires both list and update to open the edit workspace", () => {
    session({
      ...operator,
      permissionKeys: [
        "management:portal:enter",
        "content:project-knowledge:update",
      ],
    });
    const element = createElement(KnowledgeSession, {
      target: "7",
      action: "update",
      children: () => createElement("p", null, "private"),
    });
    expect(renderToStaticMarkup(element)).toContain("无权管理项目知识");
  });
  it("keys state by actor, authorization and target", () => {
    const props = {
      target: "7",
      children: () => createElement("p", null, "private"),
    };
    const before = KnowledgeSession(props);
    session({ ...operator, userId: 2 });
    expect(KnowledgeSession(props).key).not.toBe(before.key);
    expect(KnowledgeSession({ ...props, target: "8" }).key).not.toBe(
      KnowledgeSession(props).key,
    );
  });
  it.each(["1", "2147483647"])("accepts valid route %s", async (id) => {
    const element = await EditPage({ params: Promise.resolve({ id }) });
    expect(element.props.id).toBe(Number(id));
    expect(String(element.key)).toBe(id);
    expect(
      canAccessManagementRoute(
        operator,
        `/admin/content/project-knowledge/${id}/edit`,
      ),
    ).toBe(true);
  });
  it.each(["0", "01", "-1", "1.5", "1e2", "+7", " 7", "2147483648", "x"])(
    "rejects invalid route %s",
    async (id) => {
      await expect(
        EditPage({ params: Promise.resolve({ id }) }),
      ).rejects.toThrow();
      expect(
        canAccessManagementRoute(
          operator,
          `/admin/content/project-knowledge/${id}/edit`,
        ),
      ).toBe(false);
    },
  );
});
