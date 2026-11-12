import { describe, it, expect } from "vitest";
import {
  loginInput,
  parseCurrentUser,
  validateSessionResponse,
  validateLogout,
} from "@/platform/auth/session-model";
import { user, auth } from "@/platform/auth/session-fixtures.test-helper";
describe("admin authentication runtime contract", () => {
  it("normalizes account and preserves password bytes, including old short passwords", () => {
    expect(loginInput({ account: " Operator ", password: " a " })).toEqual({
      account: "operator",
      password: " a ",
    });
    expect(
      loginInput({ account: "x", password: "雪".repeat(24) }).password,
    ).toHaveLength(24);
  });
  it.each([
    { account: " ", password: "x" },
    { account: "x".repeat(51), password: "x" },
    { account: "x", password: "" },
    { account: "x", password: "雪".repeat(25) },
    { account: "x", password: "a".repeat(73) },
  ])("rejects invalid credentials", (input) =>
    expect(() => loginInput(input)).toThrow(),
  );
  it("projects current user and menus without private fields", () => {
    const node = {
      permissionId: 1,
      parentId: null,
      permissionKey: "menu:x",
      permissionName: "菜单",
      permissionType: "menu" as const,
      route: "/admin",
      icon: null,
      children: [],
    };
    const parsed = parseCurrentUser({
      ...user,
      passwordHash: "secret",
      merchant: { merchantId: 8, businessName: "商家", contact: "private" },
      menuTree: [{ ...node, payload: "private" }],
    });
    expect(parsed.menuTree).toEqual([node]);
    expect(parsed.merchant).toEqual({ merchantId: 8, businessName: "商家" });
    expect(JSON.stringify(parsed)).not.toMatch(/secret|private/);
    expect(parseCurrentUser(user)).toEqual(user);
  });
  it.each([
    null,
    {},
    { ...user, userId: "7" },
    { ...user, userId: 2147483648 },
    { ...user, roles: [{ roleKey: "x" }] },
    { ...user, permissionKeys: [1] },
    { ...user, menuTree: [{}] },
    { ...user, merchant: {} },
    { ...user, nickname: " " },
    { ...user, avatarUrl: 7 },
  ])("rejects incomplete identities", (value) =>
    expect(() => parseCurrentUser(value)).toThrow(),
  );
  it.each([
    { ...auth, accessToken: "secret" },
    { ...auth, refreshToken: "secret" },
    { ...auth, currentUser: { ...user, account: "other" } },
    { ...auth, accessTokenExpiresAt: "invalid" },
    { ...auth, sessionExpiresAt: "2026-11-01T00:00:00Z" },
  ])("rejects malformed browser responses", (value) =>
    expect(() => validateSessionResponse(value, user.account)).toThrow(),
  );
  it("accepts browser contract and confirmed logout", () => {
    expect(() => validateSessionResponse(auth, user.account)).not.toThrow();
    expect(() => validateLogout({ loggedOut: true })).not.toThrow();
    expect(() => validateLogout({ loggedOut: false })).toThrow();
    expect(() => validateLogout(undefined)).toThrow();
  });
});
