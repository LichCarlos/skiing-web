import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MerchantDashboard } from "@/features/merchant-dashboard/merchant-dashboard";
import { useSession } from "@/platform/auth/session-provider";
import { apiRequest } from "@/platform/api";
import type { CurrentUser } from "@/platform/auth/session-model";
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
vi.mock("@/platform/auth/session-provider", () => ({ useSession: vi.fn() }));
const user: CurrentUser = {
  userId: 7,
  account: "operator",
  nickname: "业务账号",
  avatarUrl: null,
  roles: [{ roleKey: "custom", roleName: "可配置角色" }],
  merchant: { merchantId: 8, businessName: "商家" },
  menuTree: [],
  permissionKeys: [
    "management:portal:enter",
    "merchant:dashboard:read",
    "resort:merchant:list",
    "revenue:merchant:list",
  ],
};
function session(
  current: CurrentUser | null,
  status: "anonymous" | "loading" = "loading",
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
  session(user);
});
describe("merchant overview page", () => {
  it.each(["loading", "anonymous"] as const)(
    "has no private projection or SSR read for %s",
    (status) => {
      session(null, status);
      expect(renderToStaticMarkup(createElement(MerchantDashboard))).toBe("");
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
  it.each(["management:portal:enter", "merchant:dashboard:read"])(
    "denies missing entry %s",
    (key) => {
      session({
        ...user,
        permissionKeys: user.permissionKeys.filter((value) => value !== key),
      });
      expect(renderToStaticMarkup(createElement(MerchantDashboard))).toContain(
        "未获商家工作台授权",
      );
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
  it("requires business association even with all grants", () => {
    session({ ...user, merchant: null });
    expect(renderToStaticMarkup(createElement(MerchantDashboard))).toContain(
      "未绑定有效商家资料",
    );
  });
  it("renders the query and recovery controls without private SSR data", () => {
    const html = renderToStaticMarkup(createElement(MerchantDashboard));
    for (const label of [
      "商家",
      "雪场状态",
      "收益开始日期",
      "收益雪场 ID",
      "重新读取经营概览",
      "重新读取身份",
      "正在读取雪场数据",
      "正在读取收益数据",
    ])
      expect(html).toContain(label);
    expect(html).not.toContain("¥");
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it("remounts for changed account, business, roles and grants", () => {
    const original = MerchantDashboard()!.key;
    for (const changed of [
      { ...user, account: "other" },
      { ...user, merchant: { merchantId: 9, businessName: "other" } },
      { ...user, roles: [] },
      { ...user, permissionKeys: [...user.permissionKeys, "another:grant"] },
    ]) {
      session(changed);
      expect(MerchantDashboard()!.key).not.toBe(original);
    }
  });
  it("hides ungranted panel filters", () => {
    session({
      ...user,
      permissionKeys: ["management:portal:enter", "merchant:dashboard:read"],
    });
    const html = renderToStaticMarkup(createElement(MerchantDashboard));
    expect(html).not.toContain("收益开始日期");
    expect(html).not.toContain("<select");
  });
});
