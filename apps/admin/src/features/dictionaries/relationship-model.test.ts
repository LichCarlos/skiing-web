import { expect, it, vi } from "vitest";
import {
  buildRelationships,
  readRelationshipCatalog,
  type RelationshipCatalog,
} from "@/features/dictionaries/relationship-model";
import type {
  Dictionary,
  DictionaryUser,
} from "@/features/dictionaries/dictionary-model";
import type {
  EntityType,
  Field,
  Group,
} from "@/features/custom-fields/field-model";
import type { DictionaryRequest } from "@/features/dictionaries/dictionary-queries";

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
    "system:field-group:list",
  ],
};
const time = "2026-11-03T00:00:00Z";
const dictionary = (key: string): Dictionary => ({
  dictType: key,
  dictName: key,
  groupKey: "resort",
  status: "active",
  publiclyReadable: false,
  items: [],
});
const field = (id: number, entityType: EntityType = "ski_resort"): Field => ({
  fieldDefinitionId: id,
  entityType,
  fieldKey: `field${id}`,
  label: `字段${id}`,
  dataType: "single_select",
  groupKey: "basic",
  sortOrder: id,
  required: false,
  defaultValue: null,
  optionsDictType: "shared.options",
  validation: null,
  searchable: false,
  filterable: false,
  sortable: false,
  isPublic: false,
  status: "draft",
  schemaVersion: 1,
  createTime: time,
  updateTime: time,
});
const group = (entityType: EntityType): Group => ({
  entityType,
  groupKey: "basic",
  label: "基础",
  sortOrder: 0,
  visibilityRule: null,
  status: "active",
  createTime: time,
  updateTime: time,
});
function catalog(): RelationshipCatalog {
  return {
    dictionaries: [dictionary("shared.options"), dictionary("resort.unbound")],
    fields: [field(1), field(2, "article")],
    groups: [group("ski_resort"), group("article")],
    fieldsReadable: true,
    groupsReadable: true,
  };
}
function reader(source: RelationshipCatalog, current = user) {
  return vi.fn(async (path: string) => {
    if (path === "/auth/me") return current;
    const url = new URL(path, "https://example.test"),
      entity = url.searchParams.get("entityType"),
      page = Number(url.searchParams.get("page"));
    if (url.pathname === "/admin/custom-field-groups")
      return source.groups.filter((item) => item.entityType === entity);
    const dict = url.pathname === "/admin/dictionaries";
    const rows = dict
      ? source.dictionaries
      : source.fields.filter((item) => item.entityType === entity);
    return {
      page,
      pageSize: 20,
      total: rows.length,
      ...(dict ? { hasNext: page * 20 < rows.length } : {}),
      items: rows.slice((page - 1) * 20, page * 20),
    };
  }) as ReturnType<typeof vi.fn<DictionaryRequest>> & DictionaryRequest;
}
it("maps composite entity/group keys and shares one dictionary across entities", () => {
  const graph = buildRelationships(catalog());
  expect(
    graph.nodes.filter((node) => node.key === "shared.options"),
  ).toHaveLength(1);
  expect(graph.edges).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        source: "group:ski_resort:basic",
        target: "field:1",
      }),
      expect.objectContaining({
        source: "group:article:basic",
        target: "field:2",
      }),
      expect.objectContaining({
        source: "field:1",
        target: "dictionary:shared.options",
      }),
      expect.objectContaining({
        source: "field:2",
        target: "dictionary:shared.options",
      }),
    ]),
  );
  expect(new Set(graph.nodes.map((node) => node.id)).size).toBe(
    graph.nodes.length,
  );
});
it("does not infer entity bindings from dictionary GroupKey or key prefix", () => {
  const graph = buildRelationships(catalog());
  expect(
    graph.nodes.some((node) => node.id === "dictionary:resort.unbound"),
  ).toBe(true);
  expect(
    graph.edges.some((edge) => edge.target === "dictionary:resort.unbound"),
  ).toBe(false);
  expect(
    buildRelationships(catalog(), "ski_resort").nodes.some(
      (node) => node.key === "resort.unbound",
    ),
  ).toBe(false);
});
it("represents fixed bindings and missing targets explicitly without dangling edges", () => {
  const graph = buildRelationships(catalog());
  expect(
    graph.nodes.find((node) => node.key === "knowledge.article_category")
      ?.missing,
  ).toBe(true);
  expect(graph.edges).toContainEqual(
    expect.objectContaining({
      source: "builtin:article:category",
      target: "dictionary:knowledge.article_category",
      label: "固定绑定",
    }),
  );
  expect(graph.edges).toContainEqual(
    expect.objectContaining({
      source: "builtin:ski_resort:fitTags",
      target: "dictionary:resort.fit_tag",
      label: "固定绑定",
    }),
  );
  expect(
    graph.edges.every(
      (edge) =>
        graph.nodes.some((node) => node.id === edge.source) &&
        graph.nodes.some((node) => node.id === edge.target),
    ),
  ).toBe(true);
});
it("keeps draft/disabled definitions and missing dictionaries visible for management", () => {
  const source = catalog();
  source.fields[0]!.status = "disabled";
  source.dictionaries = [];
  const graph = buildRelationships(source, "ski_resort");
  expect(graph.nodes.find((node) => node.id === "field:1")?.status).toBe(
    "disabled",
  );
  expect(
    graph.nodes.find((node) => node.key === "shared.options")?.missing,
  ).toBe(true);
  expect(graph.nodes.some((node) => node.entityType === "article")).toBe(false);
});
it("preserves visible fields when group access is absent without inventing a group node", () => {
  const source = catalog();
  source.groups = [];
  source.groupsReadable = false;
  const graph = buildRelationships(source);
  expect(graph.nodes.some((node) => node.kind === "group")).toBe(false);
  expect(graph.edges).toContainEqual(
    expect.objectContaining({
      source: "entity:article",
      target: "field:2",
      label: "分组无读取权限",
    }),
  );
});
it("loads all dictionaries and every field page, including drafts", async () => {
  const source = catalog();
  source.dictionaries = Array.from({ length: 23 }, (_, i) =>
    dictionary(`test.options${i}`),
  );
  source.fields = Array.from({ length: 21 }, (_, i) => field(i + 1));
  const read = reader(source),
    result = await readRelationshipCatalog(
      read,
      user,
      new AbortController().signal,
    );
  expect(result.fields).toHaveLength(21);
  expect(result.dictionaries).toHaveLength(23);
  expect(
    read.mock.calls.filter(([path]) => path.includes("page=2")),
  ).toHaveLength(2);
  expect(
    read.mock.calls.filter(([path]) => path.includes("status=")),
  ).toHaveLength(0);
});
it.each(["system:field:list", "system:field-group:list"])(
  "does not call endpoints without %s permission",
  async (permission) => {
    const current = {
        ...user,
        permissionKeys: user.permissionKeys.filter((key) => key !== permission),
      },
      read = reader(catalog(), current);
    const result = await readRelationshipCatalog(
      read,
      current,
      new AbortController().signal,
    );
    const endpoint =
      permission === "system:field:list"
        ? "/admin/custom-fields"
        : "/admin/custom-field-groups";
    expect(read.mock.calls.some(([path]) => path.startsWith(endpoint))).toBe(
      false,
    );
    expect(
      permission === "system:field:list"
        ? result.fieldsReadable
        : result.groupsReadable,
    ).toBe(false);
  },
);
it.each(["duplicate", "drift", "entity collision"])(
  "rejects %s field catalogs without returning partial data",
  async (kind) => {
    const source = catalog();
    source.fields = Array.from({ length: 21 }, (_, i) => field(i + 1));
    if (kind === "duplicate") source.fields[20] = source.fields[0]!;
    if (kind === "entity collision") source.fields.push(field(1, "article"));
    const read = reader(source);
    if (kind === "drift") {
      const original = read.getMockImplementation()!;
      read.mockImplementation(async (path, options) => {
        const value = await original(path, options);
        if (path.startsWith("/admin/custom-fields?") && path.includes("page=2"))
          return { ...(value as object), total: 22 } as never;
        return value;
      });
    }
    await expect(
      readRelationshipCatalog(read, user, new AbortController().signal),
    ).rejects.toThrow();
  },
);
it("rejects revoked identity and aborts without exposing a catalog", async () => {
  const read = reader(catalog(), { ...user, userId: 8 });
  await expect(
    readRelationshipCatalog(read, user, new AbortController().signal),
  ).rejects.toThrow();
  const controller = new AbortController();
  controller.abort();
  const cancelled = reader(catalog());
  await expect(
    readRelationshipCatalog(cancelled, user, controller.signal),
  ).rejects.toThrow();
  expect(cancelled).not.toHaveBeenCalled();
});
