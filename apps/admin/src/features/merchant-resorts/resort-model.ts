import type { components, operations } from "@common/api-contracts/openapi";
import { ApiError } from "@common/api-contracts/client";
import { isAssetId } from "@/features/assets/asset-library-model";
import { parseCurrentUser } from "@/platform/auth/session-model";

export type ResortOperator = components["schemas"]["CurrentUserVO"];
export type MerchantResort = components["schemas"]["MerchantResortVO"];
export type ResortPage = components["schemas"]["MerchantResortPageVO"];
export type ResortInput = components["schemas"]["CreateMerchantResortDto"];
export type ResortSchema =
  operations["MerchantResortsController_customFieldSchema"]["responses"][200]["content"]["application/json"];
export type ResortField = NonNullable<
  ResortSchema["groups"][number]["fields"]
>[number];
export type ResortAction =
  "list" | "create" | "update" | "delete" | "submit-review";
export type ResortMutation =
  | { action: "create"; name: string }
  | { action: "update" | "delete" | "submit-review"; resortId: number };
export class ResortInputError extends Error {}
export function normalizeResortFieldValue(dataType: string, value: unknown) {
  return value === undefined || (dataType === "date" && value === "")
    ? null
    : value;
}
export const resortStatuses = {
  draft: "草稿",
  pending_review: "审核中",
  published: "已发布",
  offline: "已下架",
};
export function resortId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isInteger(id) && id <= 2147483647 ? id : null;
}
export function canUseResorts(
  user: ResortOperator,
  action: ResortAction = "list",
) {
  return (
    resortId(String(user.userId)) !== null &&
    resortId(String(user.merchant?.merchantId)) !== null &&
    [
      "management:portal:enter",
      "resort:merchant:list",
      `resort:merchant:${action}`,
    ].every((key) => user.permissionKeys.includes(key))
  );
}
export function resortOperatorKey(user: ResortOperator) {
  return JSON.stringify([
    user.userId,
    user.account,
    user.merchant?.merchantId,
    [...new Set(user.permissionKeys)].sort(),
    [...new Set(user.roles.map((role) => role.roleKey))].sort(),
  ]);
}
export function verifyResortOperator(
  currentValue: unknown,
  expectedValue: unknown,
  action: ResortAction = "list",
) {
  let current: ResortOperator, expected: ResortOperator;
  try {
    current = parseCurrentUser(currentValue);
    expected = parseCurrentUser(expectedValue);
  } catch {
    throw new ResortInputError(
      "身份、商家关联或权限已变化，请重新读取身份后继续",
    );
  }
  if (
    !canUseResorts(current, action) ||
    resortOperatorKey(current) !== resortOperatorKey(expected)
  )
    throw new ResortInputError(
      "身份、商家关联或权限已变化，请重新读取身份后继续",
    );
}
export function resortListPath(page: number, status?: string) {
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 107374183 ||
    (status !== undefined && !Object.hasOwn(resortStatuses, status))
  )
    throw new ResortInputError("页码或审核状态无效");
  const query = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (status) query.set("status", status);
  return `/merchant/resorts?${query}`;
}
export function initialResortInput(
  item: MerchantResort | undefined,
  schema: ResortSchema,
): ResortInput {
  const fields = Object.fromEntries(
    schema.groups.flatMap((group) =>
      (group.fields ?? []).flatMap((field) => {
        if (
          item &&
          field.canRead &&
          Object.hasOwn(item.customFields, field.fieldKey)
        )
          return [[field.fieldKey, item.customFields[field.fieldKey]]];
        if (!item && field.canWrite && field.defaultValue != null)
          return [[field.fieldKey, field.defaultValue]];
        return [];
      }),
    ),
  );
  return {
    name: item?.name ?? "",
    price: item?.price ?? 0,
    openStatus: (item?.openStatus ?? "unknown") as ResortInput["openStatus"],
    snowCondition: item?.snowCondition ?? "",
    description: item?.description ?? "",
    province: item?.province ?? null,
    city: item?.city ?? null,
    district: item?.district ?? null,
    address: item?.address ?? null,
    longitude: item?.longitude == null ? null : Number(item.longitude),
    latitude: item?.latitude == null ? null : Number(item.latitude),
    openingHours: item?.openingHours ?? null,
    trailSummary: item?.trailSummary ?? null,
    facilitySummary: item?.facilitySummary ?? null,
    officialUrl: item?.officialUrl ?? null,
    coverAssetId: item?.coverAssetId ?? null,
    galleryAssetIds: item?.gallery.map((image) => image.assetId) ?? [],
    fitTagValues: [...(item?.fitTags ?? [])],
    customFields: fields,
  };
}
export function resortInput(
  values: ResortInput,
  schema: ResortSchema,
  original: Record<string, unknown> = {},
): ResortInput {
  for (const [value, max] of [
    [values.name, 100],
    [values.snowCondition, 50],
    [values.description, 1000],
  ] as const)
    if (typeof value !== "string" || !value.trim() || value.length > max)
      throw new ResortInputError("请填写有效的名称、雪况和介绍");
  if (
    !Number.isInteger(values.price) ||
    values.price < 0 ||
    values.price > 2147483647 ||
    !["open", "closed", "limited", "unknown"].includes(values.openStatus)
  )
    throw new ResortInputError("票价或营业状态无效");
  const nullableText = (value: unknown, max: number) => {
    if (value == null || value === "") return null;
    if (typeof value !== "string" || value.length > max)
      throw new ResortInputError("资料长度超出限制");
    return value.trim() || null;
  };
  const coordinate = (value: number | null | undefined, maximum: number) => {
    if (value == null) return null;
    if (!Number.isFinite(value) || Math.abs(value) > maximum)
      throw new ResortInputError("经纬度无效");
    return value;
  };
  const officialUrl = nullableText(values.officialUrl, 500);
  if (officialUrl) {
    let valid = false;
    try {
      valid = ["http:", "https:"].includes(new URL(officialUrl).protocol);
    } catch {
      /* rejected below */
    }
    if (!valid) throw new ResortInputError("官网必须为完整的 http(s) 地址");
  }
  const coverAssetId = values.coverAssetId ?? null;
  const galleryAssetIds = values.galleryAssetIds ?? [];
  if (
    (coverAssetId !== null && !isAssetId(coverAssetId)) ||
    !Array.isArray(galleryAssetIds) ||
    galleryAssetIds.length > 30 ||
    new Set(galleryAssetIds).size !== galleryAssetIds.length ||
    galleryAssetIds.some((id) => typeof id !== "string" || !isAssetId(id))
  )
    throw new ResortInputError("图片标识、数量或重复项无效");
  const fitTagValues = values.fitTagValues ?? [];
  if (
    !Array.isArray(fitTagValues) ||
    fitTagValues.some((tag) => typeof tag !== "string" || !tag.trim()) ||
    new Set(fitTagValues).size !== fitTagValues.length
  )
    throw new ResortInputError("适配标签无效");
  const submitted = values.customFields ?? {};
  if (typeof submitted !== "object" || Array.isArray(submitted))
    throw new ResortInputError("扩展字段必须为对象");
  const customFields = Object.fromEntries(
    schema.groups.flatMap((group) =>
      (group.fields ?? []).flatMap((field) =>
        field.canWrite &&
        Object.hasOwn(submitted, field.fieldKey) &&
        submitted[field.fieldKey] !== undefined &&
        JSON.stringify(submitted[field.fieldKey]) !==
          JSON.stringify(original[field.fieldKey])
          ? [[field.fieldKey, submitted[field.fieldKey]]]
          : [],
      ),
    ),
  );
  return {
    name: values.name,
    price: values.price,
    openStatus: values.openStatus,
    snowCondition: values.snowCondition,
    description: values.description,
    province: nullableText(values.province, 50),
    city: nullableText(values.city, 50),
    district: nullableText(values.district, 50),
    address: nullableText(values.address, 300),
    openingHours: nullableText(values.openingHours, 200),
    trailSummary: nullableText(values.trailSummary, 10000),
    facilitySummary: nullableText(values.facilitySummary, 10000),
    officialUrl,
    longitude: coordinate(values.longitude, 180),
    latitude: coordinate(values.latitude, 90),
    coverAssetId,
    galleryAssetIds: [...galleryAssetIds],
    fitTagValues: [...fitTagValues],
    customFields,
  };
}
export function resortFingerprint(item: MerchantResort) {
  // Signed preview URLs may rotate without changing the business record.
  const { coverUrl: _cover, gallery, ...fixed } = item;
  return JSON.stringify({
    ...fixed,
    gallery: gallery.map(({ assetId, sortOrder }) => ({ assetId, sortOrder })),
  });
}
export function assertResortReviewSaved(
  item: MerchantResort,
  schema: ResortSchema,
  values: ResortInput,
) {
  const baseline = resortInput(
    initialResortInput(item, schema),
    schema,
    item.customFields,
  );
  const current = resortInput(values, schema, item.customFields);
  if (JSON.stringify(current) !== JSON.stringify(baseline))
    throw new ResortInputError("表单有未保存修改，请先保存再提交审核");
}
export function assertResortCommand(
  item: MerchantResort,
  action: "delete" | "submit-review",
) {
  if (action === "submit-review" && !["draft", "offline"].includes(item.status))
    throw new ResortInputError("当前状态不可提交审核，请刷新");
}
export function resortError(cause: unknown) {
  const text =
    cause instanceof ResortInputError
      ? cause.message
      : cause instanceof ApiError && cause.status === 403
        ? "当前账号无权操作该雪场或读取表单目录，请核对权限与数据范围"
        : cause instanceof ApiError && cause.status === 404
          ? "雪场已删除或不在当前数据范围内"
          : cause instanceof ApiError && cause.status === 409
            ? "资料或关联已变化，请刷新后重试"
            : cause instanceof ApiError && [400, 422].includes(cause.status)
              ? "资料被拒绝，请核对字段、标签和图片"
              : "雪场操作暂时不可用，请稍后重试";
  return cause instanceof ApiError && cause.traceId
    ? `${text}（traceId: ${cause.traceId}）`
    : text;
}
