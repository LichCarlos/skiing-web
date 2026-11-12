import { expect, it } from "vitest";
import {
  parseNodeDrag,
  resolveNodeDrop,
} from "@/features/custom-fields/node-drag";
import type { RelationshipNode } from "@/features/dictionaries/relationship-model";
const entity: RelationshipNode = {
  id: "entity:article",
  kind: "entity",
  label: "文章",
  key: "article",
  entityType: "article",
  column: 0,
};
const group: RelationshipNode = {
  ...entity,
  id: "group:article:basic",
  kind: "group",
  key: "basic",
  group: {
    entityType: "article",
    groupKey: "basic",
    label: "基础",
    status: "active",
    sortOrder: 0,
    visibilityRule: null,
    createTime: "2026-11-03T00:00:00Z",
    updateTime: "2026-11-03T00:00:00Z",
  },
};
const dict: RelationshipNode = {
  id: "dictionary:shared.options",
  kind: "dictionary",
  key: "shared.options",
  label: "共享选项",
  column: 3,
  dictionary: {
    dictType: "shared.options",
    dictName: "共享选项",
    groupKey: "knowledge",
    status: "active",
    publiclyReadable: false,
    items: [],
  },
};
it("accepts only known creation payloads, never code or arbitrary node identities", () => {
  expect(parseNodeDrag("field")).toBe("field");
  for (const value of ["", "entity", "field:7", '{"kind":"field"}', "<script>"])
    expect(parseNodeDrag(value)).toBeNull();
});
it("uses the dropped entity over the current filter", () => {
  expect(resolveNodeDrop("group", entity, "ski_resort")).toEqual({
    kind: "group",
    entityType: "article",
  });
});
it("prefills the composite entity/group reference from an active target", () => {
  expect(resolveNodeDrop("field", group, "ski_resort")).toEqual({
    kind: "field",
    entityType: "article",
    groupKey: "basic",
  });
});
it("accepts blank canvas creation within a selected entity", () => {
  expect(resolveNodeDrop("field", undefined, "dynamic")).toEqual({
    kind: "field",
    entityType: "dynamic",
  });
});
it.each(["group", "field"] as const)(
  "requires a specific entity for %s on a global blank canvas",
  (kind) => {
    expect(() => resolveNodeDrop(kind, undefined, undefined)).toThrow(
      "具体业务",
    );
  },
);
it("rejects disabled groups and nested groups", () => {
  expect(() => resolveNodeDrop("group", group, "article")).toThrow(
    "不支持嵌套",
  );
  expect(() =>
    resolveNodeDrop(
      "field",
      { ...group, group: { ...group.group!, status: "disabled" } },
      "article",
    ),
  ).toThrow("停用");
});
it("new items require a real, active dictionary target", () => {
  expect(resolveNodeDrop("item", dict, undefined)).toEqual({
    kind: "item",
    dictType: "shared.options",
  });
  expect(() =>
    resolveNodeDrop(
      "item",
      { ...dict, dictionary: { ...dict.dictionary!, status: "disabled" } },
      undefined,
    ),
  ).toThrow("已启用");
  expect(() =>
    resolveNodeDrop(
      "item",
      { ...dict, dictionary: undefined, missing: true },
      undefined,
    ),
  ).toThrow("已启用");
  expect(() => resolveNodeDrop("item", entity, undefined)).toThrow();
});
it("dictionary creation captures classification context without claiming a binding", () => {
  expect(resolveNodeDrop("dictionary", group, undefined)).toEqual({
    kind: "dictionary",
    entityType: "article",
  });
  expect(resolveNodeDrop("dictionary", undefined, undefined)).toEqual({
    kind: "dictionary",
    entityType: undefined,
  });
});
it.each(["field", "group", "dictionary"] as const)(
  "rejects dropping %s on a dictionary instead of an entity/group",
  (kind) => {
    expect(() => resolveNodeDrop(kind, dict, "article")).toThrow();
  },
);
