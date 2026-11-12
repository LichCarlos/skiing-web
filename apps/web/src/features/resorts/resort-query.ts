import type { components, operations } from "@common/api-contracts/openapi";
import { apiRequest } from "@/platform/api";
import { readAnonymousPublic } from "@/features/public-content/public-read";
import { projectResortPage } from "@/features/public-content/public-directory-response";
import { projectPublicOptions } from "@/features/public-content/public-card-response";

type Query = NonNullable<
  operations["PublicResortsController_list"]["parameters"]["query"]
>;
export type ResortPage = components["schemas"]["PublicResortPageVO"];
export type ResortCard = components["schemas"]["PublicResortCardVO"];
export type ResortFitTag = components["schemas"]["PublicResortFitTagVO"];
export type Search = Record<string, string | string[] | undefined>;
export type ResortFilters = Record<
  | "keyword"
  | "province"
  | "city"
  | "district"
  | "minPrice"
  | "maxPrice"
  | "minRating"
  | "openStatus"
  | "latitude"
  | "longitude"
  | "sortBy"
  | "sortOrder"
  | "page",
  string
> & { fitTags: string[] };
export type DirectoryState =
  | { status: "invalid"; message: string }
  | { status: "error"; query: string }
  | { status: "ready"; query: string; data: ResortPage };
export const resortSorts: Record<NonNullable<Query["sortBy"]>, string> = {
  rating: "评分",
  price: "价格",
  name: "名称",
  distance: "距离",
};
export const resortStatuses: Record<
  NonNullable<Query["openStatus"]>,
  string
> = {
  open: "开放中",
  limited: "部分开放",
  closed: "暂未开放",
  unknown: "状态待更新",
};

export function readResortFilters(search: Search): ResortFilters {
  const first = (key: string) => {
    const value = search[key];
    return (Array.isArray(value) ? value[0] : value) ?? "";
  };
  const rawTags = search.fitTags;
  return {
    keyword: first("keyword"),
    province: first("province"),
    city: first("city"),
    district: first("district"),
    minPrice: first("minPrice"),
    maxPrice: first("maxPrice"),
    minRating: first("minRating"),
    openStatus: first("openStatus"),
    latitude: first("latitude"),
    longitude: first("longitude"),
    sortBy: first("sortBy") || "rating",
    sortOrder:
      first("sortOrder") ||
      (first("sortBy") && first("sortBy") !== "rating" ? "asc" : "desc"),
    page: first("page") || "1",
    fitTags: [
      ...new Set(
        rawTags === undefined
          ? []
          : Array.isArray(rawTags)
            ? rawTags
            : [rawTags],
      ),
    ],
  };
}

export function buildResortQuery(input: ResortFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, label, max] of [
    ["keyword", "关键词", 100],
    ["province", "省份", 50],
    ["city", "城市", 50],
    ["district", "区县", 50],
  ] as const) {
    const value = input[key].trim();
    if (value.length > max) throw new Error(`${label}不能超过 ${max} 字符`);
    if (value) params.set(key, value);
  }
  const price = (key: "minPrice" | "maxPrice") => {
    const value = input[key].trim();
    if (!value) return undefined;
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
      throw new Error("价格须为非负整数");
    params.set(key, String(Number(value)));
    return Number(value);
  };
  const min = price("minPrice"),
    max = price("maxPrice");
  if (min !== undefined && max !== undefined && min > max)
    throw new Error("最低价格不能高于最高价格");
  const decimal = (
    key: "minRating" | "latitude" | "longitude",
    label: string,
    min: number,
    max: number,
  ) => {
    const value = input[key].trim();
    if (!value) return undefined;
    const number = Number(value);
    if (
      !/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) ||
      !Number.isFinite(number) ||
      number < min ||
      number > max
    )
      throw new Error(`${label}须在 ${min} 至 ${max} 之间`);
    params.set(key, String(number));
    return number;
  };
  decimal("minRating", "最低评分", 0, 5);
  const latitude = decimal("latitude", "纬度", -90, 90),
    longitude = decimal("longitude", "经度", -180, 180);
  if ((latitude === undefined) !== (longitude === undefined))
    throw new Error("请同时填写参考纬度和经度");
  if (input.openStatus) {
    if (!Object.hasOwn(resortStatuses, input.openStatus))
      throw new Error("请选择有效的营业状态");
    params.set("openStatus", input.openStatus);
  }
  if (
    !Object.hasOwn(resortSorts, input.sortBy) ||
    !["asc", "desc"].includes(input.sortOrder)
  )
    throw new Error("请选择有效的排序方式和方向");
  if (input.sortBy === "distance" && latitude === undefined)
    throw new Error("按距离排序需要填写参考纬度和经度");
  if (input.fitTags.length > 20) throw new Error("最多选择 20 个适配标签");
  for (const tag of new Set(input.fitTags)) params.append("fitTags", tag);
  const page = Number(input.page);
  if (
    !/^\d+$/.test(input.page) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    (page - 1) * 12 > 2147483647
  )
    throw new Error("页码无效，请返回第一页");
  params.set("sortBy", input.sortBy);
  params.set("sortOrder", input.sortOrder);
  params.set("page", String(page));
  params.set("pageSize", "12");
  return params;
}

export async function loadResortDirectory(
  filters: ResortFilters,
  request: typeof apiRequest = apiRequest,
): Promise<DirectoryState> {
  let query: URLSearchParams;
  try {
    query = buildResortQuery(filters);
  } catch (cause) {
    return {
      status: "invalid",
      message: cause instanceof Error ? cause.message : "筛选条件无效",
    };
  }
  try {
    const data = projectResortPage(
      await readAnonymousPublic<unknown>(`/resorts?${query}`, request),
      Number(query.get("page")),
    );
    return { status: "ready", query: query.toString(), data };
  } catch {
    return { status: "error", query: query.toString() };
  }
}

export async function loadResortFitTags(
  request: typeof apiRequest = apiRequest,
): Promise<ResortFitTag[] | null> {
  try {
    return projectPublicOptions(
      await readAnonymousPublic<unknown>("/resorts/fit-tags", request),
    );
  } catch {
    return null;
  }
}

export function resortPageHref(
  query: string,
  page: number,
): `/resorts?${string}` {
  const params = new URLSearchParams(query);
  params.set("page", String(page));
  return `/resorts?${params}`;
}
export function formatResortDistance(meters: number | null): string | null {
  if (meters === null || !Number.isFinite(meters) || meters < 0) return null;
  return meters < 1000
    ? `${Math.round(meters)} 米`
    : `${(meters / 1000).toFixed(1)} 公里`;
}
