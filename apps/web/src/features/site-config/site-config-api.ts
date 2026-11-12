import type { components } from "@common/api-contracts/openapi";
import { apiRequest } from "@/platform/api";
export type SiteConfig = components["schemas"]["PublicSiteConfigVO"];
export async function readSiteConfig(
  signal?: AbortSignal,
): Promise<SiteConfig> {
  signal?.throwIfAborted();
  const value = await apiRequest<unknown>("/public/config", {
    cache: "no-store",
    signal,
    skipAuthRefresh: true,
  });
  signal?.throwIfAborted();
  const data = value as Partial<SiteConfig> | null;
  const text = (value: unknown, max: number, nullable = false) =>
    (nullable && value === null) ||
    (typeof value === "string" &&
      !!value.trim() &&
      Array.from(value).length <= max);
  if (
    !data ||
    !text(data.siteName, 50) ||
    !text(data.tagline, 200) ||
    !text(data.about, 10000, true) ||
    !text(data.contactEmail, 254, true) ||
    !text(data.privacyPolicy, 30000, true) ||
    !text(data.termsOfService, 30000, true) ||
    typeof data.revision !== "string" ||
    !/^[a-f0-9]{64}$/i.test(data.revision)
  )
    throw new TypeError("平台信息响应无效");
  return {
    siteName: data.siteName!,
    tagline: data.tagline!,
    about: data.about!,
    contactEmail: data.contactEmail!,
    privacyPolicy: data.privacyPolicy!,
    termsOfService: data.termsOfService!,
    revision: data.revision,
  };
}
