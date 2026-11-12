import { expect, it, vi } from "vitest";
import {
  saveDictionaryType,
  saveDictionaryItem,
  disableDictionary,
} from "@/features/dictionaries/dictionary-commands";
import {
  readDictionaryDetail,
  type DictionaryRequest,
} from "@/features/dictionaries/dictionary-queries";
import {
  DictionaryWriteGate,
  dictionaryWorkspaceKey,
  type DictionaryUser,
} from "@/features/dictionaries/dictionary-model";
import { DictionaryRecoveryLedger } from "@/features/dictionaries/dictionary-recovery";
const user: DictionaryUser = {
  userId: 7,
  account: "operator",
  nickname: "运营",
  avatarUrl: null,
  merchant: null,
  menuTree: [],
  roles: [{ roleKey: "custom", roleName: "运营" }],
  permissionKeys: [
    "management:portal:enter",
    "system:dict:list",
    "system:dict:create",
  ],
};
const type = {
  dictType: "test.tags",
  dictName: "标签",
  groupKey: "test",
  status: "active",
  publiclyReadable: false,
  items: [],
};
const item = {
  itemId: 3,
  parentId: 2,
  label: "子项",
  value: "child",
  color: null,
  sortOrder: 0,
  isDefault: false,
  status: "active",
  children: [],
};
const body = {
  label: "子项",
  value: "child",
  parentId: 2,
  sortOrder: 0,
  isDefault: false,
};
const signal = () => new AbortController().signal;
function request(value: unknown) {
  return vi.fn(async () => value) as ReturnType<
    typeof vi.fn<DictionaryRequest>
  > &
    DictionaryRequest;
}
it("projects full type receipts and sends existing create/update protocols", async () => {
  const read = request({ ...type, private: "excluded" });
  expect(
    await saveDictionaryType(
      read,
      type.dictType,
      {
        dictType: type.dictType,
        dictName: type.dictName,
        groupKey: type.groupKey,
      },
      false,
      signal(),
    ),
  ).toEqual(type);
  await saveDictionaryType(
    read,
    type.dictType,
    { dictName: "标签" },
    true,
    signal(),
  );
  expect(
    read.mock.calls.map(([path, options]) => [path, options?.method]),
  ).toEqual([
    ["/admin/dictionaries", "POST"],
    ["/admin/dictionaries/test.tags", "PATCH"],
  ]);
});
it.each([
  null,
  {},
  { ...type, dictType: "other" },
  { ...type, publiclyReadable: 1 },
  { ...type, items: null },
])("rejects incomplete/mismatched type receipts", async (value) => {
  await expect(
    saveDictionaryType(
      request(value),
      type.dictType,
      { dictName: "标签" },
      true,
      signal(),
    ),
  ).rejects.toThrow();
});
it("projects a nonroot item subtree with matching descendants and target", async () => {
  const child = { ...item, itemId: 4, parentId: 3, value: "grandchild" };
  const read = request({ ...item, private: "excluded", children: [child] });
  expect(
    await saveDictionaryItem(read, type.dictType, 3, body, signal()),
  ).toEqual({ ...item, children: [child] });
  expect(read.mock.calls[0]).toMatchObject([
    "/admin/dictionaries/test.tags/items/3",
    { method: "PATCH", body },
  ]);
  expect(
    await saveDictionaryItem(
      request(item),
      type.dictType,
      undefined,
      body,
      signal(),
    ),
  ).toEqual(item);
});
it.each([
  null,
  {},
  { ...item, itemId: 9 },
  { ...item, parentId: 1 },
  { ...item, parentId: "2" },
  { ...item, parentId: 3 },
  { ...item, children: [{ ...item, itemId: 2, parentId: 3 }] },
  { ...item, children: [{ ...item, itemId: 4, parentId: 2 }] },
  { ...item, children: [{ ...item, parentId: 3 }] },
  { ...item, status: "published" },
])("rejects malformed/wrong item or subtree receipts", async (value) => {
  await expect(
    saveDictionaryItem(request(value), type.dictType, 3, body, signal()),
  ).rejects.toThrow();
});
it.each([null, {}, { status: "disabled" }, []])(
  "requires an empty disable response",
  async (value) => {
    await expect(
      disableDictionary(request(value), type.dictType, 3, signal()),
    ).rejects.toThrow();
  },
);
it("uses existing DELETE paths and accepts only an empty response", async () => {
  const read = request(undefined);
  await disableDictionary(read, type.dictType, undefined, signal());
  await disableDictionary(read, type.dictType, 3, signal());
  expect(read.mock.calls.map(([p, o]) => [p, o?.method])).toEqual([
    ["/admin/dictionaries/test.tags", "DELETE"],
    ["/admin/dictionaries/test.tags/items/3", "DELETE"],
  ]);
});
it("rejects bad keys/IDs and preaborted operations before transport", async () => {
  const read = request(undefined),
    abort = new AbortController();
  abort.abort();
  await expect(
    disableDictionary(read, "../private", 3, signal()),
  ).rejects.toThrow();
  await expect(
    saveDictionaryItem(read, type.dictType, 0, body, signal()),
  ).rejects.toThrow();
  await expect(
    disableDictionary(read, type.dictType, 3, abort.signal),
  ).rejects.toThrow();
  expect(read).not.toHaveBeenCalled();
});
it("keeps a malformed successful write uncertain across mounted gates", async () => {
  const store = new DictionaryRecoveryLedger(),
    done = vi.fn(),
    read = request({});
  const gate = new DictionaryWriteGate(7, async () => user, vi.fn(), {
    user,
    has: () => store.state(7) !== null,
    begin: (key) => store.begin(7, key),
  });
  gate.activate();
  const run = () =>
    gate.run(
      "system:dict:create",
      async () => body,
      (values) =>
        saveDictionaryItem(read, type.dictType, undefined, values, signal()),
      done,
      type.dictType,
    );
  expect(await run()).toMatchObject({ status: "error", uncertain: true });
  expect(store.state(7)).toEqual({ dictType: type.dictType, inFlight: false });
  expect(await run()).toEqual({ status: "ignored" });
  expect(read).toHaveBeenCalledOnce();
  expect(done).not.toHaveBeenCalled();
});
it.each(["account", "merchant"])(
  "includes %s association in identity isolation",
  async (kind) => {
    const changed =
      kind === "account"
        ? { ...user, account: "different" }
        : { ...user, merchant: { merchantId: 8, businessName: "新商家" } };
    expect(dictionaryWorkspaceKey(changed)).not.toBe(
      dictionaryWorkspaceKey(user),
    );
    let reads = 0;
    const read = vi.fn(async (path: string) =>
      path === "/auth/me" ? (++reads === 1 ? user : changed) : type,
    ) as DictionaryRequest;
    await expect(
      readDictionaryDetail(read, user, type.dictType, signal()),
    ).rejects.toThrow("权限已变化");
  },
);
it("rejects invalid local identity without requesting server state", async () => {
  const read = request(type);
  await expect(
    readDictionaryDetail(
      read,
      { ...user, permissionKeys: [] },
      type.dictType,
      signal(),
    ),
  ).rejects.toThrow();
  expect(read).not.toHaveBeenCalled();
});
