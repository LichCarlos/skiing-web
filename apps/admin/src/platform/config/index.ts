import {
  getAdminApiBaseUrl,
  getAdminBasePath,
  getWebBasePath,
  getWebSiteOrigin,
} from "@common/config/public";
// 各端请求层只从此处取得地址；调用时才校验，空白模板无需后端即可运行。
export const getApiBaseUrl = getAdminApiBaseUrl;

/** Only for browser full-page navigation; Next Link/Router add basePath themselves. */
export function getPageHref(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//"))
    throw new Error("Expected an application-relative page path");
  return getAdminBasePath() + path;
}

/** Cross-application reader links; never use the admin deployment prefix. */
export function getPublicContentHref(value: string): string | undefined {
  const match = /^(article|resort):([1-9]\d{0,9})$/.exec(value);
  if (!match || Number(match[2]) > 2147483647) return undefined;
  const origin = getWebSiteOrigin();
  if (!origin) return undefined;
  return `${origin}${getWebBasePath()}/${match[1] === "article" ? "knowledge" : "resorts"}/${match[2]}`;
}
