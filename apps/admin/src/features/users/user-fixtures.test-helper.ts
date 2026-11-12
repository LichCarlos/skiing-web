import type {
  Operator,
  AccountRole,
  ManagedAccount,
} from "@/features/users/user-model";
export const operator: Operator = {
  userId: 1,
  account: "operator",
  nickname: "运营",
  avatarUrl: null,
  merchant: null,
  roles: [{ roleKey: "custom_operator", roleName: "运营" }],
  menuTree: [],
  permissionKeys: [
    "management:portal:enter",
    "system:user:list",
    "system:user:create",
    "system:user:assign-role",
    "system:user:update",
    "system:role:list",
  ],
};
export const role = (
  id: number,
  overrides: Partial<AccountRole> = {},
): AccountRole => ({
  roleId: id,
  roleKey: `role_${id}`,
  roleName: `角色${id}`,
  description: null,
  status: "active",
  dataScope: "self",
  userCount: 0,
  permissionCount: 0,
  fieldPolicyCount: 0,
  dataScopes: [],
  ...overrides,
});
export const account: ManagedAccount = {
  userId: 7,
  account: "snow",
  nickname: "雪客",
  status: "active",
  merchant: null,
  roles: [
    {
      roleId: 3,
      roleKey: "operations",
      roleName: "运营",
      status: "active",
      systemRoleCode: null,
    },
  ],
  createdAt: "2026-10-31T00:00:00Z",
};
export function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
