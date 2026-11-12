import { describe, it, expect } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import {
  canManageConfig,
  configOperatorKey,
  verifyConfigOperator,
  configFingerprint,
} from "@/features/system-config/config-model";
import {
  configQuery,
  configUpdateBody,
  configError,
} from "@/features/system-config/config-api";
import {
  operator,
  item,
} from "@/features/system-config/config-fixtures.test-helper";
describe("configuration authorization and fixed catalog", () => {
  it("separates readonly administrators from writers", () => {
    const reader = {
      ...operator,
      permissionKeys: operator.permissionKeys.filter(
        (key) => key !== "system:config:update",
      ),
    };
    expect(canManageConfig(reader)).toBe(true);
    expect(canManageConfig(reader, true)).toBe(false);
    expect(
      canManageConfig({
        ...operator,
        roles: [{ roleKey: "custom", roleName: "自定义" }],
      }),
    ).toBe(false);
  });
  it.each(["management:portal:enter", "system:config:list"])(
    "requires %s",
    (key) =>
      expect(
        canManageConfig({
          ...operator,
          permissionKeys: operator.permissionKeys.filter(
            (value) => value !== key,
          ),
        }),
      ).toBe(false),
  );
  it("keys the workspace by grants and roles, ignoring order", () => {
    expect(
      configOperatorKey({
        ...operator,
        permissionKeys: [...operator.permissionKeys].reverse(),
      }),
    ).toBe(configOperatorKey(operator));
    expect(() =>
      verifyConfigOperator(
        { ...operator, permissionKeys: operator.permissionKeys.slice(0, -1) },
        operator,
      ),
    ).toThrow("权限");
    expect(() =>
      verifyConfigOperator({ ...operator, userId: 2 }, operator),
    ).toThrow();
  });
  it.each([-1, 0, 1.5, 2147483648])("rejects invalid actor %s", (userId) =>
    expect(canManageConfig({ ...operator, userId })).toBe(false),
  );
  it.each(["private.key", "__proto__", "site.name/../private"])(
    "rejects non-catalog key %s",
    (configKey) =>
      expect(() =>
        configUpdateBody({ ...item, configKey } as typeof item, "值"),
      ).toThrow("定义"),
  );
  it.each([-1, 1.5, 2147483647, 2147483648])(
    "rejects invalid/exhausted expectedVersion %s",
    (version) =>
      expect(() => configUpdateBody({ ...item, version }, "值")).toThrow(
        "版本",
      ),
  );
  it("accepts version zero for first-save without changing the client's original snapshot", () =>
    expect(configUpdateBody({ ...item, version: 0 }, " 新值 ")).toEqual({
      value: "新值",
      expectedVersion: 0,
    }));
  it("does not trust a response that expands the approved length bound", () =>
    expect(() =>
      configUpdateBody({ ...item, maxLength: 1000 }, "x".repeat(51)),
    ).toThrow("定义"));
  it("counts policy code points, preserves newlines and treats HTML as text", () => {
    const policy = {
      ...item,
      configKey: "site.privacyPolicy",
      maxLength: 30000,
    };
    expect(configUpdateBody(policy, "😀".repeat(30000)).value.length).toBe(
      60000,
    );
    expect(() => configUpdateBody(policy, "😀".repeat(30001))).toThrow();
    expect(
      configUpdateBody(policy, " 第一段\n<script>text</script> ").value,
    ).toBe("第一段\n<script>text</script>");
  });
  it.each([
    [0, 20],
    [1, 0],
    [1, 101],
    [2147483647, 100],
  ])("rejects invalid page %s size %s", (page, size) =>
    expect(() => configQuery("", page, size)).toThrow(),
  );
  it("compares configuration snapshots independent of object key order", () => {
    const reordered = Object.fromEntries(
      Object.entries(item).reverse(),
    ) as typeof item;
    expect(configFingerprint(reordered)).toBe(configFingerprint(item));
    expect(configFingerprint({ ...item, version: 8 })).not.toBe(
      configFingerprint(item),
    );
  });
  it("redacts unknown errors and includes a safe trace identifier for API failures", () => {
    expect(configError(new Error("internal secret"))).not.toContain("secret");
    expect(
      configError(
        new ApiError("internal secret", {
          status: 403,
          code: 403,
          traceId: "trace",
        }),
      ),
    ).toContain("trace");
  });
});
