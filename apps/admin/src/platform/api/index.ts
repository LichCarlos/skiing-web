import { createApiClient, type ApiClient } from "@common/api-contracts/client";
import { getApiBaseUrl } from "@/platform/config";

let client: ApiClient | undefined;

export async function apiRequest<T>(
  path: string,
  options?: Parameters<ApiClient["request"]>[1],
): Promise<T> {
  client ??= createApiClient(getApiBaseUrl(), {
    credentials: "include",
    csrfProtection: true,
  });
  return client.request<T>(path, options);
}
