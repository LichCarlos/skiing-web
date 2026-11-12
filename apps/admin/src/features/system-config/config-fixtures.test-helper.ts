import type { ConfigItem } from "@/features/system-config/config-api";
import type { ConfigOperator } from "@/features/system-config/config-model";
export const operator: ConfigOperator = {
  userId: 1,
  account: "admin",
  nickname: "系统管理员",
  roles: [{ roleKey: "system_admin", roleName: "系统管理员" }],
  permissionKeys: [
    "management:portal:enter",
    "system:config:list",
    "system:config:update",
  ],
  merchant: null,
  menuTree: [],
  avatarUrl: null,
};
export const item: ConfigItem = {
  configKey: "site.name",
  label: "平台名称",
  valueType: "text",
  value: "凛迹雪客",
  defaultValue: "凛迹雪客",
  version: 7,
  maxLength: 50,
  updatedAt: "2026-11-01T00:00:00Z",
  updatedByUserId: 1,
};
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
