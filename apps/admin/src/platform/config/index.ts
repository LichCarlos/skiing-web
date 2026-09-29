import { getAdminApiBaseUrl } from "@common/config/public";
// 各端请求层只从此处取得地址；调用时才校验，空白模板无需后端即可运行。
export const getApiBaseUrl = getAdminApiBaseUrl;
