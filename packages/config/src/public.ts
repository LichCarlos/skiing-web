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
