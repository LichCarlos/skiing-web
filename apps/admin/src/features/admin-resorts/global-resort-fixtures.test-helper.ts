import { vi } from "vitest";
import {
  operator as merchantOperator,
  item as merchantItem,
  schema,
  resortDictionary,
} from "@/features/merchant-resorts/resort-fixtures.test-helper";
import type {
  GlobalResort,
  GlobalResortOperator,
  GlobalResortPage,
} from "@/features/admin-resorts/global-resort-model";
import type { GlobalResortRequest } from "@/features/admin-resorts/global-resort-api";
export { deferred } from "@/features/merchant-resorts/resort-fixtures.test-helper";
export const operator: GlobalResortOperator = {
  ...merchantOperator,
  merchant: null,
  roles: [{ roleKey: "configured_content_operator", roleName: "内容管理" }],
  permissionKeys: [
    "management:portal:enter",
    ...[
      "list-all",
      "create-all",
      "update-all",
      "delete-all",
      "publish",
      "offline",
    ].map((key) => `content:resort:${key}`),
    "asset:upload",
  ],
};
export const item: GlobalResort = {
  ...merchantItem,
  merchantId: 7,
  merchantName: "业务商家",
  fitTags: merchantItem.fitTags.map((value) => ({ value, label: value })),
  customFields: Object.entries(merchantItem.customFields).map(
    ([fieldKey, value]) => ({
      fieldKey,
      label: fieldKey,
      value: value as string,
    }),
  ),
};
export const page: GlobalResortPage = {
  items: [item],
  total: 1,
  page: 1,
  pageSize: 20,
  hasNext: false,
};
export { schema };
export function requestFixture(overrides: Record<string, unknown> = {}) {
  const responses: Record<string, unknown> = {
    "/auth/me": operator,
    "/admin/resorts/42": item,
    "/admin/resorts/custom-fields": schema,
    "/admin/dictionaries/resort.fit_tag": {
      ...resortDictionary(),
      items: [
        {
          itemId: 1,
          parentId: null,
          value: "family",
          label: "亲子",
          color: null,
          sortOrder: 0,
          isDefault: false,
          status: "active",
          children: [],
        },
      ],
    },
    ...overrides,
  };
  const mock = vi.fn(async (path: string) => {
    const result = Object.hasOwn(responses, path)
      ? responses[path]
      : path.startsWith("/admin/resorts?")
        ? page
        : undefined;
    if (result instanceof Error) throw result;
    if (result === undefined) throw new Error(`Unexpected request: ${path}`);
    return result;
  });
  return { request: mock as GlobalResortRequest, mock };
}
