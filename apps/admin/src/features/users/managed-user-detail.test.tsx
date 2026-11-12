import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import { apiRequest } from "@/platform/api";
import {
  getManagedUser,
  managedUserLoadError,
  type ManagedUser,
} from "@/features/users/managed-user-api";
import {
  ManagedUserDetailView,
  type ManagedUserDetailState,
} from "@/features/users/managed-user-detail-view";

vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
afterEach(() => vi.clearAllMocks());
const user: ManagedUser = {
  userId: 7,
  account: "snow-operator",
  nickname: "<script>alert(1)</script>",
  status: "disabled",
  roles: [
    {
      roleId: 4,
      roleKey: "snow_operations",
      roleName: "雪场运营",
      systemRoleCode: null,
      status: "active",
    },
    {
      roleId: 5,
      roleKey: "archived",
      roleName: "归档角色",
      systemRoleCode: null,
      status: "disabled",
    },
  ],
  merchant: { merchantId: 8, businessName: "北岭雪场", status: "active" },
  createdAt: "2026-10-29T00:00:00Z",
};
const render = (state: ManagedUserDetailState) =>
  renderToStaticMarkup(
    createElement(ManagedUserDetailView, { state, onReload: () => undefined }),
  );

describe("managed user detail", () => {
  it("reads the existing scoped API and forwards cancellation", async () => {
    const signal = new AbortController().signal;
    vi.mocked(apiRequest).mockResolvedValue(user);
    expect(await getManagedUser(7, signal)).toEqual(user);
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith("/admin/users/7", {
      signal,
      cache: "no-store",
    });
  });
  it("renders loading and a back link without stale identity data", () => {
    const html = render({ status: "loading" });
    expect(html).toContain('role="status"');
    expect(html).toContain('href="/admin/system/users"');
    expect(html).not.toContain(user.account);
  });
  it("renders only account, role and merchant VO fields as escaped text", () => {
    const extra = {
      ...user,
      passwordHash: "sensitive-hash",
      accessToken: "sensitive-access",
      metadata: "sensitive-audit",
    };
    const html = render({ status: "ready", user: extra });
    for (const value of [
      "snow-operator",
      "雪场运营",
      "归档角色",
      "北岭雪场",
      "停用",
      "&lt;script&gt;",
    ])
      expect(html).toContain(value);
    for (const value of [
      "<script>",
      "sensitive-hash",
      "sensitive-access",
      "sensitive-audit",
    ])
      expect(html).not.toContain(value);
    expect(html).toMatch(/datetime="2026-10-29T00:00:00Z"/i);
  });
  it("shows missing roles and merchant data explicitly", () => {
    const html = render({
      status: "ready",
      user: { ...user, roles: [], merchant: null },
    });
    expect(html).toContain("未分配角色");
    expect(html).toContain("未关联商家业务资料");
  });
  it.each([
    [401, "登录状态已失效"],
    [403, "当前账号无权查看账号详情"],
    [404, "账号不存在或不在可访问范围内"],
    [500, "账号详情暂时不可用"],
  ])("maps HTTP %s without exposing server exception text", (status, title) => {
    const error = new ApiError("internal-secret", {
      status: Number(status),
      code: null,
      traceId: "trace-7",
    });
    const html = render(managedUserLoadError(error));
    expect(html).toContain(title);
    expect(html).toContain("traceId: trace-7");
    expect(html).toContain('role="alert"');
    expect(html).toContain(">重试</button>");
    expect(html).not.toContain("internal-secret");
    expect(html).not.toContain(user.account);
  });
});
