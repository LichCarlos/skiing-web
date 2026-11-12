import type { components } from "@common/api-contracts/openapi";
import { parseCurrentUser } from "@/platform/auth/session-model";
export type ConfigOperator = components["schemas"]["CurrentUserVO"];
export type ConfigMutation = { configKey: string };
export class ConfigInputError extends Error {}
export class ConfigConflictError extends ConfigInputError {}
/** Fixed catalog already approved in API-M11, never an arbitrary-key editor. */
export const configLimits = {
  "site.name": 50,
  "site.tagline": 200,
  "site.about": 10000,
  "site.contactEmail": 254,
  "site.privacyPolicy": 30000,
  "site.termsOfService": 30000,
} as const;
export function isConfigKey(key: string): key is keyof typeof configLimits {
  return Object.hasOwn(configLimits, key);
}
export function configFingerprint(
  item: components["schemas"]["SystemConfigVO"],
) {
  return JSON.stringify([
    item.configKey,
    item.label,
    item.valueType,
    item.value,
    item.defaultValue,
    item.version,
    item.maxLength,
    item.updatedAt,
    item.updatedByUserId,
  ]);
}
export function canManageConfig(user: ConfigOperator, write = false) {
  return (
    Number.isInteger(user.userId) &&
    user.userId > 0 &&
    user.userId <= 2147483647 &&
    user.roles.some((role) => role.roleKey === "system_admin") &&
    [
      "management:portal:enter",
      "system:config:list",
      ...(write ? ["system:config:update"] : []),
    ].every((key) => user.permissionKeys.includes(key))
  );
}
export function configOperatorKey(user: ConfigOperator) {
  return JSON.stringify([
    user.userId,
    user.account,
    user.merchant?.merchantId ?? null,
    [...new Set(user.roles.map((role) => role.roleKey))].sort(),
    [...new Set(user.permissionKeys)].sort(),
  ]);
}
export function verifyConfigOperator(
  current: ConfigOperator,
  expected: ConfigOperator,
  write = false,
) {
  current = parseCurrentUser(current);
  expected = parseCurrentUser(expected);
  if (
    !canManageConfig(current, write) ||
    configOperatorKey(current) !== configOperatorKey(expected)
  )
    throw new ConfigInputError("身份或配置权限已变化，请重新读取身份后继续");
}
