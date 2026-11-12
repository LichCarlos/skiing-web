import { validateHttpUrl } from "./url";
// 使用静态 process.env 属性访问，确保 Next.js 正确内联公开变量。
// 按端惰性读取：单独构建一个应用时，不要求另一个应用的地址。
export function getWebApiBaseUrl() {
  return validateHttpUrl(
    process.env.NEXT_PUBLIC_WEB_API_BASE_URL,
    "NEXT_PUBLIC_WEB_API_BASE_URL",
  );
}
export function getAdminApiBaseUrl() {
  return validateHttpUrl(
    process.env.NEXT_PUBLIC_ADMIN_API_BASE_URL,
    "NEXT_PUBLIC_ADMIN_API_BASE_URL",
  );
}

/** Optional public website origin; never infer canonical URLs from request headers. */
export function getWebSiteOrigin(): string | undefined {
  const value = process.env.NEXT_PUBLIC_WEB_SITE_ORIGIN;
  if (!value?.trim()) return undefined;
  const url = new URL(
    validateHttpUrl(value.trim(), "NEXT_PUBLIC_WEB_SITE_ORIGIN"),
  );
  if (url.pathname !== "/")
    throw new Error(
      "NEXT_PUBLIC_WEB_SITE_ORIGIN 必须是无路径的 HTTP(S) origin",
    );
  return url.origin;
}

/** Build-time deployment prefix. Next Link/Router already apply this prefix. */
export function getWebBasePath(): string {
  return validateBasePath(process.env.NEXT_PUBLIC_WEB_BASE_PATH);
}
export function getAdminBasePath(): string {
  return validateBasePath(process.env.NEXT_PUBLIC_ADMIN_BASE_PATH);
}
function validateBasePath(value: string | undefined): string {
  if (!value) return "";
  if (!/^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(value))
    throw new Error(
      "Deployment base path must contain plain path segments without a trailing slash",
    );
  return value;
}
