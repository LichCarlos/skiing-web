import type { components } from "@common/api-contracts/openapi";
import { ApiError } from "@common/api-contracts/client";
import { apiRequest } from "@/platform/api";
import {
  ConfigInputError,
  configLimits,
  isConfigKey,
} from "@/features/system-config/config-model";
export type ConfigItem = components["schemas"]["SystemConfigVO"];
export type ConfigPage = components["schemas"]["SystemConfigPageVO"];
export function configQuery(keyword: string, page = 1, pageSize = 20) {
  if (
    typeof keyword !== "string" ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100 ||
    (page - 1) * pageSize > 2147483647 ||
    [...keyword].length > 100
  )
    throw new ConfigInputError("查询条件无效");
  return new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    ...(keyword.trim() ? { keyword: keyword.trim() } : {}),
  }).toString();
}
export function configUpdateBody(
  item: ConfigItem,
  value: string,
): components["schemas"]["UpdateSystemConfigDto"] {
  if (
    !isConfigKey(item.configKey) ||
    item.maxLength !== configLimits[item.configKey] ||
    item.valueType !== "text"
  )
    throw new ConfigInputError("配置定义无效，请重新读取");
  if (
    !Number.isInteger(item.version) ||
    item.version < 0 ||
    item.version >= 2147483647
  )
    throw new ConfigInputError("配置版本无效或已耗尽，请联系管理员核对");
  if (typeof value !== "string")
    throw new ConfigInputError("配置内容必须是文本");
  const normalized = value.trim();
  if (!normalized || [...normalized].length > item.maxLength)
    throw new ConfigInputError(`请输入 1–${item.maxLength} 字`);
  if (
    item.configKey === "site.contactEmail" &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  )
    throw new ConfigInputError("请输入有效邮箱");
  return { value: normalized, expectedVersion: item.version };
}
export const getConfigs = (query: string, signal?: AbortSignal) =>
  apiRequest<ConfigPage>(`/admin/config?${query}`, {
    signal,
    cache: "no-store",
  });
export const saveConfig = (
  item: ConfigItem,
  value: string,
  signal?: AbortSignal,
) =>
  apiRequest<ConfigItem>(
    `/admin/config/${encodeURIComponent(item.configKey)}`,
    { method: "PATCH", body: configUpdateBody(item, value), signal },
  );
export function configError(error: unknown) {
  const text =
    error instanceof ApiError && error.status === 409
      ? "配置已被其他操作更新，请刷新配置后重新编辑。"
      : error instanceof ApiError && error.status === 403
        ? "当前账号没有管理系统配置的权限。"
        : error instanceof ConfigInputError
          ? error.message
          : "系统配置暂时不可用，请重试。";
  return error instanceof ApiError && error.traceId
    ? `${text}（traceId: ${error.traceId}）`
    : text;
}
