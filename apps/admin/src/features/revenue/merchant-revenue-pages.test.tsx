import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, it, expect, vi } from "vitest";
import {
  MerchantRevenuePage,
  MerchantRevenueSession,
} from "@/features/revenue/merchant-revenue-page";
import { useSession } from "@/platform/auth/session-provider";
import { apiRequest } from "@/platform/api";
import { operator } from "@/features/revenue/merchant-revenue-fixtures.test-helper";
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
describe("merchant revenue private page boundaries", () => {
  it.each(["loading", "anonymous"] as const)(
    "does not display private amounts for %s",
    (status) => {
      session(null, status);
      expect(
        renderToStaticMarkup(createElement(MerchantRevenuePage)),
      ).toContain(status === "loading" ? "正在确认登录身份" : "请先登录");
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
  it.each(["management:portal:enter", "revenue:merchant:list"])(
    "denies access without %s",
    (grant) => {
      session({
        ...operator,
        permissionKeys: operator.permissionKeys.filter((key) => key !== grant),
      });
      expect(
        renderToStaticMarkup(createElement(MerchantRevenuePage)),
      ).toContain("没有收益查询权限");
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
  it("requires a business merchant association, independently of grants", () => {
    session({ ...operator, merchant: null });
    expect(renderToStaticMarkup(createElement(MerchantRevenuePage))).toContain(
      "未绑定有效商家资料",
    );
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it("renders an explicit query form with a configured role and no private SSR requests", () => {
    const html = renderToStaticMarkup(createElement(MerchantRevenuePage));
    for (const text of [
      "收益数据",
      "重置近30天",
      "刷新已应用条件",
      "重新读取身份",
      "已应用：",
      "正在读取收益",
    ])
      expect(html).toContain(text);
    expect(html).not.toContain("¥");
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it("remounts state for actor, merchant, role and grant changes", () => {
    const props = { children: () => createElement("p", null, "private") };
    const original = MerchantRevenueSession(props).key;
    for (const current of [
      { ...operator, userId: 43 },
      { ...operator, account: "another-account" },
      { ...operator, merchant: { merchantId: 8 } },
      { ...operator, roles: [{ roleKey: "another", roleName: "运营" }] },
      {
        ...operator,
        permissionKeys: [...operator.permissionKeys, "other:grant"],
      },
    ]) {
      session(current);
      expect(MerchantRevenueSession(props).key).not.toBe(original);
    }
  });
});
