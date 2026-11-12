import { describe, expect, it } from "vitest";
import {
  buildResourceScopes,
  type ScopeRow,
} from "@/features/roles/role-resource-scopes";

const catalog = [
  { resourceKey: "resort", label: "滑雪场" },
  { resourceKey: "role", label: "角色" },
];
const row = (patch: Partial<ScopeRow> = {}): ScopeRow => ({
  localKey: "row",
  resourceKey: "resort",
  scopeType: "self",
  selectedIds: "",
  ...patch,
});
const legacy = [
  {
    resourceKey: "legacy",
    scopeType: "selected" as const,
    selectedIds: [4, 2],
  },
];

describe("role resource scope payloads", () => {
  it("adds known resources with independent scopes and sorted ID selections", () => {
    expect(
      buildResourceScopes(
        [
          row(),
          row({
            resourceKey: "role",
            scopeType: "selected",
            selectedIds: " 4, 2 ",
          }),
        ],
        catalog,
        [],
      ),
    ).toEqual([
      { resourceKey: "resort", scopeType: "self" },
      { resourceKey: "role", scopeType: "selected", selectedIds: [2, 4] },
    ]);
  });
  it("refuses duplicate resources", () => {
    expect(() => buildResourceScopes([row(), row()], catalog, [])).toThrow(
      "资源重复",
    );
  });
  it("refuses unknown new resources", () => {
    expect(() =>
      buildResourceScopes([row({ resourceKey: "unknown" })], catalog, []),
    ).toThrow("历史未知资源");
  });
  it("retains historical unknown scopes while accepting a different ID order", () => {
    expect(
      buildResourceScopes(
        [
          row({
            resourceKey: "legacy",
            scopeType: "selected",
            selectedIds: "2, 4",
          }),
        ],
        catalog,
        legacy,
      ),
    ).toEqual([
      { resourceKey: "legacy", scopeType: "selected", selectedIds: [2, 4] },
    ]);
  });
  it("allows removing historical unknown scopes and choosing known resources", () => {
    expect(buildResourceScopes([row()], catalog, legacy)).toEqual([
      { resourceKey: "resort", scopeType: "self" },
    ]);
  });
  it.each([
    { scopeType: "all" as const },
    { scopeType: "selected" as const, selectedIds: "2,4,8" },
    { scopeType: "selected" as const, selectedIds: "2" },
  ])("rejects legacy scope changes: %j", (patch) => {
    expect(() =>
      buildResourceScopes(
        [row({ resourceKey: "legacy", ...patch })],
        catalog,
        legacy,
      ),
    ).toThrow("历史未知资源");
  });
  it.each(["", "x", "0", "1,1", "9007199254740992"])(
    "refuses invalid selected IDs: %s",
    (selectedIds) => {
      expect(() =>
        buildResourceScopes(
          [row({ scopeType: "selected", selectedIds })],
          catalog,
          [],
        ),
      ).toThrow("指定范围 ID");
    },
  );
});
