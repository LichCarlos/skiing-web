export function validateHttpUrl(
  value: string | undefined,
  variable: string,
): string {
  if (!value)
    throw new Error(`缺少环境变量 ${variable}，请配置项目根 .env 或部署环境`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variable} 必须是绝对 HTTP(S) URL`);
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${variable} 必须是无凭据、查询参数和片段的 HTTP(S) 基址`);
  }
  return url.toString().replace(/\/$/, "");
}
