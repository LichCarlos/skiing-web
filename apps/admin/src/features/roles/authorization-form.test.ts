import { describe, expect, it } from "vitest";
import type { components } from "@common/api-contracts/openapi";
import {
  buildAuthorizationBody,
  permissionTreeIds,
  reconcilePermissionSelection,
  type AuthorizationSnapshot,
  type FieldPolicyRow,
} from "@/features/roles/authorization-form";
const previous: AuthorizationSnapshot = {
  roleId: 7,
  roleKey: "editor",
  roleName: "编辑",
  status: "active",
  permissionIds: [99],
  dataScopes: [],
  fieldPolicies: [],
};
const policy: FieldPolicyRow = {
  localKey: "local",
  entityType: "article",
  fieldKey: "intro",
  canRead: true,
  canWrite: false,
};
const node = (id: number): components["schemas"]["PermissionNodeVO"] => ({
  permissionId: id,
  parentId: null,
  permissionKey: `key:${id}`,
  permissionName: "目录",
  permissionType: "menu",
  route: null,
  icon: null,
  children: [],
});
describe("atomic role authorization payload", () => {
  it("deduplicates orphans returned by Tree while applying only explicit known checks", () => {
    const known = new Set([1, 2]);
    expect(
      reconcilePermissionSelection(["2", 99, 99, 3], [1, 99], known),
    ).toEqual([2, 99]);
    expect(reconcilePermissionSelection([], [1, 99], known)).toEqual([99]);
    expect(reconcilePermissionSelection([2], [1], known)).toEqual([2]);
    expect(
      reconcilePermissionSelection([2n, Symbol("optimistic")], [99], known),
    ).toEqual([2, 99]);
  });
  it("retains orphan grants, sorts IDs, and serializes an exact whitelist", () => {
    const result = buildAuthorizationBody(
      [99, 1],
      [],
      [{ ...policy, fieldKey: " intro " }],
      [],
      previous,
    );
    expect(result).toEqual({
      permissionIds: [1, 99],
      dataScopes: [],
      fieldPolicies: [
        {
          entityType: "article",
          fieldKey: "intro",
          canRead: true,
          canWrite: false,
        },
      ],
    });
    expect(previous.permissionIds).toEqual([99]);
  });
  it("supports deliberate replacement with an empty authorization snapshot", () => {
    expect(buildAuthorizationBody([], [], [], [], previous)).toEqual({
      permissionIds: [],
      dataScopes: [],
      fieldPolicies: [],
    });
  });
  it.each(
    [[0], [-1], [1.1], [2147483648], [NaN], [1, 1]].map((ids) => ({ ids })),
  )("rejects malformed permission selection %s", ({ ids }) => {
    expect(() => buildAuthorizationBody(ids, [], [], [], previous)).toThrow(
      "权限编号",
    );
  });
  it("refuses new unknown scopes while preserving unchanged historical scopes", () => {
    const row = {
      localKey: "scope",
      resourceKey: "legacy",
      scopeType: "all" as const,
      selectedIds: "",
    };
    expect(() => buildAuthorizationBody([], [row], [], [], previous)).toThrow();
    expect(
      buildAuthorizationBody([], [row], [], [], {
        ...previous,
        dataScopes: [{ resourceKey: "legacy", scopeType: "all" }],
      }).dataScopes,
    ).toEqual([{ resourceKey: "legacy", scopeType: "all" }]);
  });
  it("rejects duplicate normalized field strategies", () => {
    expect(() =>
      buildAuthorizationBody(
        [],
        [],
        [policy, { ...policy, localKey: "other", fieldKey: " intro " }],
        [],
        previous,
      ),
    ).toThrow("字段策略重复");
  });
  it.each(["", "UPPER", "key-with-dash", "a".repeat(101)])(
    "rejects invalid field key %s",
    (fieldKey) => {
      expect(() =>
        buildAuthorizationBody([], [], [{ ...policy, fieldKey }], [], previous),
      ).toThrow("字段策略无效");
    },
  );
  it("allows the same field key on separate entity types", () => {
    expect(
      buildAuthorizationBody(
        [],
        [],
        [policy, { ...policy, entityType: "ski_resort" }],
        [],
        previous,
      ).fieldPolicies,
    ).toHaveLength(2);
  });
  it("collects explicit tree nodes without granting parents or children", () => {
    const parent = node(1);
    parent.children = [node(2)];
    expect([...permissionTreeIds([parent])].sort()).toEqual([1, 2]);
    expect(
      buildAuthorizationBody([2], [], [], [], previous).permissionIds,
    ).toEqual([2]);
  });
  it.each([0, -1, 1.5, 2147483648])("rejects invalid directory ID %s", (id) => {
    expect(() => permissionTreeIds([node(id)])).toThrow("权限目录结构异常");
  });
  it("rejects duplicate tree IDs and cycles before recursive rendering", () => {
    expect(() => permissionTreeIds([node(1), node(1)])).toThrow();
    const cycle = node(2);
    cycle.children = [cycle];
    expect(() => permissionTreeIds([cycle])).toThrow();
  });
});
