import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import {
  parseDictionary,
  readDictionaryPage,
  readDictionaryDetail,
  type DictionaryRequest,
} from "@/features/dictionaries/dictionary-queries";
import {
  dictionaryRows,
  dictionaryParents,
  type DictionaryUser,
} from "@/features/dictionaries/dictionary-model";
const user: DictionaryUser = {
  userId: 7,
  account: "operator",
  nickname: "Operator",
  avatarUrl: null,
  merchant: null,
  menuTree: [],
  roles: [{ roleKey: "custom", roleName: "Custom" }],
  permissionKeys: ["management:portal:enter", "system:dict:list"],
};
const item = {
  itemId: 1,
  parentId: null,
  label: "滑雪",
  value: "ski",
  color: null,
  sortOrder: 0,
  isDefault: false,
  status: "active",
  children: [] as unknown[],
};
const dictionary = {
  dictType: "resort.tags",
  dictName: "雪场标签",
  groupKey: "resort",
  status: "active",
  publiclyReadable: false,
  items: [item],
};
const page = {
  page: 1,
  pageSize: 20,
  total: 1,
  hasNext: false,
  items: [dictionary],
};
const signal = () => new AbortController().signal;
function request(value: unknown, current = user) {
  let reads = 0;
  return vi.fn(async (path: string) =>
    path === "/auth/me" ? (++reads === 1 ? user : current) : value,
  ) as ReturnType<typeof vi.fn<DictionaryRequest>> & DictionaryRequest;
}
describe("dictionary reads and review boundaries", () => {
  it("projects full type/tree fields, stripping unrelated response data", () => {
    expect(
      parseDictionary({
        ...dictionary,
        private: "secret",
        items: [
          {
            ...item,
            private: "secret",
            children: [{ ...item, itemId: 2, parentId: 1 }],
          },
        ],
      }),
    ).toEqual({
      ...dictionary,
      items: [{ ...item, children: [{ ...item, itemId: 2, parentId: 1 }] }],
    });
  });
  it.each([
    { ...dictionary, dictType: undefined },
    { ...dictionary, publiclyReadable: "false" },
    { ...dictionary, status: "draft" },
    { ...dictionary, items: [{ ...item, itemId: 0 }] },
    { ...dictionary, items: [item, item] },
    {
      ...dictionary,
      items: [{ ...item, children: [{ ...item, itemId: 2, parentId: null }] }],
    },
    {
      ...dictionary,
      items: [{ ...item, children: [{ ...item, itemId: 1, parentId: 1 }] }],
    },
    { ...dictionary, items: [{ ...item, children: null }] },
    { ...dictionary, items: [{ ...item, isDefault: 1 }] },
    { ...dictionary, items: [{ ...item, sortOrder: 1.2 }] },
    { ...dictionary, items: [{ ...item, color: 123 }] },
  ])("rejects malformed or inconsistent dictionary trees", (value) =>
    expect(() => parseDictionary(value)).toThrow("字典数据不匹配"),
  );
  it("handles a deep hierarchy without recursive rendering helpers or parent traversal", () => {
    let nodes: unknown[] = [];
    for (let id = 6000; id > 0; id--)
      nodes = [
        {
          ...item,
          itemId: id,
          parentId: id === 1 ? null : id - 1,
          children: nodes,
        },
      ];
    const value = parseDictionary({ ...dictionary, items: nodes });
    const rows = dictionaryRows(value.items);
    expect(rows).toHaveLength(6000);
    expect(rows[5999]?.depth).toBe(5999);
    expect(dictionaryParents(value.items, 1)).toEqual([]);
  });
  it("verifies identity around a no-store request with the same cancellation signal", async () => {
    const read = request(page),
      abort = signal();
    expect(
      await readDictionaryPage(read, user, 1, undefined, undefined, abort),
    ).toEqual(page);
    expect(read.mock.calls.map(([path]) => path)).toEqual([
      "/auth/me",
      "/admin/dictionaries?page=1&pageSize=20",
      "/auth/me",
    ]);
    for (const [, options] of read.mock.calls)
      expect(options).toMatchObject({ signal: abort, cache: "no-store" });
  });
  it.each(["account", "role", "grant"])(
    "refuses a late %s change",
    async (kind) => {
      const current =
        kind === "account"
          ? { ...user, userId: 8 }
          : kind === "role"
            ? { ...user, roles: [{ roleKey: "other", roleName: "Other" }] }
            : {
                ...user,
                permissionKeys: [...user.permissionKeys, "other:grant"],
              };
      await expect(
        readDictionaryDetail(
          request(dictionary, current),
          user,
          "resort.tags",
          signal(),
        ),
      ).rejects.toThrow("权限已变化");
    },
  );
  it("does not query after a pre-read identity change", async () => {
    const read = vi.fn(async () => ({
      ...user,
      userId: 8,
    })) as DictionaryRequest;
    await expect(
      readDictionaryDetail(read, user, "resort.tags", signal()),
    ).rejects.toThrow();
    expect(read).toHaveBeenCalledOnce();
  });
  it.each([
    { ...page, page: 2 },
    { ...page, pageSize: 100 },
    { ...page, total: 2 },
    { ...page, hasNext: true },
    { ...page, total: -1 },
    { ...page, total: 2, items: [dictionary, dictionary] },
  ])("rejects malformed pagination and duplicate type keys", async (value) => {
    await expect(
      readDictionaryPage(
        request(value),
        user,
        1,
        undefined,
        undefined,
        signal(),
      ),
    ).rejects.toThrow();
  });
  it("checks filters and the exact requested detail key", async () => {
    await expect(
      readDictionaryPage(
        request(page),
        user,
        1,
        "knowledge",
        undefined,
        signal(),
      ),
    ).rejects.toThrow();
    await expect(
      readDictionaryPage(
        request(page),
        user,
        1,
        undefined,
        "disabled",
        signal(),
      ),
    ).rejects.toThrow();
    await expect(
      readDictionaryDetail(request(dictionary), user, "other.tags", signal()),
    ).rejects.toThrow();
    expect(
      await readDictionaryDetail(
        request(dictionary),
        user,
        "resort.tags",
        signal(),
      ),
    ).toEqual(dictionary);
  });
  it("rechecks identity before treating a 404 as a reviewable missing target", async () => {
    const error = new ApiError("private", {
      status: 404,
      code: 404,
      traceId: "test",
    });
    let count = 0;
    const read = vi.fn(async (path: string) => {
      if (path !== "/auth/me") throw error;
      return ++count === 1 ? user : { ...user, userId: 8 };
    }) as DictionaryRequest;
    await expect(
      readDictionaryDetail(read, user, "resort.tags", signal()),
    ).rejects.toThrow("权限已变化");
    expect(read).toHaveBeenCalledTimes(3);
    const stable = vi.fn(async (path: string) => {
      if (path !== "/auth/me") throw error;
      return user;
    }) as DictionaryRequest;
    await expect(
      readDictionaryDetail(stable, user, "resort.tags", signal()),
    ).rejects.toBe(error);
    expect(stable).toHaveBeenCalledTimes(3);
  });
  it("allows empty later pages and rejects invalid request parameters without HTTP", async () => {
    const value = {
      page: 2,
      pageSize: 20,
      total: 1,
      hasNext: false,
      items: [],
    };
    expect(
      await readDictionaryPage(
        request(value),
        user,
        2,
        undefined,
        undefined,
        signal(),
      ),
    ).toEqual(value);
    const read = request(null);
    expect(() =>
      readDictionaryPage(read, user, 0, undefined, undefined, signal()),
    ).toThrow();
    expect(() =>
      readDictionaryDetail(read, user, "../unsafe", signal()),
    ).toThrow();
    expect(() =>
      readDictionaryPage(read, user, 1, "unsafe/key", undefined, signal()),
    ).toThrow();
    expect(read).not.toHaveBeenCalled();
  });
  it("does not publish after cancellation during a read", async () => {
    const abort = new AbortController(),
      read = vi.fn(async (path: string) => {
        if (path === "/auth/me") return user;
        abort.abort();
        return dictionary;
      }) as DictionaryRequest;
    await expect(
      readDictionaryDetail(read, user, "resort.tags", abort.signal),
    ).rejects.toThrow();
    expect(read).toHaveBeenCalledTimes(2);
  });
});
