import type {
  MerchantResort,
  ResortOperator,
  ResortSchema,
} from "@/features/merchant-resorts/resort-model";
export const operator: ResortOperator = {
  userId: 1,
  account: "snow",
  nickname: "雪场运营",
  avatarUrl: null,
  merchant: { merchantId: 7, businessName: "雪场商家" },
  roles: [{ roleKey: "snow_editor", roleName: "运营" }],
  menuTree: [],
  permissionKeys: [
    "management:portal:enter",
    "resort:merchant:list",
    "resort:merchant:create",
    "resort:merchant:update",
    "resort:merchant:delete",
    "resort:merchant:submit-review",
    "asset:upload",
  ],
};
export const item: MerchantResort = {
  resortId: 42,
  name: "测试雪场",
  province: "吉林",
  city: "吉林",
  district: null,
  address: null,
  longitude: "126.1",
  latitude: "43.2",
  coverAssetId: "9223372036854775807",
  coverUrl: "https://example.com/cover",
  gallery: [{ assetId: "8", sortOrder: 0, url: "https://example.com/gallery" }],
  rating: "4.5",
  ratingCount: 10,
  fitTags: ["family", "beginner"],
  price: 200,
  openStatus: "open",
  snowCondition: "新雪",
  snowConditionUpdatedAt: null,
  openingHours: null,
  trailSummary: null,
  facilitySummary: null,
  officialUrl: null,
  description: "雪场介绍",
  customFields: { readOnly: "内部只读", both: "旧值" },
  status: "draft",
  updatedAt: "2026-11-01T00:00:00Z",
};
export const schema: ResortSchema = {
  entityType: "ski_resort",
  groups: [
    {
      groupKey: "extra",
      label: "扩展资料",
      fields: [
        {
          fieldKey: "readOnly",
          label: "只读",
          dataType: "text",
          canRead: true,
          canWrite: false,
        },
        {
          fieldKey: "both",
          label: "双向",
          dataType: "text",
          canRead: true,
          canWrite: true,
        },
        {
          fieldKey: "writeOnly",
          label: "仅写",
          dataType: "text",
          canRead: false,
          canWrite: true,
          required: true,
          defaultValue: "默认值",
        },
      ],
    },
  ],
};
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
export function resortDictionary(dictType = "resort.fit_tag") {
  return {
    dictType,
    dictName: "雪场标签",
    groupKey: "resort",
    status: "active",
    publiclyReadable: true,
    items: [],
  };
}
