import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/platform/api";
import {
  readAccountRoleCatalog,
  readAccountTarget,
  verifyAccountIdentity,
} from "@/features/users/user-queries";
import {
  accountWorkspaceKey,
  canReadAccounts,
} from "@/features/users/user-model";
import {
  account,
  operator,
  role,
} from "@/features/users/user-fixtures.test-helper";
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const signal = () => new AbortController().signal;
describe("managed account response boundaries", () => {
  it("projects account, roles and merchant instead of retaining extra response fields", async () => {
    const value = {
      ...account,
      passwordHash: "secret",
      roles: account.roles.map((r) => ({ ...r, grants: "secret" })),
      merchant: {
        merchantId: 3,
        businessName: "雪场",
        status: "disabled",
        contactPhone: "secret",
      },
    };
    vi.mocked(apiRequest).mockResolvedValue(value);
    const result = await readAccountTarget(account.userId, signal());
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(result.merchant).toEqual({
      merchantId: 3,
      businessName: "雪场",
      status: "disabled",
    });
  });
  it.each([
    { ...account, account: null },
    { ...account, nickname: " " },
    { ...account, status: "pending" },
    { ...account, createdAt: "invalid" },
    { ...account, roles: null },
    { ...account, roles: [null] },
    { ...account, roles: [{ ...account.roles[0], roleId: 0 }] },
    { ...account, roles: [{ ...account.roles[0], status: "deleted" }] },
    { ...account, roles: [...account.roles, ...account.roles] },
    { ...account, merchant: {} },
    {
      ...account,
      merchant: { merchantId: 3, businessName: "雪场", status: "pending" },
    },
  ])("rejects malformed nested account data", async (value) => {
    vi.mocked(apiRequest).mockResolvedValue(value);
    await expect(readAccountTarget(account.userId, signal())).rejects.toThrow();
  });
  it.each([
    null,
    {},
    { ...operator, permissionKeys: null },
    { ...operator, roles: [null] },
  ])(
    "rejects invalid local identities without making requests",
    async (value) => {
      expect(canReadAccounts(value as typeof operator)).toBe(false);
      await expect(
        verifyAccountIdentity(value as typeof operator, signal()),
      ).rejects.toThrow();
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
  it("uses account as part of the workspace identity", () => {
    expect(accountWorkspaceKey(operator)).not.toBe(
      accountWorkspaceKey({ ...operator, account: "replacement" }),
    );
  });
  it("rejects a changed account even when IDs and grants match", async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      ...operator,
      account: "replacement",
    });
    await expect(verifyAccountIdentity(operator, signal())).rejects.toThrow();
  });
  it("projects every role catalog level", async () => {
    vi.mocked(apiRequest).mockImplementation(async (path) =>
      path === "/auth/me"
        ? operator
        : {
            page: 1,
            pageSize: 100,
            total: 1,
            hasNext: false,
            items: [
              {
                ...role(3),
                secret: "private",
                dataScopes: [
                  { resourceKey: "user", scopeType: "self", secret: "private" },
                ],
              },
            ],
          },
    );
    const result = await readAccountRoleCatalog(operator, signal());
    expect(JSON.stringify(result)).not.toContain("private");
    expect(result[0]?.dataScopes).toEqual([
      { resourceKey: "user", scopeType: "self" },
    ]);
  });
  it.each([
    { roleName: null },
    { status: "disabled" },
    { dataScope: "selected" },
    { userCount: -1 },
    { permissionCount: 1.1 },
    { fieldPolicyCount: "3" },
    { dataScopes: [{ resourceKey: "user", scopeType: "unknown" }] },
    {
      dataScopes: [
        { resourceKey: "user", scopeType: "self" },
        { resourceKey: "user", scopeType: "all" },
      ],
    },
  ])("rejects malformed catalog roles or inactive results", async (changes) => {
    vi.mocked(apiRequest).mockImplementation(async (path) =>
      path === "/auth/me"
        ? operator
        : {
            page: 1,
            pageSize: 100,
            total: 1,
            hasNext: false,
            items: [{ ...role(3), ...changes }],
          },
    );
    await expect(readAccountRoleCatalog(operator, signal())).rejects.toThrow();
  });
  it("rechecks identity after the last catalog page", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce({
        page: 1,
        pageSize: 100,
        total: 1,
        hasNext: false,
        items: [role(3)],
      })
      .mockResolvedValueOnce({ ...operator, permissionKeys: [] });
    await expect(readAccountRoleCatalog(operator, signal())).rejects.toThrow();
  });
});
