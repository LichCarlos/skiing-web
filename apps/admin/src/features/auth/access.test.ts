import { describe, expect, it } from "vitest";
import {
  canAccessManagementRoute,
  canConfigureRoleAuthorization,
  canManageRoles,
  canReadPermissionCatalog,
  hasManagementPortalAccess,
} from "@/platform/auth/access";

describe("management access policy", () => {
  it("uses the explicit portal grant without inspecting a role key", () => {
    expect(
      hasManagementPortalAccess({
        permissionKeys: ["management:portal:enter"],
      }),
    ).toBe(true);
    expect(hasManagementPortalAccess({ permissionKeys: [] })).toBe(false);
    expect(hasManagementPortalAccess(null)).toBe(false);
  });

  it("uses the catalog read grant rather than the legacy tree grants", () => {
    expect(
      canReadPermissionCatalog({
        permissionKeys: ["system:permission:list"],
      }),
    ).toBe(true);
    expect(
      canReadPermissionCatalog({
        permissionKeys: ["system:role:list", "system:permission:assign"],
      }),
    ).toBe(false);
  });

  it("fails closed for direct navigation without page grants or a known route", () => {
    const portalOnly = { permissionKeys: ["management:portal:enter"] };
    expect(canAccessManagementRoute(portalOnly, "/admin")).toBe(true);
    expect(
      canAccessManagementRoute(portalOnly, "/admin/system/permissions"),
    ).toBe(false);
    expect(canAccessManagementRoute(portalOnly, "/admin/unregistered")).toBe(
      false,
    );
  });

  it("restricts revenue maintenance to system_admin and revenue grants", () => {
    const merchant = {
      permissionKeys: ["management:portal:enter", "revenue:merchant:list"],
      roles: [{ roleKey: "merchant_operator", roleName: "商家运营" }],
    };
    const admin = {
      permissionKeys: ["management:portal:enter", "revenue:system:upsert"],
      roles: [{ roleKey: "system_admin", roleName: "系统管理员" }],
    };
    expect(canAccessManagementRoute(merchant, "/admin/merchant/revenue")).toBe(
      true,
    );
    expect(canAccessManagementRoute(merchant, "/admin/system/revenue")).toBe(
      false,
    );
    expect(canAccessManagementRoute(admin, "/admin/system/revenue")).toBe(true);
  });

  it("allows field management only to users with the field-list grant", () => {
    const fieldManager = {
      permissionKeys: ["management:portal:enter", "system:field:list"],
    };
    const portalOnly = { permissionKeys: ["management:portal:enter"] };

    expect(canAccessManagementRoute(fieldManager, "/admin/system/fields")).toBe(
      true,
    );
    expect(canAccessManagementRoute(portalOnly, "/admin/system/fields")).toBe(
      false,
    );
  });

  it("limits role authorization editing to system_admin while allowing scoped role readers", () => {
    const roleReader = {
      permissionKeys: ["management:portal:enter", "system:role:list"],
      roles: [{ roleKey: "role_auditor", roleName: "角色审计员" }],
    };
    const systemAdmin = {
      permissionKeys: [
        "management:portal:enter",
        "system:role:list",
        "system:permission:assign",
      ],
      roles: [{ roleKey: "system_admin", roleName: "系统管理员" }],
    };

    expect(canManageRoles(roleReader)).toBe(true);
    expect(canAccessManagementRoute(roleReader, "/admin/system/roles")).toBe(
      true,
    );
    expect(
      canAccessManagementRoute(roleReader, "/admin/system/roles/7/permissions"),
    ).toBe(false);
    expect(canConfigureRoleAuthorization(systemAdmin)).toBe(true);
    expect(
      canAccessManagementRoute(
        systemAdmin,
        "/admin/system/roles/7/permissions",
      ),
    ).toBe(true);
  });

  it("limits project knowledge write routes to system_admin with matching grants", () => {
    const reader = {
      permissionKeys: [
        "management:portal:enter",
        "content:project-knowledge:list",
      ],
      roles: [{ roleKey: "content_reader", roleName: "内容只读" }],
    };
    const admin = {
      permissionKeys: [
        "management:portal:enter",
        "content:project-knowledge:list",
        "content:project-knowledge:create",
        "content:project-knowledge:update",
      ],
      roles: [{ roleKey: "system_admin", roleName: "系统管理员" }],
    };

    expect(
      canAccessManagementRoute(reader, "/admin/content/project-knowledge"),
    ).toBe(false);
    expect(
      canAccessManagementRoute(reader, "/admin/content/project-knowledge/new"),
    ).toBe(false);
    expect(
      canAccessManagementRoute(admin, "/admin/content/project-knowledge/new"),
    ).toBe(true);
    expect(
      canAccessManagementRoute(
        admin,
        "/admin/content/project-knowledge/8/edit",
      ),
    ).toBe(true);
  });
});
