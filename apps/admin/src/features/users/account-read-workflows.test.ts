import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/platform/api";
import {
  readAccountDetail,
  readAccountPage,
  readAccountMutationReview,
} from "@/features/users/user-queries";
import { parseAccountPage } from "@/features/users/user-response";
import {
  operator,
  account,
  deferred,
} from "@/features/users/user-fixtures.test-helper";
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const signal = () => new AbortController().signal;
const page = {
  page: 1,
  pageSize: 20,
  total: 1,
  hasNext: false,
  items: [account],
};
describe("account list and detail reads", () => {
  it("projects a complete page and checks identity at both ends", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce({
        ...page,
        secret: "private",
        items: [{ ...account, passwordHash: "private" }],
      })
      .mockResolvedValueOnce(operator);
    expect(
      await readAccountPage(operator, 1, " snow ", undefined, signal()),
    ).toEqual(page);
    expect(apiRequest).toHaveBeenNthCalledWith(
      2,
      "/admin/users?page=1&pageSize=20&keyword=snow",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(vi.mocked(apiRequest).mock.calls.map((c) => c[0])).toEqual([
      "/auth/me",
      "/admin/users?page=1&pageSize=20&keyword=snow",
      "/auth/me",
    ]);
  });
  it("allows a later empty page without changing total", () => {
    expect(parseAccountPage({ ...page, page: 2, items: [] }, 2, 20)).toEqual({
      ...page,
      page: 2,
      items: [],
    });
  });
  it.each([
    { ...page, page: 2 },
    { ...page, pageSize: 100 },
    { ...page, total: -1 },
    { ...page, total: 0 },
    { ...page, hasNext: true },
    { ...page, items: null },
    { ...page, items: [account, account], total: 2 },
    { ...page, items: [{ ...account, status: "disabled" }] },
    {
      ...page,
      items: [{ ...account, roles: [{ ...account.roles[0], roleName: 12 }] }],
    },
  ])("rejects page, status or nested data mismatches", async (value) => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce(value)
      .mockResolvedValueOnce(operator);
    await expect(
      readAccountPage(operator, 1, "", "active", signal()),
    ).rejects.toThrow();
  });
  it.each(["list", "detail"])(
    "rejects observed revocation after %s response",
    async (kind) => {
      vi.mocked(apiRequest)
        .mockResolvedValueOnce(operator)
        .mockResolvedValueOnce(kind === "list" ? page : account)
        .mockResolvedValueOnce({ ...operator, permissionKeys: [] });
      await expect(
        kind === "list"
          ? readAccountPage(operator, 1, "", undefined, signal())
          : readAccountDetail(operator, 7, signal()),
      ).rejects.toThrow("权限已变化");
    },
  );
  it("validates filters before any identity or account request", async () => {
    await expect(
      readAccountPage(operator, 0, "", undefined, signal()),
    ).rejects.toThrow();
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it("does not recheck or return late data after cancellation", async () => {
    const c = new AbortController(),
      late = deferred<unknown>();
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(operator)
      .mockReturnValueOnce(late.promise);
    const read = readAccountPage(operator, 1, "", undefined, c.signal);
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    c.abort();
    late.resolve(page);
    await expect(read).rejects.toThrow();
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });
  it("does not release an unknown-write review when identity is lost at its end", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce(account)
      .mockResolvedValueOnce({ ...operator, permissionKeys: [] });
    await expect(
      readAccountMutationReview(
        operator,
        [{ action: "roles", userId: 7 }],
        signal(),
      ),
    ).rejects.toThrow();
  });
  it("returns a validated detail only after final identity check", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce(account)
      .mockResolvedValueOnce(operator);
    expect(await readAccountDetail(operator, 7, signal())).toEqual(account);
    expect(apiRequest).toHaveBeenCalledTimes(3);
  });
});
