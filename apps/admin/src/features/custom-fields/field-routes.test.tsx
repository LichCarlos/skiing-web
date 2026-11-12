import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Page from "@/app/admin/system/fields/[entityType]/page";
import {
  fieldEntities,
  fieldEntityRoute,
  fieldEntityFromPath,
  isFieldEntity,
} from "@/features/custom-fields/routes";
import type { EntityType, User } from "@/features/custom-fields/field-model";
import { canAccessManagementRoute } from "@/platform/auth/access";
import { useSession } from "@/platform/auth/session-provider";
import { apiRequest } from "@/platform/api";
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
vi.mock("@/platform/auth/session-provider", () => ({ useSession: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  },
}));
const user: User = {
  userId: 4,
  account: "operator",
  nickname: "Operator",
  avatarUrl: null,
  merchant: null,
  menuTree: [],
  roles: [{ roleKey: "custom", roleName: "Configurable" }],
  permissionKeys: ["management:portal:enter", "system:field:list"],
};
function session(currentUser: User | null = user) {
  vi.mocked(useSession).mockReturnValue({
    session: currentUser
      ? { status: "authenticated", currentUser, errorMessage: null }
      : { status: "loading", currentUser: null, errorMessage: null },
    signIn: vi.fn(),
    signOut: vi.fn(),
    retryRestore: vi.fn(),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  session();
});
describe("entity field detail routes", () => {
  it.each(fieldEntities)(
    "round-trips $value and renders the matching entity heading",
    async (entity) => {
      expect(isFieldEntity(entity.value)).toBe(true);
      const path = fieldEntityRoute(entity.value);
      expect(fieldEntityFromPath(path)).toBe(entity.value);
      expect(canAccessManagementRoute(user, path)).toBe(true);
      const html = renderToStaticMarkup(
        await Page({ params: Promise.resolve({ entityType: entity.value }) }),
      );
      expect(html).toContain(`${entity.label}字段配置`);
      expect(html).toContain('href="/admin/system/fields"');
      expect(html).toContain("返回字段管理");
      expect(html).toContain('aria-current="page"');
      expect(html).toContain("ant-spin");
      expect(html).not.toContain("新建字段");
      expect(html).not.toContain("新建分组");
      for (const other of fieldEntities.filter((e) => e.value !== entity.value))
        expect(html).toContain(`href="${fieldEntityRoute(other.value)}"`);
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
  it.each([
    "",
    "resort",
    "Article",
    "merchant",
    "123",
    "a/b",
    "../users",
    "article?all=true",
    "article#edit",
    "article%2Fextra",
  ])(
    "rejects unsupported server param %s before any query",
    async (entityType) => {
      expect(isFieldEntity(entityType)).toBe(false);
      expect(() => fieldEntityRoute(entityType as EntityType)).toThrow();
      await expect(
        Page({ params: Promise.resolve({ entityType }) }),
      ).rejects.toThrow("404");
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
  it.each([
    "/admin/system/fields/article/extra",
    "/admin/system/fields/Article",
    "/admin/system/fields/article%2Fextra",
    "/admin/system/fields/%252561rticle",
    "/admin/system/fields/bad%",
    "/admin/system/fields/%2e%2e",
  ])("rejects malformed management paths %s", (path) => {
    expect(fieldEntityFromPath(path)).toBeNull();
    expect(canAccessManagementRoute(user, path)).toBe(false);
  });
  it("decodes the pathname once without accepting double encoding", () => {
    expect(fieldEntityFromPath("/admin/system/fields/%61rticle")).toBe(
      "article",
    );
    expect(fieldEntityFromPath("/admin/system/fields/%2561rticle")).toBeNull();
    expect(fieldEntityFromPath("/admin/system/fields")).toBeNull();
  });
  it.each(["management:portal:enter", "system:field:list"])(
    "checks %s on direct entry and hides content without it",
    async (permission) => {
      const restricted = {
        ...user,
        permissionKeys: user.permissionKeys.filter((p) => p !== permission),
      };
      expect(
        canAccessManagementRoute(restricted, fieldEntityRoute("article")),
      ).toBe(false);
      session(restricted);
      const html = renderToStaticMarkup(
        await Page({ params: Promise.resolve({ entityType: "article" }) }),
      );
      expect(html).toContain("当前账号无权读取字段配置");
      expect(html).not.toContain("文章字段配置");
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
  it("waits for promised route params and exposes no content while restoring a session", async () => {
    let resolve!: (value: { entityType: string }) => void;
    const params = new Promise<{ entityType: string }>((done) => {
      resolve = done;
    });
    const pending = Page({ params });
    resolve({ entityType: "article" });
    session(null);
    expect(renderToStaticMarkup(await pending)).toBe("");
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
