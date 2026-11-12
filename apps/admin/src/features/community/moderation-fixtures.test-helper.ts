import type {
  Moderator,
  AdminDynamic,
  AdminComment,
  ModerationTarget,
} from "@/features/community/moderation-model";
export const operator: Moderator = {
  userId: 1,
  account: "reviewer",
  nickname: "审核员",
  avatarUrl: null,
  merchant: null,
  menuTree: [],
  roles: [{ roleKey: "reviewer", roleName: "自定义审核角色" }],
  permissionKeys: ["management:portal:enter", "content:dynamic:moderate"],
};
export const dynamic: AdminDynamic = {
  dynamicId: 7,
  authorId: 2,
  authorNickname: "雪友",
  content: "滑雪记录",
  resortId: null,
  status: "pending",
  imageUrls: [],
  moderatedAt: null,
  moderatedByUserId: null,
  moderationReason: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
};
export const comment: AdminComment = {
  commentId: 8,
  dynamicId: 7,
  authorId: 2,
  authorNickname: "雪友",
  content: "练习记录",
  status: "visible",
  moderatedAt: null,
  moderatedByUserId: null,
  moderationReason: null,
  createdAt: dynamic.createdAt,
};
export const target: ModerationTarget = {
  kind: "dynamic",
  item: dynamic,
  action: "approve",
};
export function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (cause: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
