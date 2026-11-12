import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { components } from "@common/api-contracts/openapi";
import DictionaryDetailPage from "@/app/admin/system/dictionaries/[dictType]/page";
import {
  dictionaryDetailRoute,
  dictionaryTypeFromPath,
  isDictionaryType,
} from "@/features/dictionaries/routes";
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

const user: components["schemas"]["CurrentUserVO"] = {
  userId: 9,
  account: "operator",
  nickname: "运营",
  avatarUrl: null,
  menuTree: [],
  merchant: null,
  roles: [{ roleKey: "custom", roleName: "自定义身份" }],
  permissionKeys: ["management:portal:enter", "system:dict:list"],
};
function account(currentUser: typeof user | null = user) {
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
  account();
});

describe("dictionary detail URLs and management entry", () => {
  it.each(["area.level", "resort:fit-tag", "project_doc", "a".repeat(100)])(
    "round-trips valid type %s through the generated URL",
    (key) => {
      expect(isDictionaryType(key)).toBe(true);
      const path = dictionaryDetailRoute(key);
      expect(dictionaryTypeFromPath(path)).toBe(key);
      expect(canAccessManagementRoute(user, path)).toBe(true);
    },
  );
  it("accepts the decoded pathname as well as the encoded colon segment", () => {
    expect(dictionaryDetailRoute("resort:level")).toBe(
      "/admin/system/dictionaries/resort%3Alevel",
    );
    expect(
      canAccessManagementRoute(user, "/admin/system/dictionaries/resort:level"),
    ).toBe(true);
  });
  it.each([
    "",
    "7",
    "Upper",
    ".root",
    "../users",
    "a/b",
    "a?key=x",
    "a#fragment",
    "a%2Fsecret",
    "a".repeat(101),
  ])(
    "does not create a link or render a server route for invalid key %s",
    async (key) => {
      expect(isDictionaryType(key)).toBe(false);
      expect(() => dictionaryDetailRoute(key)).toThrow();
      await expect(
        DictionaryDetailPage({ params: Promise.resolve({ dictType: key }) }),
      ).rejects.toThrow("404");
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
  it.each([
    "/admin/system/dictionaries/area/extra",
    "/admin/system/dictionaries/%2e%2e",
    "/admin/system/dictionaries/a%2Fb",
    "/admin/system/dictionaries/a%252Fb",
    "/admin/system/dictionaries/bad%",
    "/admin/system/dictionaries/Area",
  ])("refuses malformed or nested management path %s", (path) => {
    expect(dictionaryTypeFromPath(path)).toBeNull();
    expect(canAccessManagementRoute(user, path)).toBe(false);
  });
  it.each(["management:portal:enter", "system:dict:list"])(
    "checks %s for direct entry, independent of role names",
    (removed) => {
      const currentUser = {
        ...user,
        permissionKeys: user.permissionKeys.filter((key) => key !== removed),
      };
      expect(
        canAccessManagementRoute(
          currentUser,
          dictionaryDetailRoute("area.level"),
        ),
      ).toBe(false);
    },
  );
  it("awaits route params, renders only current-type loading and offers a native return link", async () => {
    let resolve!: (value: { dictType: string }) => void;
    const params = new Promise<{ dictType: string }>((done) => {
      resolve = done;
    });
    const pending = DictionaryDetailPage({ params });
    resolve({ dictType: "area.level" });
    const html = renderToStaticMarkup(await pending);
    expect(html).toContain("字典详情");
    expect(html).toContain("area.level");
    expect(html).toContain('href="/admin/system/dictionaries"');
    expect(html).toContain("返回字典列表");
    expect(html).toContain("ant-spin");
    expect(html).not.toContain("字典筛选");
    expect(html).not.toContain("新建类型");
    expect(html).not.toContain("新增字典项");
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it("does not offer type creation on a detail route even when the account has create permission", async () => {
    account({
      ...user,
      permissionKeys: [...user.permissionKeys, "system:dict:create"],
    });
    const html = renderToStaticMarkup(
      await DictionaryDetailPage({
        params: Promise.resolve({ dictType: "resort.level" }),
      }),
    );
    expect(html).toContain("新增字典项");
    expect(html).toContain("disabled");
    expect(html).not.toContain("新建类型");
    expect(html).not.toContain("字典筛选");
  });
  it("does not publish detail content while the session is loading", async () => {
    account(null);
    expect(
      renderToStaticMarkup(
        await DictionaryDetailPage({
          params: Promise.resolve({ dictType: "area.level" }),
        }),
      ),
    ).toBe("");
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
