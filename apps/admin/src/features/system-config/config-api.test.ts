import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import { apiRequest } from "@/platform/api";
import {
  configError,
  configQuery,
  configUpdateBody,
  getConfigs,
  saveConfig,
  type ConfigItem,
} from "@/features/system-config/config-api";
import { canAccessManagementRoute } from "@/platform/auth/access";
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
afterEach(() => vi.clearAllMocks());
const item: ConfigItem = {
  configKey: "site.name",
  label: "平台名称",
  valueType: "text",
  value: "雪客",
  defaultValue: "凛迹雪客",
  version: 7,
  updatedAt: null,
  updatedByUserId: null,
  maxLength: 50,
};
describe("System config management transport and permissions", () => {
  it("sends the original expectedVersion with only the normalized value", async () => {
    const abort = new AbortController();
    await saveConfig(item, " 新名称 ", abort.signal);
    expect(apiRequest).toHaveBeenCalledWith("/admin/config/site.name", {
      method: "PATCH",
      body: { value: "新名称", expectedVersion: 7 },
      signal: abort.signal,
    });
  });
  it("encodes keyword/pagination without searching policy bodies", async () => {
    const query = configQuery(" a&b ", 2, 5);
    expect(new URLSearchParams(query).get("keyword")).toBe("a&b");
    await getConfigs(query);
    expect(apiRequest).toHaveBeenCalledWith(`/admin/config?${query}`, {
      cache: "no-store",
      signal: undefined,
    });
  });
  it.each(["", " ", "x".repeat(51)])(
    "rejects invalid text before sending %j",
    (value) => {
      expect(() => configUpdateBody(item, value)).toThrow();
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
  it("uses code points and validates email and unsafe offsets", () => {
    expect(configUpdateBody(item, "😀".repeat(50)).value).toBe("😀".repeat(50));
    expect(() =>
      configUpdateBody(
        { ...item, configKey: "site.contactEmail", maxLength: 254 },
        "bad",
      ),
    ).toThrow("邮箱");
    expect(() => configQuery("", 2147483647, 100)).toThrow();
  });
  it("explains 409 without exposing the server error or suggesting a silent overwrite", () => {
    const result = configError(
      new ApiError("internal secret", {
        status: 409,
        code: 409,
        traceId: "trace",
      }),
    );
    expect(result).toContain("刷新");
    expect(result).not.toContain("secret");
  });
  it("requires admin identity, portal and list grant for direct access", () => {
    const user = {
      roles: [{ roleKey: "system_admin", roleName: "管理员" }],
      permissionKeys: ["management:portal:enter", "system:config:list"],
    };
    expect(canAccessManagementRoute(user, "/admin/system/config")).toBe(true);
    expect(
      canAccessManagementRoute(
        { ...user, roles: [{ roleKey: "custom", roleName: "运营" }] },
        "/admin/system/config",
      ),
    ).toBe(false);
    for (const grant of user.permissionKeys)
      expect(
        canAccessManagementRoute(
          { ...user, permissionKeys: [grant] },
          "/admin/system/config",
        ),
      ).toBe(false);
  });
});
