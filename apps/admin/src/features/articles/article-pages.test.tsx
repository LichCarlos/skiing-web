import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Page from "@/app/admin/content/articles/page";
import EditPage from "@/app/admin/content/articles/[id]/edit/page";
import NewPage from "@/app/admin/content/articles/new/page";
import { ArticleSession } from "@/features/articles/article-session";
import { canAccessManagementRoute } from "@/platform/auth/access";
import { useSession } from "@/platform/auth/session-provider";
import { apiRequest } from "@/platform/api";
import { operator } from "@/features/articles/article-fixtures.test-helper";
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
vi.mock("@/platform/auth/session-provider", () => ({ useSession: vi.fn() }));
function setSession(
  current: typeof operator | null,
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
  setSession(operator);
});
describe("article page routes and SSR boundaries", () => {
  it.each(["loading", "anonymous"] as const)(
    "keeps all private article workspaces closed for %s",
    (status) => {
      setSession(null, status);
      for (const Component of [Page, NewPage]) {
        const html = renderToStaticMarkup(createElement(Component));
        expect(html).toContain(
          status === "loading" ? "正在确认登录身份" : "请先登录",
        );
        expect(html).not.toContain("文章封面");
      }
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
  it.each(["management:portal:enter", "content:article:manage"])(
    "denies UI reads and writes without %s",
    (grant) => {
      setSession({
        ...operator,
        permissionKeys: operator.permissionKeys.filter((key) => key !== grant),
      });
      expect(renderToStaticMarkup(createElement(Page))).toContain(
        "无权管理文章",
      );
      expect(renderToStaticMarkup(createElement(NewPage))).toContain(
        "无权管理文章",
      );
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
  it("allows custom article editors and disables create until the initial query resolves", () => {
    const html = renderToStaticMarkup(createElement(Page));
    expect(html).toContain("知识文章");
    expect(html).toContain("新建文章");
    expect(html).toMatch(/<button[^>]*disabled=""/);
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it("isolates identity changes and target changes using distinct workspace keys", () => {
    const props = {
      target: "7",
      children: () => createElement("span", null, "private"),
    };
    const first = ArticleSession(props);
    setSession({ ...operator, userId: 2 });
    const second = ArticleSession(props);
    const third = ArticleSession({ ...props, target: "8" });
    expect(first.key).not.toBe(second.key);
    expect(second.key).not.toBe(third.key);
  });
  it.each(["1", "2147483647"])(
    "awaits and keys valid article route %s",
    async (id) => {
      const result = await EditPage({ params: Promise.resolve({ id }) });
      expect(result.props.articleId).toBe(Number(id));
      expect(String(result.key)).toBe(id);
      expect(
        canAccessManagementRoute(
          operator,
          `/admin/content/articles/${id}/edit`,
        ),
      ).toBe(true);
    },
  );
  it.each([
    "0",
    "01",
    "-1",
    "1.5",
    "1e2",
    "+7",
    " 7",
    "2147483648",
    "x",
    "7/edit",
  ])("rejects malformed article route %s", async (id) => {
    await expect(
      EditPage({ params: Promise.resolve({ id }) }),
    ).rejects.toThrow();
    expect(
      canAccessManagementRoute(operator, `/admin/content/articles/${id}/edit`),
    ).toBe(false);
  });
});
