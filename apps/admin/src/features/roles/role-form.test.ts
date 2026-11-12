import { describe, expect, it } from "vitest";
import {
  createRoleBody,
  updateRoleBody,
  type RoleFormValues,
} from "@/features/roles/role-form";

const values: RoleFormValues = {
  roleKey: "resort_operator",
  roleName: "雪场运营",
  description: "  资料维护  ",
  dataScope: "merchant",
  status: "active",
};

describe("role form authorization payloads", () => {
  it.each([
    { roleKey: "system_admin" },
    { roleKey: "UPPER" },
    { roleKey: " a" },
    { roleName: " " },
    { roleName: "a".repeat(51) },
    { description: "a".repeat(301) },
  ])("rejects invalid metadata %s", (patch) => {
    expect(() => createRoleBody({ ...values, ...patch }, true)).toThrow();
    expect(() => updateRoleBody({ ...values, ...patch }, false)).toThrow();
  });
  it("omits scope from delegated metadata edits, including unchanged scope", () => {
    expect(updateRoleBody(values, false)).toEqual({
      roleKey: "resort_operator",
      roleName: "雪场运营",
      description: "资料维护",
      status: "active",
    });
    expect(
      Object.hasOwn(
        updateRoleBody({ ...values, dataScope: "all" }, false),
        "dataScope",
      ),
    ).toBe(false);
  });

  it("forces self scope on delegated creation without serializing status", () => {
    expect(
      createRoleBody(
        { ...values, dataScope: "all", status: "disabled" },
        false,
      ),
    ).toEqual({
      roleKey: "resort_operator",
      roleName: "雪场运营",
      description: "资料维护",
      dataScope: "self",
    });
  });

  it("preserves the chosen scope for administrators and normalizes blank descriptions", () => {
    expect(
      updateRoleBody({ ...values, dataScope: "all", description: " " }, true),
    ).toMatchObject({ dataScope: "all", description: null });
    expect(createRoleBody(values, true)).toMatchObject({
      dataScope: "merchant",
    });
  });
});
