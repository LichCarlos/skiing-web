import type { ApiRequestOptions } from "@common/api-contracts/client";
import {
  configQuery,
  configUpdateBody,
  type ConfigItem,
} from "@/features/system-config/config-api";
import {
  ConfigInputError,
  ConfigConflictError,
  configFingerprint,
  isConfigKey,
  verifyConfigOperator,
  type ConfigOperator,
  type ConfigMutation,
} from "@/features/system-config/config-model";
import {
  parseConfigItem,
  parseConfigPage,
} from "@/features/system-config/config-responses";
export type ConfigRequest = <T>(
  path: string,
  options?: ApiRequestOptions,
) => Promise<T>;
export async function verifyConfigReader(
  request: ConfigRequest,
  user: ConfigOperator,
  signal: AbortSignal,
  write = false,
) {
  verifyConfigOperator(user, user, write);
  signal.throwIfAborted();
  const current = await request<ConfigOperator>("/auth/me", {
    signal,
    cache: "no-store",
  });
  signal.throwIfAborted();
  verifyConfigOperator(current, user, write);
}
export async function readConfigPage(
  request: ConfigRequest,
  user: ConfigOperator,
  query: { keyword: string; page: number; pageSize: number },
  signal: AbortSignal,
) {
  const params = configQuery(query.keyword, query.page, query.pageSize);
  await verifyConfigReader(request, user, signal);
  const result = await request<unknown>(`/admin/config?${params}`, {
    signal,
    cache: "no-store",
  });
  signal.throwIfAborted();
  const page = parseConfigPage(result, query);
  await verifyConfigReader(request, user, signal);
  return page;
}
/** There is no GET/:key contract: search the approved six-key catalog and match exactly. */
export async function readConfigItem(
  request: ConfigRequest,
  user: ConfigOperator,
  key: string,
  signal: AbortSignal,
) {
  if (!isConfigKey(key)) throw new ConfigInputError("配置键无效");
  const page = await readConfigPage(
    request,
    user,
    { keyword: key, page: 1, pageSize: 100 },
    signal,
  );
  const matches = page.items.filter((item) => item.configKey === key);
  if (matches.length !== 1 || page.hasNext)
    throw new ConfigInputError("配置目录不完整或不匹配，请刷新后核对");
  return matches[0]!;
}
export async function prepareConfigSave(
  request: ConfigRequest,
  user: ConfigOperator,
  item: ConfigItem,
  value: string,
  signal: AbortSignal,
) {
  const body = configUpdateBody(item, value);
  const current = await readConfigItem(request, user, item.configKey, signal);
  // Preserve the original version even if a different version has the same value.
  if (configFingerprint(current) !== configFingerprint(item))
    throw new ConfigConflictError("配置或定义已变化，请保留修改后刷新重新编辑");
  return body;
}
export async function writeConfig(
  request: ConfigRequest,
  item: ConfigItem,
  body: ReturnType<typeof configUpdateBody>,
  signal: AbortSignal,
) {
  if (!isConfigKey(item.configKey) || body.expectedVersion !== item.version)
    throw new ConfigInputError("配置或原始版本不匹配");
  signal.throwIfAborted();
  const saved = parseConfigItem(
    await request<unknown>(
      `/admin/config/${encodeURIComponent(item.configKey)}`,
      { method: "PATCH", body, signal },
    ),
  );
  if (
    saved.configKey !== item.configKey ||
    saved.version !== item.version + 1 ||
    saved.value !== body.value
  )
    throw new ConfigInputError("保存返回内容不匹配，请读取并核对实际结果");
  return saved;
}
export async function reviewConfigWrites(
  request: ConfigRequest,
  user: ConfigOperator,
  mutations: readonly ConfigMutation[],
  signal: AbortSignal,
) {
  const result: string[] = [];
  for (const mutation of mutations) {
    const item = await readConfigItem(
      request,
      user,
      mutation.configKey,
      signal,
    );
    result.push(
      `${item.label}（${item.configKey}）：版本 ${item.version}，${item.updatedAt ?? "默认值"}。请打开编辑器核对当前正文。`,
    );
  }
  signal.throwIfAborted();
  return result;
}
