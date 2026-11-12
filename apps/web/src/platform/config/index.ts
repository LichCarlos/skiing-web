import {
  getWebApiBaseUrl,
  getWebSiteOrigin,
  getWebBasePath,
} from "@common/config/public";
// 各端请求层只从此处取得地址；调用时才校验，空白模板无需后端即可运行。
export const getApiBaseUrl = getWebApiBaseUrl;
export const getSiteOrigin = getWebSiteOrigin;

export const getBasePath = getWebBasePath;

export function getPageHref(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//"))
    throw new Error("Expected an application-relative path");
  const base = getWebBasePath();
  return path === "/" ? base || "/" : base + path;
}
