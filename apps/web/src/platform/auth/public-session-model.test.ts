import { describe, it, expect } from "vitest";
import {
  initialPublicSession,
  visiblePublicSession,
  loginInput,
  parsePublicUser,
  validateBrowserLogin,
  validateBrowserLogout,
} from "@/platform/auth/public-session-model";
import {
  user,
  auth,
} from "@/platform/auth/public-session-fixtures.test-helper";
describe("public session response and credential boundary", () => {
  it("normalizes account without changing or trimming the password", () => {
    expect(loginInput(" Snow.User ", "  密码  ")).toEqual({
      account: "snow.user",
      password: "  密码  ",
    });
    expect(loginInput("x", "a")).toEqual({ account: "x", password: "a" });
    expect(loginInput("x", "雪".repeat(24)).password).toHaveLength(24);
  });
  it.each([
    [" ", "a"],
    ["x".repeat(51), "a"],
    ["x", ""],
    ["x", "雪".repeat(25)],
    ["x", "a".repeat(73)],
    [null, "password"],
    ["user", null],
  ])("rejects invalid credentials", (account, password) => {
    expect(() => loginInput(account, password)).toThrow();
  });
  it("projects known fields, including a merchant and nested menus, without extra secrets", () => {
    const node = {
      permissionId: 1,
      parentId: null,
      permissionKey: "menu:read",
      permissionName: "菜单",
      permissionType: "menu",
      route: "/x",
      icon: null,
      children: [],
    };
    const input = {
      ...user,
      passwordHash: "secret",
      merchant: { merchantId: 3, businessName: "商家", contact: "private" },
      menuTree: [{ ...node, extra: "private" }],
    };
    const result = parsePublicUser(input);
    expect(result.merchant).toEqual({ merchantId: 3, businessName: "商家" });
    expect(result.menuTree).toEqual([node]);
    expect(JSON.stringify(result)).not.toMatch(/secret|private/);
    expect(parsePublicUser(user)).toEqual(user);
  });
  it.each([
    null,
    {},
    { ...user, userId: "7" },
    { ...user, userId: 2147483648 },
    { ...user, nickname: " " },
    { ...user, roles: null },
    { ...user, roles: [{ roleKey: "user" }] },
    { ...user, permissionKeys: [7] },
    { ...user, merchant: {} },
    { ...user, menuTree: [{}] },
    { ...user, avatarUrl: 1 },
  ])("refuses a malformed identity", (value) => {
    expect(() => parsePublicUser(value)).toThrow("会话响应异常");
  });
  it.each([
    { ...auth, currentUser: { ...user, account: "other" } },
    { ...auth, accessToken: "native-secret" },
    { ...auth, refreshToken: "native-secret" },
    { ...auth, sessionExpiresAt: "invalid" },
    { ...auth, accessTokenExpiresAt: "2027-01-01T00:00:00Z" },
  ])("rejects browser login contract mismatches", (value) => {
    expect(() => validateBrowserLogin(value, user.account)).toThrow();
  });
  it("accepts the browser cookie response and only a successful logout acknowledgement", () => {
    expect(() => validateBrowserLogin(auth, user.account)).not.toThrow();
    expect(() => validateBrowserLogout({ loggedOut: true })).not.toThrow();
    expect(() => validateBrowserLogout({ loggedOut: false })).toThrow();
    expect(() => validateBrowserLogout(undefined)).toThrow();
  });
  it("masks old route state synchronously", () => {
    const known = {
      ...initialPublicSession,
      pathname: "/knowledge",
      ready: true,
      reading: false,
      user,
    };
    expect(visiblePublicSession(known, "/privacy")).toMatchObject({
      user: null,
      ready: false,
      reading: true,
    });
    expect(visiblePublicSession(known, "/knowledge")).toBe(known);
  });
});
