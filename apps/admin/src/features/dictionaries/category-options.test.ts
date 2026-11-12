import { expect, it, vi } from "vitest";
import {
  readCategoryOptions,
  verifyCategoryField,
} from "@/features/dictionaries/category-options";
import {
  readAllDictionaries,
  type DictionaryRequest,
} from "@/features/dictionaries/dictionary-queries";
import type {
  Dictionary,
  DictionaryUser,
} from "@/features/dictionaries/dictionary-model";
import type { Field } from "@/features/custom-fields/field-model";

const user: DictionaryUser = {
  userId: 7,
  account: "operator",
  nickname: "Operator",
  avatarUrl: null,
  merchant: null,
  menuTree: [],
  roles: [{ roleKey: "custom", roleName: "Custom" }],
  permissionKeys: [
    "management:portal:enter",
    "system:dict:list",
    "system:field:list",
  ],
};
const dictionary: Dictionary = {
  dictType: "test.options",
  dictName: "设施",
  groupKey: "resort",
  status: "active",
  publiclyReadable: false,
  items: [],
};
const field: Field = {
  fieldDefinitionId: 1,
  entityType: "ski_resort",
  fieldKey: "facilities",
  label: "设施",
  dataType: "multi_select",
  groupKey: "basic",
  sortOrder: 0,
  required: false,
  defaultValue: null,
  optionsDictType: dictionary.dictType,
  validation: null,
  searchable: false,
  filterable: false,
  sortable: false,
  isPublic: false,
  status: "active",
  schemaVersion: 1,
  createTime: "2026-11-03T00:00:00Z",
  updateTime: "2026-11-03T00:00:00Z",
};
function request(dicts: Dictionary[], fields: Field[] = [], current = user) {
  return vi.fn(async (path: string) => {
    if (path === "/auth/me") return current;
    const url = new URL(path, "https://example.test");
    const page = Number(url.searchParams.get("page") ?? 1);
    const isDict = url.pathname === "/admin/dictionaries";
    const rows = isDict
      ? dicts
      : fields.filter(
          (item) =>
            item.entityType === url.searchParams.get("entityType") &&
            item.status === "active",
        );
    return {
      page,
      pageSize: 20,
      total: rows.length,
      ...(isDict ? { hasNext: page * 20 < rows.length } : {}),
      items: rows.slice((page - 1) * 20, page * 20),
    };
  }) as ReturnType<typeof vi.fn<DictionaryRequest>> & DictionaryRequest;
}
it("loads dictionary choices after page 1 with no partial catalog", async () => {
  const dicts = Array.from({ length: 23 }, (_, i) => ({
    ...dictionary,
    dictType: `test.options${i}`,
  }));
  const read = request(dicts);
  expect(
    await readAllDictionaries(read, user, new AbortController().signal),
  ).toEqual(dicts);
  expect(
    read.mock.calls.filter(([path]) => path.includes("page=2")),
  ).toHaveLength(1);
});
it.each(["duplicate", "changed total", "disabled"])(
  "rejects %s responses instead of accepting incomplete choices",
  async (kind) => {
    const dicts = Array.from({ length: 21 }, (_, i) => ({
      ...dictionary,
      dictType: `test.options${i}`,
    }));
    if (kind === "duplicate") dicts[20] = dicts[0]!;
    if (kind === "disabled") dicts[0] = { ...dicts[0]!, status: "disabled" };
    const read = request(dicts);
    if (kind === "changed total")
      read
        .mockImplementationOnce(async () => user)
        .mockImplementationOnce(async () => ({
          page: 1,
          pageSize: 20,
          total: 22,
          hasNext: true,
          items: dicts.slice(0, 20),
        }));
    await expect(
      readAllDictionaries(
        read,
        user,
        new AbortController().signal,
        kind === "disabled" ? "active" : undefined,
      ),
    ).rejects.toThrow();
  },
);
it("only offers real fixed categories and enabled choice fields, including later field pages", async () => {
  const fields: Field[] = Array.from({ length: 21 }, (_, i) => ({
    ...field,
    fieldDefinitionId: i + 1,
    fieldKey: `field${i}`,
    dataType: i === 20 ? "single_select" : "text",
  }));
  fields.push(
    {
      ...field,
      fieldDefinitionId: 22,
      dataType: "multi_select",
      optionsDictType: "test.disabled",
    },
    { ...field, fieldDefinitionId: 23, status: "draft" },
  );
  const options = await readCategoryOptions(
    request(
      [
        dictionary,
        { ...dictionary, dictType: "test.disabled", status: "disabled" },
      ],
      fields,
    ),
    user,
    new AbortController().signal,
  );
  expect(options.map((item) => item.dictType)).toEqual([
    "knowledge.article_category",
    "resort.fit_tag",
    dictionary.dictType,
  ]);
  expect(options[2]?.field?.id).toBe(21);
  expect(options[2]?.groupKey).toBe(dictionary.groupKey);
});
it("marks disabled fixed dictionaries unavailable and keeps missing presets configurable", async () => {
  const options = await readCategoryOptions(
    request([
      {
        ...dictionary,
        dictType: "knowledge.article_category",
        status: "disabled",
      },
    ]),
    user,
    new AbortController().signal,
  );
  expect(options[0]?.disabled).toBe(true);
  expect(options[1]).toMatchObject({
    disabled: false,
    dictionary: undefined,
    groupKey: "resort",
  });
});
it("does not query field definitions without their permission", async () => {
  const restricted = {
    ...user,
    permissionKeys: user.permissionKeys.filter(
      (key) => key !== "system:field:list",
    ),
  };
  const read = request([dictionary], [], restricted);
  expect(
    await readCategoryOptions(read, restricted, new AbortController().signal),
  ).toHaveLength(2);
  expect(read.mock.calls.some(([path]) => path.includes("custom-fields"))).toBe(
    false,
  );
});
it("refuses changed identity and aborted reads", async () => {
  await expect(
    readAllDictionaries(
      request([dictionary], [], { ...user, userId: 8 }),
      user,
      new AbortController().signal,
    ),
  ).rejects.toThrow();
  const controller = new AbortController();
  controller.abort();
  const read = request([dictionary]);
  await expect(
    readCategoryOptions(read, user, controller.signal),
  ).rejects.toThrow();
  expect(read).not.toHaveBeenCalled();
});
it("rechecks extension binding before opening its category editor", async () => {
  const option = (
    await readCategoryOptions(
      request([dictionary], [field]),
      user,
      new AbortController().signal,
    )
  )[2]!;
  const read = vi.fn(async (path: string) =>
    path === "/auth/me" ? user : { ...field, optionsDictType: "other.options" },
  ) as DictionaryRequest;
  await expect(
    verifyCategoryField(read, user, option, new AbortController().signal),
  ).rejects.toThrow("所属字段或绑定字典已变化");
});
