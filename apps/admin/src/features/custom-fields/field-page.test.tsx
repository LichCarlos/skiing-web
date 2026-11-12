import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginFieldWrite,
  fieldRecoverySnapshot,
  reviewFieldWrite,
} from "@/features/custom-fields/field-recovery";
import type { User } from "@/features/custom-fields/field-model";
import Page from "@/app/admin/system/fields/page";
import { apiRequest } from "@/platform/api";
import { useSession } from "@/platform/auth/session-provider";
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
const recoveryRender = vi.hoisted(() => ({ client: false }));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useSyncExternalStore: (
      ...args: Parameters<typeof actual.useSyncExternalStore>
    ) =>
      recoveryRender.client ? args[1]() : actual.useSyncExternalStore(...args),
  };
});
vi.mock("@/platform/auth/session-provider", () => ({ useSession: vi.fn() }));
const user: User = {
  userId: 7,
  account: "operator",
  nickname: "Operator",
  avatarUrl: null,
  roles: [{ roleKey: "business_custom", roleName: "Operator" }],
  merchant: null,
  menuTree: [],
  permissionKeys: ["management:portal:enter", "system:field:list"],
};
function render(
  currentUser: User | null,
  status: "loading" | "anonymous" = "loading",
) {
  vi.mocked(useSession).mockReturnValue({
    session: currentUser
      ? { status: "authenticated", currentUser, errorMessage: null }
      : { status, currentUser: null, errorMessage: null },
    signIn: vi.fn(),
    signOut: vi.fn(),
    retryRestore: vi.fn(),
  });
  return renderToStaticMarkup(createElement(Page));
}
beforeEach(() => {
  vi.clearAllMocks();
  recoveryRender.client = false;
});
afterEach(() => vi.unstubAllGlobals());
describe("field page entry", () => {
  it("uses the empty server snapshot even when this process has browser recovery memory", () => {
    vi.stubGlobal("window", {});
    const receipt = beginFieldWrite(
      user.userId,
      "ski_resort",
      "system:field:create",
    )!;
    try {
      expect(render(user)).not.toContain("正在等待字段或分组操作返回");
    } finally {
      receipt.confirm();
    }
  });
  it("keeps an in-flight group operation blocked when the field page is rendered again", () => {
    recoveryRender.client = true;
    vi.stubGlobal("window", {});
    const receipt = beginFieldWrite(
      user.userId,
      "ski_resort",
      "system:field-group:create",
    )!;
    try {
      const html = render({
        ...user,
        permissionKeys: [...user.permissionKeys, "system:field:create"],
      });
      expect(html).toContain("正在等待字段或分组操作返回");
      expect(html).toContain("当前账号不能查询分组");
      expect(html).not.toContain("可切换状态和分页查找记录");
      expect(apiRequest).not.toHaveBeenCalled();
    } finally {
      receipt.confirm();
    }
  });
  it("shows unknown-result review after remount and isolates the account and entity", () => {
    recoveryRender.client = true;
    vi.stubGlobal("window", {});
    const receipt = beginFieldWrite(
      user.userId,
      "ski_resort",
      "system:field:create",
    )!;
    receipt.uncertain();
    try {
      expect(render(user)).toContain("操作结果未确认");
      expect(render({ ...user, userId: 8 })).not.toContain("操作结果未确认");
      expect(apiRequest).not.toHaveBeenCalled();
    } finally {
      reviewFieldWrite(user.userId, "ski_resort", fieldRecoverySnapshot());
    }
  });
  it("does not display account data before session restoration", () => {
    expect(render(null)).toBe("");
    expect(render(null, "anonymous")).toBe("");
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it.each(["management:portal:enter", "system:field:list"])(
    "rejects missing %s",
    (permission) => {
      const html = render({
        ...user,
        permissionKeys: user.permissionKeys.filter((key) => key !== permission),
      });
      expect(html).toContain("当前账号无权读取字段配置");
      expect(html).not.toContain("新建字段");
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
  it("shows field loading for a custom role without requesting privileged group data", () => {
    const html = render(user);
    expect(html).toContain("字段管理");
    expect(html).toContain("当前账号无字段分组查询权限");
    expect(html).not.toContain("新建字段");
    expect(html).not.toContain("新建分组");
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it("shows create and group controls from separate grants", () => {
    const html = render({
      ...user,
      permissionKeys: [
        ...user.permissionKeys,
        "system:field:create",
        "system:field-group:list",
        "system:field-group:create",
      ],
    });
    expect(html).toContain("新建字段");
    expect(html).toContain("新建分组");
    expect(html).not.toContain("当前账号无字段分组查询权限");
  });
});
