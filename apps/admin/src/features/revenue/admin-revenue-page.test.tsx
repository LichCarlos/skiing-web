import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { AdminRevenuePage } from "@/features/revenue/admin-revenue-page";
import { useSession } from "@/platform/auth/session-provider";
import { apiRequest } from "@/platform/api";
import { operator } from "@/features/revenue/merchant-revenue-fixtures.test-helper";
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
vi.mock("@/platform/auth/session-provider", () => ({ useSession: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
it.each(["loading", "anonymous", "unavailable"] as const)(
  "does not fetch private revenue for %s session",
  (status) => {
    vi.mocked(useSession).mockReturnValue({
      session: { status, currentUser: null, errorMessage: null } as ReturnType<
        typeof useSession
      >["session"],
      signIn: vi.fn(),
      signOut: vi.fn(),
      retryRestore: vi.fn(),
    });
    expect(renderToStaticMarkup(createElement(AdminRevenuePage))).toContain(
      status === "loading" ? "正在确认登录身份" : "请先恢复登录身份",
    );
    expect(apiRequest).not.toHaveBeenCalled();
  },
);
it.each(
  [
    ["management:portal:enter"],
    ["revenue:system:list"],
    ["revenue:system:upsert"],
    ["management:portal:enter", "revenue:merchant:list"],
  ].map((permissionKeys) => ({ permissionKeys })),
)("denies admin revenue for incomplete grants %j", ({ permissionKeys }) => {
  vi.mocked(useSession).mockReturnValue({
    session: {
      status: "authenticated",
      currentUser: { ...operator, permissionKeys },
      errorMessage: null,
    },
    signIn: vi.fn(),
    signOut: vi.fn(),
    retryRestore: vi.fn(),
  });
  expect(renderToStaticMarkup(createElement(AdminRevenuePage))).toContain(
    "没有收益管理权限",
  );
  expect(apiRequest).not.toHaveBeenCalled();
});
it("renders configured read grants independently of merchant identity and write permission", () => {
  vi.mocked(useSession).mockReturnValue({
    session: {
      status: "authenticated",
      currentUser: {
        ...operator,
        merchant: null,
        permissionKeys: ["management:portal:enter", "revenue:system:list"],
      },
      errorMessage: null,
    },
    signIn: vi.fn(),
    signOut: vi.fn(),
    retryRestore: vi.fn(),
  });
  const html = renderToStaticMarkup(createElement(AdminRevenuePage));
  expect(html).toContain("收益维护");
  expect(html).toContain("核对身份并恢复页面");
  expect(html).toContain("页面读取已暂停");
  expect(html).not.toContain("保存记录");
  expect(apiRequest).not.toHaveBeenCalled();
});
