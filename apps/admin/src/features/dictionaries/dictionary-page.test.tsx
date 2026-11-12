import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginDictionaryWrite,
  dictionaryRecoverySnapshot,
  reviewDictionaryWrite,
} from "@/features/dictionaries/dictionary-recovery";
import type { components } from "@common/api-contracts/openapi";
import DictionariesPage from "@/app/admin/system/dictionaries/page";
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

const user: components["schemas"]["CurrentUserVO"] = {
  userId: 7,
  account: "operator",
  nickname: "业务运营",
  avatarUrl: null,
  roles: [{ roleKey: "configurable", roleName: "业务身份" }],
  menuTree: [],
  merchant: null,
  permissionKeys: ["management:portal:enter", "system:dict:list"],
};
function session(
  currentUser: typeof user | null,
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
  return renderToStaticMarkup(createElement(DictionariesPage));
}
beforeEach(() => {
  recoveryRender.client = false;
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe("dictionary page entry", () => {
  it("uses the empty server snapshot even when this process has browser recovery memory", () => {
    vi.stubGlobal("window", {});
    const receipt = beginDictionaryWrite(user.userId, "resort.tags")!;
    try {
      expect(session(user)).not.toContain("待核对字典");
    } finally {
      receipt.confirm();
    }
  });
  it("retains the pending target and blocks a remounted workspace", () => {
    recoveryRender.client = true;
    vi.stubGlobal("window", {});
    const receipt = beginDictionaryWrite(user.userId, "resort.tags")!;
    try {
      const html = session(user);
      expect(html).toContain("正在等待字典操作返回");
      expect(html).toContain("待核对字典");
      expect(html).toContain("resort.tags");
      expect(apiRequest).not.toHaveBeenCalled();
    } finally {
      receipt.confirm();
    }
  });
  it("shows a settled unknown result while isolating another account", () => {
    recoveryRender.client = true;
    vi.stubGlobal("window", {});
    const receipt = beginDictionaryWrite(user.userId, "resort.tags")!;
    receipt.uncertain();
    try {
      expect(session(user)).toContain("操作结果未确认");
      expect(session({ ...user, userId: 8 })).not.toContain("操作结果未确认");
    } finally {
      reviewDictionaryWrite(
        user.userId,
        "resort.tags",
        dictionaryRecoverySnapshot(),
      );
    }
  });
  it("does not display data or request it before session restoration", () => {
    expect(session(null)).toBe("");
    expect(session(null, "anonymous")).toBe("");
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it.each(["management:portal:enter", "system:dict:list"])(
    "blocks an account without %s",
    (removed) => {
      const html = session({
        ...user,
        permissionKeys: user.permissionKeys.filter((key) => key !== removed),
      });
      expect(html).toContain("当前账号无权读取数据字典");
      expect(html).not.toContain("新增分类");
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
  it("allows a custom business role to read, without showing create controls", () => {
    const html = session(user);
    expect(html).toContain("数据字典");
    expect(html).not.toContain("新增分类");
    expect(html).toContain("ant-spin");
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it("shows create only with its grant and preserves the directory page during initial loading", () => {
    const html = session({
      ...user,
      permissionKeys: [...user.permissionKeys, "system:dict:create"],
    });
    expect(html).toContain("新增分类");
    expect(html).toContain("字典筛选");
    expect(html).not.toContain("新增字典项");
  });
});
