import type { components } from "@common/api-contracts/openapi";
export const user: components["schemas"]["CurrentUserVO"] = {
  userId: 7,
  account: "operator",
  nickname: "运营",
  avatarUrl: null,
  roles: [{ roleKey: "resort_operator", roleName: "雪场管理" }],
  permissionKeys: ["management:portal:enter", "content:resort:list-all"],
  menuTree: [],
  merchant: null,
};
export const auth = {
  currentUser: user,
  accessTokenExpiresAt: "2026-11-03T12:15:00Z",
  sessionExpiresAt: "2026-12-03T12:00:00Z",
};
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
