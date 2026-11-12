import { describe, expect, it, vi } from "vitest";
import {
  readFieldPage,
  readFieldGroups,
  readFieldDetail,
  readFieldGroupDetail,
  type FieldRequest,
} from "@/features/custom-fields/field-queries";
import type { User, Field, Group } from "@/features/custom-fields/field-model";
const user: User = {
  userId: 7,
  account: "operator",
  nickname: "Operator",
  avatarUrl: null,
  merchant: null,
  menuTree: [],
  roles: [{ roleKey: "custom", roleName: "Custom" }],
  permissionKeys: [
    "management:portal:enter",
    "system:field:list",
    "system:field-group:list",
  ],
};
const field: Field = {
  fieldDefinitionId: 3,
  entityType: "ski_resort",
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
  status: "active",
  schemaVersion: 1,
  createTime: "2026-11-03T00:00:00Z",
  updateTime: "2026-11-03T00:00:00Z",
};
const group: Group = {
  entityType: "ski_resort",
  groupKey: "basic",
  label: "基本",
  sortOrder: 0,
  visibilityRule: null,
  status: "active",
  createTime: field.createTime,
  updateTime: field.updateTime,
};
const page = { page: 1, pageSize: 20, total: 1, items: [field] };
function request(value: unknown, current: User = user) {
  let identities = 0;
  return vi.fn(async (path: string) =>
    path === "/auth/me" ? (++identities === 1 ? user : current) : value,
  ) as ReturnType<typeof vi.fn<FieldRequest>> & FieldRequest;
}
function signal() {
  return new AbortController().signal;
}
describe("field reads used for editing and explicit result review", () => {
  it("checks identity before and after a read and keeps no-store and the same signal", async () => {
    const read = request(page),
      abort = signal();
    expect(
      await readFieldPage(read, user, "ski_resort", 1, undefined, abort),
    ).toEqual(page);
    expect(read.mock.calls.map(([path]) => path)).toEqual([
      "/auth/me",
      "/admin/custom-fields?entityType=ski_resort&page=1&pageSize=20",
      "/auth/me",
    ]);
    for (const [, options] of read.mock.calls)
      expect(options).toMatchObject({ signal: abort, cache: "no-store" });
  });
  it.each(["account", "role", "grant"])(
    "rejects a late %s change before publishing the review",
    async (kind) => {
      const current =
        kind === "account"
          ? { ...user, userId: 8 }
          : kind === "role"
            ? { ...user, roles: [{ roleKey: "new", roleName: "New" }] }
            : {
                ...user,
                permissionKeys: [...user.permissionKeys, "other:action"],
              };
      const read = request(page, current);
      await expect(
        readFieldPage(read, user, "ski_resort", 1, undefined, signal()),
      ).rejects.toThrow("权限已变化");
    },
  );
  it("does not read fields after a pre-read identity change", async () => {
    const read = vi.fn(async () => ({ ...user, userId: 8 })) as FieldRequest;
    await expect(
      readFieldPage(read, user, "ski_resort", 1, undefined, signal()),
    ).rejects.toThrow();
    expect(read).toHaveBeenCalledOnce();
  });
  it("rejects revoked group read access before requesting the group directory", async () => {
    const current = {
      ...user,
      permissionKeys: user.permissionKeys.filter(
        (key) => key !== "system:field-group:list",
      ),
    };
    const read = vi.fn(async () => current) as FieldRequest;
    await expect(
      readFieldGroups(read, current, "ski_resort", signal()),
    ).rejects.toThrow("查询权限已变化");
    expect(read).toHaveBeenCalledOnce();
  });
  it.each([
    { ...page, page: 2 },
    { ...page, pageSize: 100 },
    { ...page, total: -1 },
    { ...page, total: 2 },
    { ...page, items: [field, field], total: 2 },
    { ...page, items: [{ ...field, entityType: "article" }] },
    { ...page, items: [{ ...field, fieldDefinitionId: 0 }] },
    { ...page, items: [{ ...field, schemaVersion: 0 }] },
    { ...page, items: [{ ...field, status: "unknown" }] },
    { ...page, items: [{ ...field, fieldKey: undefined }] },
  ])(
    "rejects malformed, duplicate or mismatched field pages",
    async (value) => {
      await expect(
        readFieldPage(
          request(value),
          user,
          "ski_resort",
          1,
          undefined,
          signal(),
        ),
      ).rejects.toThrow("字段数据不匹配");
    },
  );
  it("rejects records outside the requested status", async () => {
    await expect(
      readFieldPage(request(page), user, "ski_resort", 1, "draft", signal()),
    ).rejects.toThrow();
  });
  it("accepts a now-empty later page so the operator can return to the first page", async () => {
    const value = { page: 2, pageSize: 20, total: 1, items: [] };
    expect(
      await readFieldPage(
        request(value),
        user,
        "ski_resort",
        2,
        undefined,
        signal(),
      ),
    ).toEqual(value);
  });
  it.each([0, 1.5, 2147483647])(
    "refuses invalid or overflowing page %i before network",
    async (page) => {
      const read = request(null);
      expect(() =>
        readFieldPage(read, user, "ski_resort", page, undefined, signal()),
      ).toThrow();
      expect(read).not.toHaveBeenCalled();
    },
  );
  it("validates the requested detail ID and entity rather than opening a different field", async () => {
    await expect(
      readFieldDetail(
        request({ ...field, fieldDefinitionId: 4 }),
        user,
        "ski_resort",
        3,
        signal(),
      ),
    ).rejects.toThrow();
    await expect(
      readFieldDetail(
        request({ ...field, entityType: "article" }),
        user,
        "ski_resort",
        3,
        signal(),
      ),
    ).rejects.toThrow();
    expect(
      await readFieldDetail(request(field), user, "ski_resort", 3, signal()),
    ).toEqual(field);
  });
  it("rejects group lists with wrong entity, duplicate keys or invalid status", async () => {
    for (const value of [
      [{ ...group, entityType: "article" }],
      [group, group],
      [{ ...group, status: "draft" }],
      [{ ...group, groupKey: undefined }],
      null,
    ])
      await expect(
        readFieldGroups(request(value), user, "ski_resort", signal()),
      ).rejects.toThrow();
    expect(
      await readFieldGroups(request([group]), user, "ski_resort", signal()),
    ).toEqual([group]);
  });
  it("matches the full group composite key and rejects unsafe keys before requesting", async () => {
    await expect(
      readFieldGroupDetail(
        request({ ...group, groupKey: "other" }),
        user,
        "ski_resort",
        "basic",
        signal(),
      ),
    ).rejects.toThrow();
    const read = request(group);
    expect(() =>
      readFieldGroupDetail(read, user, "ski_resort", "../basic", signal()),
    ).toThrow();
    expect(read).not.toHaveBeenCalled();
    expect(
      await readFieldGroupDetail(read, user, "ski_resort", "basic", signal()),
    ).toEqual(group);
  });
  it("does not request or publish when aborted before or during the data read", async () => {
    const first = new AbortController();
    first.abort();
    const read = request(page);
    await expect(
      readFieldPage(read, user, "ski_resort", 1, undefined, first.signal),
    ).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
    const second = new AbortController();
    const next = vi.fn(async (path: string) => {
      if (path === "/auth/me") return user;
      second.abort();
      return page;
    }) as FieldRequest;
    await expect(
      readFieldPage(next, user, "ski_resort", 1, undefined, second.signal),
    ).rejects.toThrow();
    expect(next).toHaveBeenCalledTimes(2);
  });
});
