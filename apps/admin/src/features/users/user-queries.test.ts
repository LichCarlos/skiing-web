import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/platform/api";
import {
  readAccountRoleCatalog,
  readAccountTarget,
  verifyAccountIdentity,
  readAccountMutationReview,
} from "@/features/users/user-queries";
import {
  operator,
  role,
  account,
  deferred,
} from "@/features/users/user-fixtures.test-helper";
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const signal = () => new AbortController().signal;
const page = (number: number, items = [role(3)], hasNext = false) => ({
  page: number,
  pageSize: 100,
  items,
  hasNext,
  total: (number - 1) * 100 + items.length + (hasNext ? 100 : 0),
});
describe("account reads", () => {
  it("loads more than 100 scoped active roles and forwards no-store and cancellation", async () => {
    const s = signal(),
      first = Array.from({ length: 100 }, (_, i) => role(i + 1));
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce(page(1, first, true))
      .mockResolvedValueOnce(page(2, [role(101)]))
      .mockResolvedValueOnce(operator);
    expect(await readAccountRoleCatalog(operator, s)).toHaveLength(101);
    expect(apiRequest).toHaveBeenNthCalledWith(1, "/auth/me", {
      signal: s,
      cache: "no-store",
    });
    expect(apiRequest).toHaveBeenNthCalledWith(
      3,
      "/admin/roles?page=2&pageSize=100&status=active",
      { signal: s, cache: "no-store" },
    );
  });
  it("does not request a catalog without role:list", async () => {
    await expect(
      readAccountRoleCatalog(
        {
          ...operator,
          permissionKeys: operator.permissionKeys.filter(
            (k) => k !== "system:role:list",
          ),
        },
        signal(),
      ),
    ).rejects.toThrow();
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it.each([
    { ...operator, userId: 9 },
    { ...operator, permissionKeys: [] },
    { ...operator, roles: [{ roleKey: "another", roleName: "其他" }] },
  ])(
    "rejects an identity change before fetching role data",
    async (current) => {
      vi.mocked(apiRequest).mockResolvedValue(current);
      await expect(
        readAccountRoleCatalog(operator, signal()),
      ).rejects.toThrow();
      expect(apiRequest).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    page(2),
    { ...page(1), pageSize: 20 },
    page(1, [], true),
    page(1, [role(0)]),
    page(1, [role(2147483648)]),
    page(1, [role(3), role(3)]),
  ])("rejects malformed or nonprogressing role pagination", async (result) => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce(result);
    await expect(readAccountRoleCatalog(operator, signal())).rejects.toThrow();
  });
  it("rejects cross-page duplicates instead of returning a partial catalog", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce(page(1, [role(3)], true))
      .mockResolvedValueOnce(page(2, [role(3)]));
    await expect(readAccountRoleCatalog(operator, signal())).rejects.toThrow();
  });
  it("fails the whole catalog on later page failure", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce(page(1, [role(3)], true))
      .mockRejectedValueOnce(new Error("network"));
    await expect(readAccountRoleCatalog(operator, signal())).rejects.toThrow(
      "network",
    );
  });
  it("does not start another request after cancellation even if transport resolves late", async () => {
    const controller = new AbortController(),
      late = deferred<ReturnType<typeof page>>();
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(operator)
      .mockReturnValueOnce(late.promise);
    const read = readAccountRoleCatalog(operator, controller.signal);
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    controller.abort();
    late.resolve(page(1, [role(3)], true));
    await expect(read).rejects.toThrow();
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });
  it.each([0, -1, 1.5, 2147483648])(
    "rejects invalid target %s before request",
    async (id) => {
      await expect(readAccountTarget(id, signal())).rejects.toThrow();
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
  it("reads the exact target and refuses mismatched response", async () => {
    const s = signal();
    vi.mocked(apiRequest).mockResolvedValue(account);
    expect(await readAccountTarget(7, s)).toEqual(account);
    expect(apiRequest).toHaveBeenCalledWith("/admin/users/7", {
      signal: s,
      cache: "no-store",
    });
    await expect(readAccountTarget(8, s)).rejects.toThrow();
  });
  it("does not start a target read after identity request is aborted", async () => {
    const controller = new AbortController(),
      late = deferred<typeof operator>();
    vi.mocked(apiRequest).mockReturnValue(late.promise);
    const read = verifyAccountIdentity(operator, controller.signal).then(() =>
      readAccountTarget(7, controller.signal),
    );
    controller.abort();
    late.resolve(operator);
    await expect(read).rejects.toThrow();
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
});
describe("unknown write target review", () => {
  it("rereads each target with a fresh identity and renders only safe summary fields", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce({ ...account, passwordHash: "private" })
      .mockResolvedValueOnce(account)
      .mockResolvedValueOnce(operator);
    const result = await readAccountMutationReview(
      operator,
      [
        { action: "status", userId: 7 },
        { action: "roles", userId: 7 },
      ],
      signal(),
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toContain("snow（7）");
    expect(result.join()).not.toContain("private");
  });
  it("finds a create result by normalized exact account, not a substring match", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce({
        ...page(1),
        total: 2,
        items: [{ ...account, userId: 8, account: "snow-2" }, account],
      })
      .mockResolvedValueOnce(operator);
    expect(
      (
        await readAccountMutationReview(
          operator,
          [{ action: "create", account: "snow" }],
          signal(),
        )
      )[0],
    ).toContain("snow（7）");
  });
  it("never equates invisible or absent accounts to confirmed creation failure", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce({ ...page(1), total: 0, items: [] })
      .mockResolvedValueOnce(operator);
    expect(
      (
        await readAccountMutationReview(
          operator,
          [{ action: "create", account: "snow" }],
          signal(),
        )
      )[0],
    ).toContain("不能据此确认创建失败");
  });
  it.each([
    { ...page(1), items: [], hasNext: true },
    { ...page(2), items: [account] },
    { ...page(1), items: [account, account] },
  ])(
    "rejects incomplete or ambiguous create result queries",
    async (result) => {
      vi.mocked(apiRequest)
        .mockResolvedValueOnce(operator)
        .mockResolvedValueOnce(result);
      await expect(
        readAccountMutationReview(
          operator,
          [{ action: "create", account: "snow" }],
          signal(),
        ),
      ).rejects.toThrow();
    },
  );
  it("keeps recovery blocked when target lookup fails", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(operator)
      .mockRejectedValueOnce(new Error("invisible"));
    await expect(
      readAccountMutationReview(
        operator,
        [{ action: "status", userId: 7 }],
        signal(),
      ),
    ).rejects.toThrow();
  });
});
