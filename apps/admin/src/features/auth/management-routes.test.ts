import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { components } from "@common/api-contracts/openapi";
import {
  canAccessManagementRoute,
  canAccessManagementPage,
} from "@/platform/auth/access";
import {
  getActiveManagementModule,
  getManagementGroups,
  getManagementModules,
} from "@/features/auth/management-modules";

const grants = [
  "management:portal:enter",
  "merchant:dashboard:read",
  "system:user:list",
  "system:operation-log:list",
  "system:event:list",
  "system:ai-conversation:list",
  "system:ai-conversation:read-content",
  "ai:knowledge:list",
  "ai:knowledge:reindex",
  "ai:knowledge:disable",
  "system:config:list",
  "system:role:list",
  "system:permission:list",
  "system:permission:assign",
  "system:dict:list",
  "system:field:list",
  "resort:merchant:list",
  "resort:merchant:create",
  "resort:merchant:update",
  "content:resort:list-all",
  "content:resort:create-all",
  "content:resort:update-all",
  "content:asset:list",
  "content:article:manage",
  "content:dynamic:moderate",
  "content:project-knowledge:list",
  "content:project-knowledge:create",
  "content:project-knowledge:update",
  "revenue:merchant:list",
  "revenue:system:upsert",
];
const admin: components["schemas"]["CurrentUserVO"] = {
  userId: 1,
  account: "operator",
  nickname: "运营",
  avatarUrl: null,
  merchant: { merchantId: 5, businessName: "雪场商家" },
  roles: [{ roleKey: "system_admin", roleName: "系统管理员" }],
  permissionKeys: grants,
  menuTree: [],
};

describe("management route coverage", () => {
  it("hides merchant-only modules without a valid binding and blocks direct pages, even for system administrators", () => {
    const unbound = { ...admin, merchant: null };
    for (const path of [
      "/admin/merchant",
      "/admin/merchant/resorts",
      "/admin/merchant/resorts/new",
      "/admin/merchant/resorts/7/edit",
      "/admin/merchant/revenue",
    ]) {
      expect(canAccessManagementPage(unbound, path), path).toBe(false);
      expect(canAccessManagementPage(admin, path), path).toBe(true);
    }
    expect(
      getManagementModules(unbound).map((item) => item.href),
    ).not.toContain("/admin/merchant");
    expect(getManagementModules(unbound).map((item) => item.href)).toContain(
      "/admin/system/revenue",
    );
  });
  it("requires grants after binding and ignores arbitrary server menu routes", () => {
    const denied = { ...admin, permissionKeys: ["management:portal:enter"] };
    expect(getManagementModules(denied)).toEqual([]);
    expect(canAccessManagementPage(denied, "/admin/merchant/revenue")).toBe(
      false,
    );
    const unknown = {
      ...admin,
      menuTree: [
        {
          permissionId: 99,
          parentId: null,
          permissionKey: "custom:any",
          permissionName: "Injected",
          permissionType: "menu" as const,
          route: "/admin/custom/page",
          icon: null,
          children: [],
        },
      ],
    };
    expect(
      getManagementModules(unknown).some(
        (item) => String(item.href) === "/admin/custom/page",
      ),
    ).toBe(false);
    expect(canAccessManagementPage(unknown, "/admin/custom/page")).toBe(false);
    expect(
      getManagementModules({
        ...admin,
        permissionKeys: admin.permissionKeys.filter(
          (key) => key !== "system:dict:list",
        ),
      }).some((item) => item.href === "/admin/system/dictionaries"),
    ).toBe(false);
  });
  it("groups each authorized module once and omits inaccessible groups", () => {
    const items = getManagementGroups(admin).flatMap((group) => group.items);
    expect(items.map(({ href }) => href).sort()).toEqual(
      getManagementModules(admin)
        .map(({ href }) => href)
        .sort(),
    );
    expect(new Set(items.map(({ href }) => href)).size).toBe(items.length);
    expect(getManagementGroups({ ...admin, permissionKeys: [] })).toEqual([]);
    const scoped = {
      ...admin,
      permissionKeys: ["management:portal:enter", "revenue:merchant:list"],
    };
    expect(getManagementGroups(scoped).map(({ label }) => label)).toEqual([
      "商家经营",
    ]);
    expect(
      getActiveManagementModule(scoped, "/admin/system/users"),
    ).toBeUndefined();
  });

  it("selects only the closest authorized ancestor for nested pages", () => {
    expect(
      getActiveManagementModule(admin, "/admin/merchant/revenue")?.label,
    ).toBe("收益数据");
    expect(
      getActiveManagementModule(admin, "/admin/system/roles/7/permissions")
        ?.label,
    ).toBe("角色管理");
    expect(getActiveManagementModule(admin, "/admin")?.label).toBeUndefined();
    expect(
      getActiveManagementModule(admin, "/admin/system/users-extra"),
    ).toBeUndefined();
  });

  it("covers every physical management page, including dynamic routes", () => {
    const adminDirectory = fileURLToPath(
      new URL("../../app/admin/", import.meta.url),
    );
    function pages(directory: string, path = "/admin"): string[] {
      return readdirSync(directory, { withFileTypes: true }).flatMap(
        (entry) => {
          if (entry.isDirectory())
            return pages(
              resolve(directory, entry.name),
              `${path}/${entry.name === "[dictType]" ? "area.level" : entry.name === "[entityType]" ? "article" : path === "/admin/ai/conversations" && entry.name === "[id]" ? "078edc04-0d24-4f83-a509-54c472869e70" : entry.name.startsWith("[") ? "7" : entry.name}`,
            );
          return entry.name === "page.tsx" ? [path] : [];
        },
      );
    }
    const paths = pages(adminDirectory);
    expect(paths.length).toBeGreaterThan(20);
    for (const path of paths) {
      expect(canAccessManagementRoute(admin, path), path).toBe(true);
      expect(
        canAccessManagementRoute({ ...admin, permissionKeys: [] }, path),
        path,
      ).toBe(false);
      if (path !== "/admin")
        expect(
          canAccessManagementRoute(
            { permissionKeys: ["management:portal:enter"] },
            path,
          ),
          path,
        ).toBe(false);
    }
  });

  it.each([
    ["/admin/merchant", "merchant:dashboard:read"],
    ["/admin/system/users", "system:user:list"],
    ["/admin/system/users/7", "system:user:list"],
    ["/admin/system/roles/7", "system:role:list"],
    ["/admin/system/dictionaries", "system:dict:list"],
    ["/admin/system/dictionaries/area.level", "system:dict:list"],
    ["/admin/content/assets", "content:asset:list"],
    ["/admin/content/articles", "content:article:manage"],
    ["/admin/content/articles/7/edit", "content:article:manage"],
    ["/admin/merchant/resorts", "resort:merchant:list"],
    ["/admin/content/resorts", "content:resort:list-all"],
    ["/admin/system/permissions", "system:permission:list"],
  ])(
    "opens %s with its read permission, independently of unrelated roles",
    (path, grant) => {
      const user = {
        permissionKeys: ["management:portal:enter", grant],
        roles: [{ roleKey: "custom_operator", roleName: "自定义运营" }],
      };
      expect(canAccessManagementRoute(user, path)).toBe(true);
      expect(
        canAccessManagementRoute({ ...user, permissionKeys: [grant] }, path),
      ).toBe(false);
    },
  );

  it.each([
    [
      "/admin/merchant/resorts/new",
      "resort:merchant:list",
      "resort:merchant:create",
    ],
    [
      "/admin/merchant/resorts/7/edit",
      "resort:merchant:list",
      "resort:merchant:update",
    ],
    [
      "/admin/content/resorts/new",
      "content:resort:list-all",
      "content:resort:create-all",
    ],
    [
      "/admin/content/resorts/7/edit",
      "content:resort:list-all",
      "content:resort:update-all",
    ],
  ])("requires both read and write grants for %s", (path, read, write) => {
    expect(
      canAccessManagementRoute(
        { permissionKeys: ["management:portal:enter", read] },
        path,
      ),
    ).toBe(false);
    expect(
      canAccessManagementRoute(
        { permissionKeys: ["management:portal:enter", write] },
        path,
      ),
    ).toBe(false);
    expect(
      canAccessManagementRoute(
        { permissionKeys: ["management:portal:enter", read, write] },
        path,
      ),
    ).toBe(true);
  });

  it.each([
    "/admin/system/users/7/password",
    "/admin/system/users/0",
    "/admin/system/users/99999999999999999999",
    "/admin/system/roles/7/unknown",
    "/admin/system/roles/0",
    "/admin/system/roles/01",
    "/admin/system/roles/2147483648",
    "/admin/system/roles/01/permissions",
    "/admin/content/dynamics/export",
    "/admin/content/project-knowledge/7/secret",
    "/admin/content/resorts/7/edit/extra",
  ])("rejects unknown or malformed route %s even with all grants", (path) => {
    expect(canAccessManagementRoute(admin, path)).toBe(false);
  });

  it("uses the same access policy for navigation and dashboard, without merchant role-key assumptions", () => {
    const merchant = {
      ...admin,
      permissionKeys: [
        "management:portal:enter",
        "resort:merchant:list",
        "revenue:merchant:list",
      ],
      roles: [{ roleKey: "snow_operations", roleName: "雪场运营" }],
    };
    expect(getManagementModules(merchant).map(({ label }) => label)).toEqual([
      "我的雪场",
      "收益数据",
    ]);
    const modules = getManagementModules(admin);
    expect(modules.map(({ label }) => label)).toContain("媒体资源");
    expect(new Set(modules.map(({ href }) => href)).size).toBe(modules.length);
    expect(getManagementModules({ ...admin, permissionKeys: [] })).toEqual([]);
  });
});
