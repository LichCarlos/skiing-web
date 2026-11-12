import { expect, it, vi } from "vitest";
import {
  parseField,
  parseFieldGroup,
  parseFieldReceipt,
  parseGroupReceipt,
} from "@/features/custom-fields/field-responses";
import {
  readFieldDetail,
  readFieldPage,
  readFieldGroups,
  type FieldRequest,
} from "@/features/custom-fields/field-queries";
import {
  FieldWriteGate,
  workspaceKey,
  type User,
} from "@/features/custom-fields/field-model";
const field = {
  fieldDefinitionId: 3,
  entityType: "article",
  fieldKey: "note",
  label: "备注",
  dataType: "text",
  groupKey: "basic",
  sortOrder: 0,
  required: false,
  defaultValue: null,
  optionsDictType: null,
  validation: null,
  searchable: false,
  filterable: false,
  sortable: false,
  isPublic: false,
  status: "draft",
  schemaVersion: 1,
  createTime: "2026-11-03T00:00:00Z",
  updateTime: "2026-11-03T00:00:00Z",
};
const group = {
  entityType: "article",
  groupKey: "basic",
  label: "基本",
  sortOrder: 0,
  visibilityRule: null,
  status: "active",
  createTime: field.createTime,
  updateTime: field.updateTime,
};
const user: User = {
  userId: 7,
  account: "operator",
  nickname: "运营",
  avatarUrl: null,
  roles: [{ roleKey: "custom", roleName: "运营" }],
  merchant: null,
  menuTree: [],
  permissionKeys: [
    "management:portal:enter",
    "system:field:list",
    "system:field:create",
  ],
};
const signal = () => new AbortController().signal;
it.each([
  { label: " " },
  { label: 3 },
  { dataType: "object" },
  { required: "false" },
  { isPublic: 1 },
  { filterable: null },
  { searchable: undefined },
  { sortable: [] },
  { sortOrder: -1 },
  { sortOrder: 1.2 },
  { sortOrder: 2147483648 },
  { groupKey: "../basic" },
  { optionsDictType: 3 },
  { validation: [] },
  { validation: false },
  { defaultValue: undefined },
  { defaultValue: NaN },
  { defaultValue: { a: Infinity } },
  { defaultValue: { a: undefined } },
  { defaultValue: new Date() },
  { defaultValue: () => true },
  { createTime: "bad" },
  { updateTime: null },
  { updateTime: "2026-11-02T00:00:00Z" },
  { schemaVersion: 0 },
  { fieldDefinitionId: 1.5 },
])("rejects malformed field properties %o", (change) => {
  expect(() => parseField({ ...field, ...change }, "article")).toThrow(
    "字段数据不匹配",
  );
});
it.each([
  { label: "" },
  { sortOrder: -1 },
  { status: "draft" },
  { visibilityRule: [] },
  { visibilityRule: { bad: Infinity } },
  { createTime: "yesterday" },
  { updateTime: "2026-11-02T00:00:00Z" },
])("rejects malformed group properties %o", (change) => {
  expect(() => parseFieldGroup({ ...group, ...change }, "article")).toThrow();
});
it.each([
  null,
  false,
  0,
  "",
  [false, 0, null, { value: "资料" }],
  { min: 0, nested: [false, null] },
])("copies every stored JSON shape %j", (defaultValue) => {
  const input = { ...field, defaultValue, privateExtra: "secret" };
  const parsed = parseField(input, "article");
  expect(parsed).toEqual({ ...field, defaultValue });
  expect(parsed).not.toBe(input);
  if (defaultValue && typeof defaultValue === "object")
    expect(parsed.defaultValue).not.toBe(defaultValue);
});
it("copies JSON dictionaries safely, including reserved property names", () => {
  const validation = JSON.parse(
    '{"__proto__":{"polluted":true},"maxLength":10}',
  ) as Record<string, unknown>;
  const parsed = parseField({ ...field, validation }, "article");
  expect(parsed.validation).toEqual(validation);
  expect(parsed.validation).not.toBe(validation);
  expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  const result = parseFieldGroup(
    {
      ...group,
      visibilityRule: { nested: [false, 0, null] },
      metadata: "private",
    },
    "article",
  );
  expect(result).toEqual({
    ...group,
    visibilityRule: { nested: [false, 0, null] },
  });
});
it("rejects cyclic JSON and sparse arrays instead of silently dropping values", () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  for (const defaultValue of [circular, Array(2)])
    expect(() => parseField({ ...field, defaultValue }, "article")).toThrow();
});
it.each([
  { fieldDefinitionId: 4 },
  { fieldKey: "wrong" },
  { schemaVersion: 2 },
  { status: "active" as const },
])("matches write receipt against the original target %o", (expected) => {
  expect(() => parseFieldReceipt(field, "article", expected)).toThrow();
});
it("projects valid command receipts and verifies composite group keys", () => {
  expect(
    parseFieldReceipt({ ...field, extra: "secret" }, "article", {
      fieldDefinitionId: 3,
      fieldKey: "note",
      schemaVersion: 1,
      status: "draft",
    }),
  ).toEqual(field);
  expect(parseGroupReceipt(group, "article", "basic")).toEqual(group);
  expect(() => parseGroupReceipt(group, "article", "other")).toThrow();
});
it("projects whole pages and groups without preserving unknown envelope fields", async () => {
  const withGroup = {
    ...user,
    permissionKeys: [...user.permissionKeys, "system:field-group:list"],
  };
  const request = vi.fn(async (path: string) =>
    path === "/auth/me"
      ? withGroup
      : path.includes("custom-field-groups")
        ? [{ ...group, secret: true }]
        : {
            page: 1,
            pageSize: 20,
            total: 1,
            items: [{ ...field, secret: true }],
            metadata: "private",
          },
  ) as FieldRequest;
  expect(
    await readFieldPage(request, withGroup, "article", 1, undefined, signal()),
  ).toEqual({ page: 1, pageSize: 20, total: 1, items: [field] });
  expect(
    await readFieldGroups(request, withGroup, "article", signal()),
  ).toEqual([group]);
});
it.each([
  { ...user, account: "other" },
  { ...user, merchant: { merchantId: 9, businessName: "业务" } },
])(
  "isolates account/merchant identity even when IDs and grants match",
  async (changed) => {
    let reads = 0;
    const request = vi.fn(async (path: string) =>
      path === "/auth/me" ? (++reads === 1 ? user : changed) : field,
    ) as FieldRequest;
    expect(workspaceKey(changed, "article")).not.toBe(
      workspaceKey(user, "article"),
    );
    await expect(
      readFieldDetail(request, user, "article", 3, signal()),
    ).rejects.toThrow("权限已变化");
  },
);
it("rejects malformed local identity before form preparation and network", async () => {
  const invalid = { ...user, merchant: undefined } as unknown as User;
  const request = vi.fn() as FieldRequest;
  await expect(
    readFieldDetail(request, invalid, "article", 3, signal()),
  ).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
  const prepare = vi.fn(async () => 1),
    write = vi.fn();
  const gate = new FieldWriteGate(invalid, async () => user, vi.fn());
  gate.activate();
  expect(
    await gate.run("system:field:create", prepare, write, vi.fn()),
  ).toMatchObject({ status: "error", uncertain: false });
  expect(prepare).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
});
it("suspending during preparation cannot send a write after reactivation", async () => {
  let resolve!: (n: number) => void;
  const prepared = new Promise<number>((r) => {
    resolve = r;
  });
  const verify = vi.fn(async () => user),
    write = vi.fn();
  const gate = new FieldWriteGate(user, verify, vi.fn());
  gate.activate();
  const old = gate.run("system:field:create", () => prepared, write, vi.fn());
  gate.dispose();
  gate.activate();
  resolve(1);
  expect(await old).toEqual({ status: "ignored" });
  expect(verify).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
  expect(
    await gate.run("system:field:create", async () => 2, write, vi.fn()),
  ).toEqual({ status: "success" });
});
it("invalid successful receipts remain unknown and block duplicate writes", async () => {
  const gate = new FieldWriteGate(user, async () => user, vi.fn());
  gate.activate();
  const write = vi.fn(async () =>
    parseFieldReceipt({ ...field, schemaVersion: 2 }, "article", {
      schemaVersion: 1,
    }),
  );
  expect(
    await gate.run("system:field:create", async () => 1, write, vi.fn()),
  ).toMatchObject({ status: "error", uncertain: true });
  expect(
    await gate.run("system:field:create", async () => 1, write, vi.fn()),
  ).toEqual({ status: "ignored" });
  expect(write).toHaveBeenCalledOnce();
});
