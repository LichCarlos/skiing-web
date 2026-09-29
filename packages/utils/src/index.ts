/** 仅做展示格式化，不参与金额计算、计费或业务精度规则。 */
export function formatNumber(
  value: number,
  options: Intl.NumberFormatOptions = {},
  locale = "zh-CN",
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}
/** 显式指定时区，避免服务器与浏览器输出不一致。 */
export function formatDate(
  value: Date | number,
  options: Intl.DateTimeFormatOptions = {},
  locale = "zh-CN",
  timeZone = "Asia/Shanghai",
): string {
  return new Intl.DateTimeFormat(locale, { timeZone, ...options }).format(
    value,
  );
}
