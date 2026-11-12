import { describe, expect, it } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import {
  accountListQuery,
  accountWorkspaceKey,
  accountError,
  createAccountBody,
  replaceAccountRoles,
  verifyAccountReader,
} from "@/features/users/user-model";
import { operator, role } from "@/features/users/user-fixtures.test-helper";
const values = {
  account: " SNOW ",
  nickname: " 雪客 ",
  password: " 123456 ",
  roleIds: [3],
};
describe("account forms and identity", () => {
  it("normalizes identity, preserves password bytes, and whitelists DTO fields", () => {
    expect(
      createAccountBody(
        { ...values, status: "disabled", userId: 99 } as typeof values,
        [role(3)],
        operator,
      ),
    ).toEqual({
      account: "snow",
      nickname: "雪客",
      password: " 123456 ",
      roleIds: [3],
    });
  });
  it("defaults an unregistered role form field to the default registration role", () => {
    const { roleIds: _, ...withoutRoles } = values;
    expect(createAccountBody(withoutRoles, [], operator).roleIds).toEqual([]);
  });
  it.each(["12345678", "密".repeat(24), "😀".repeat(18)])(
    "accepts UTF-8 byte limits %s",
    (password) => {
      expect(
        createAccountBody({ ...values, password }, [role(3)], operator)
          .password,
      ).toBe(password);
    },
  );
  it.each(["", "1234567", "密".repeat(25), "😀".repeat(19), "x".repeat(73)])(
    "rejects invalid password length %s",
    (password) => {
      expect(() =>
        createAccountBody({ ...values, password }, [role(3)], operator),
      ).toThrow("UTF-8");
    },
  );
  it("counts account and nickname by Unicode characters", () => {
    const body = createAccountBody(
      { ...values, account: "😀".repeat(50), nickname: "😀".repeat(50) },
      [role(3)],
      operator,
    );
    expect(Array.from(body.account)).toHaveLength(50);
    expect(() =>
      createAccountBody(
        { ...values, nickname: "😀".repeat(51) },
        [role(3)],
        operator,
      ),
    ).toThrow();
  });
  it.each(["account", "nickname"] as const)("rejects blank %s", (key) => {
    expect(() =>
      createAccountBody({ ...values, [key]: " \t " }, [role(3)], operator),
    ).toThrow();
  });
  it.each(
    [[0], [-1], [1.5], [2147483648], [NaN], [3, 3]].map((ids) => ({ ids })),
  )("rejects invalid/duplicate IDs %j", ({ ids }) => {
    expect(() => replaceAccountRoles(ids, [role(3)], operator)).toThrow();
  });
  it("rejects missing and disabled roles without silently dropping them", () => {
    expect(() => replaceAccountRoles([3], [], operator)).toThrow();
    expect(() =>
      replaceAccountRoles([3], [role(3, { status: "disabled" })], operator),
    ).toThrow();
    expect(replaceAccountRoles([], [], operator)).toEqual({ roleIds: [] });
    expect(replaceAccountRoles([4, 3], [role(3), role(4)], operator)).toEqual({
      roleIds: [3, 4],
    });
  });
  it("requires administrator and exclusive system_admin grant", () => {
    const catalog = [role(3), role(4, { roleKey: "system_admin" })];
    expect(() => replaceAccountRoles([4], catalog, operator)).toThrow();
    const admin = {
      ...operator,
      roles: [{ roleKey: "system_admin", roleName: "Admin" }],
    };
    expect(replaceAccountRoles([4], catalog, admin)).toEqual({ roleIds: [4] });
    expect(() => replaceAccountRoles([3, 4], catalog, admin)).toThrow();
  });
  it("does not use merchant status as an account role or grant", () => {
    const merchant = {
      ...operator,
      merchant: {
        merchantId: 8,
        businessName: "雪场",
        status: "active" as const,
      },
    };
    expect(() => verifyAccountReader(merchant, operator)).toThrow();
    expect(replaceAccountRoles([3], [role(3)], merchant)).toEqual({
      roleIds: [3],
    });
  });
  it("compares identity and grant sets independent of order", () => {
    const reordered = {
      ...operator,
      permissionKeys: [...operator.permissionKeys].reverse(),
    };
    expect(accountWorkspaceKey(reordered)).toBe(accountWorkspaceKey(operator));
    expect(() => verifyAccountReader(reordered, operator)).not.toThrow();
    expect(() =>
      verifyAccountReader({ ...operator, userId: 2 }, operator),
    ).toThrow();
    expect(() =>
      verifyAccountReader({ ...operator, permissionKeys: [] }, operator),
    ).toThrow();
  });
  it("encodes filters and fixed table pagination", () => {
    expect(accountListQuery(2, " a&雪 ", "disabled").toString()).toBe(
      "page=2&pageSize=20&keyword=a%26%E9%9B%AA&status=disabled",
    );
    expect(accountListQuery(1, " ").toString()).toBe("page=1&pageSize=20");
    expect(() => accountListQuery(107374184, "", undefined)).toThrow();
    expect(() => accountListQuery(1, "", "pending")).toThrow();
    expect(() => accountListQuery(1, "x".repeat(101))).toThrow();
  });
  it.each([401, 403, 404, 500])(
    "redacts error %s but retains trace ID",
    (status) => {
      const text = accountError(
        new ApiError("private-password", {
          status,
          code: null,
          traceId: "trace-1",
        }),
      );
      expect(text).toContain("trace-1");
      expect(text).not.toContain("private-password");
    },
  );
});
