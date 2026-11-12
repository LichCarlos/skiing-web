import type {
  AdminAsset,
  AssetOperator,
} from "@/features/assets/asset-admin-model";
export const operator: AssetOperator = {
  userId: 1,
  account: "media",
  nickname: "媒体管理员",
  avatarUrl: null,
  merchant: null,
  menuTree: [],
  roles: [{ roleKey: "media_editor", roleName: "媒体角色" }],
  permissionKeys: [
    "management:portal:enter",
    "content:asset:list",
    "content:asset:delete",
  ],
};
export const asset: AdminAsset = {
  assetId: "9223372036854775807",
  ownerUserId: 2,
  ownerAccount: "owner",
  originalName: "雪场.png",
  mimeType: "image/png",
  sizeBytes: "2048",
  status: "ready",
  url: "https://example.com/signed",
  createdAt: "2026-11-01T00:00:00.000Z",
  references: {
    coverResorts: 0,
    resortImages: 0,
    articleCovers: 0,
    dynamicImages: 0,
    userAvatars: 0,
  },
};
export function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (cause: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
