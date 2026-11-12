import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/platform/api";
import {
  parseManagedRole,
  parseRolePage,
  parseRoleAuthorization,
  parseRolePermissionTree,
  parseRoleResources,
} from "@/features/roles/role-response";
import {
  readRoleDetail,
  readRolePage,
  readRoleAuthorization,
} from "@/features/roles/role-queries";
import {
  verifyRoleReader,
  roleWorkspaceKey,
  type RoleUser,
} from "@/features/roles/role-workflow";
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const user: RoleUser = {
  userId: 1,
  account: "admin",
  nickname: "管理员",
  avatarUrl: null,
  merchant: null,
  roles: [{ roleKey: "system_admin", roleName: "管理员" }],
  menuTree: [],
  permissionKeys: [
    "management:portal:enter",
    "system:role:list",
    "system:permission:assign",
  ],
};
const role = {
  roleId: 7,
  roleKey: "operator",
  roleName: "运营",
  status: "active" as const,
  description: null,
  dataScope: "self" as const,
  userCount: 2,
  permissionCount: 3,
  fieldPolicyCount: 1,
  dataScopes: [{ resourceKey: "resort", scopeType: "selected" }],
};
const page = { page: 1, pageSize: 20, total: 1, hasNext: false, items: [role] };
const snapshot = {
  roleId: 7,
  roleKey: "operator",
  roleName: "运营",
  status: "active",
  permissionIds: [3, 99],
  dataScopes: [
    { resourceKey: "legacy", scopeType: "selected", selectedIds: [2, 8] },
  ],
  fieldPolicies: [
    {
      entityType: "ski_resort",
      fieldKey: "note",
      canRead: true,
      canWrite: false,
    },
  ],
};
const node = {
  permissionId: 3,
  parentId: null,
  permissionKey: "system:role:list",
  permissionName: "角色",
  permissionType: "api" as const,
  route: null,
  icon: null,
  children: [],
};
const signal = () => new AbortController().signal;
describe("role response boundaries", () => {
  it("projects complete role and nested scope values without retaining extra fields", () => {
    expect(
      parseManagedRole({
        ...role,
        secret: "private",
        dataScopes: [
          { ...role.dataScopes[0], selectedIds: [999], secret: "private" },
        ],
      }),
    ).toEqual(role);
  });
  it.each([
    { ...role, roleId: 0 },
    { ...role, roleKey: null },
    { ...role, roleName: " " },
    { ...role, status: "deleted" },
    { ...role, description: {} },
    { ...role, dataScope: "selected" },
    { ...role, userCount: -1 },
    { ...role, permissionCount: 1.2 },
    { ...role, fieldPolicyCount: "1" },
    { ...role, dataScopes: null },
    { ...role, dataScopes: [null] },
    { ...role, dataScopes: [{ resourceKey: "resort", scopeType: "unknown" }] },
    { ...role, dataScopes: [...role.dataScopes, ...role.dataScopes] },
  ])("rejects malformed role values", (value) => {
    expect(() => parseManagedRole(value)).toThrow();
  });
  it("accepts absent optional description but requires matching detail id", () => {
    const { description: _, ...old } = role;
    expect(parseManagedRole(old)).toEqual(old);
    expect(() => parseManagedRole(role, 8)).toThrow();
  });
  it("allows an empty later page and strips list extras", () => {
    expect(parseRolePage({ ...page, secret: true }, 1)).toEqual(page);
    expect(parseRolePage({ ...page, page: 2, items: [] }, 2).total).toBe(1);
  });
  it.each([
    { ...page, page: 2 },
    { ...page, pageSize: 100 },
    { ...page, total: 0 },
    { ...page, total: -1 },
    { ...page, hasNext: true },
    { ...page, hasNext: 0 },
    { ...page, items: null },
    { ...page, total: 2, items: [role, role] },
    { ...page, items: [{ ...role, status: "disabled" }] },
  ])("rejects incoherent page or filter results", (value) => {
    expect(() => parseRolePage(value, 1, "active")).toThrow();
  });
  it("preserves valid orphan permission ids and historical resource scopes while projecting all snapshot fields", () => {
    const result = parseRoleAuthorization(
      {
        ...snapshot,
        secret: true,
        dataScopes: snapshot.dataScopes.map((s) => ({ ...s, private: true })),
        fieldPolicies: snapshot.fieldPolicies.map((s) => ({
          ...s,
          private: true,
        })),
      },
      7,
    );
    expect(result).toEqual(snapshot);
    result.permissionIds.push(101);
    expect(snapshot.permissionIds).toEqual([3, 99]);
  });
  it.each([
    { ...snapshot, roleId: 8 },
    { ...snapshot, permissionIds: [3, 3] },
    { ...snapshot, permissionIds: [0] },
    {
      ...snapshot,
      dataScopes: [...snapshot.dataScopes, ...snapshot.dataScopes],
    },
    {
      ...snapshot,
      dataScopes: [{ resourceKey: "legacy", scopeType: "selected" }],
    },
    {
      ...snapshot,
      dataScopes: [
        { resourceKey: "legacy", scopeType: "selected", selectedIds: [2, 2] },
      ],
    },
    {
      ...snapshot,
      dataScopes: [
        { resourceKey: "legacy", scopeType: "all", selectedIds: [2] },
      ],
    },
    {
      ...snapshot,
      fieldPolicies: [{ ...snapshot.fieldPolicies[0], canWrite: "true" }],
    },
    {
      ...snapshot,
      fieldPolicies: [{ ...snapshot.fieldPolicies[0], entityType: "user" }],
    },
    {
      ...snapshot,
      fieldPolicies: [{ ...snapshot.fieldPolicies[0], fieldKey: "Invalid" }],
    },
    {
      ...snapshot,
      fieldPolicies: [...snapshot.fieldPolicies, ...snapshot.fieldPolicies],
    },
  ])("rejects ambiguous or malformed authorization data", (value) => {
    expect(() => parseRoleAuthorization(value, 7)).toThrow();
  });
  it("projects permission tree and resource catalog without a hardcoded resource allowlist", () => {
    expect(parseRolePermissionTree([{ ...node, secret: true }])).toEqual([
      node,
    ]);
    expect(
      parseRoleResources([
        { resourceKey: "new_resource", label: "新资源", secret: true },
      ]),
    ).toEqual([{ resourceKey: "new_resource", label: "新资源" }]);
  });
  it.each(
    [
      [null],
      [{ ...node, children: null }],
      [{ ...node, permissionType: "unknown" }],
      [node, node],
      [{ ...node, children: [node] }],
      [{ ...node, route: 1 }],
    ].map((value) => ({ value })),
  )("rejects malformed or repeated permission nodes", ({ value }) => {
    expect(() => parseRolePermissionTree(value)).toThrow();
  });
  it("rejects duplicate resources and excessive/cyclic permission trees", () => {
    expect(() =>
      parseRoleResources([
        { resourceKey: "role", label: "角色" },
        { resourceKey: "role", label: "角色" },
      ]),
    ).toThrow();
    const cycle: unknown[] = [];
    cycle.push({ ...node, children: cycle });
    expect(() => parseRolePermissionTree(cycle)).toThrow();
  });
});
describe("role production readers", () => {
  it("validates and projects a list between two identity reads", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce({ ...page, private: true })
      .mockResolvedValueOnce(user);
    expect(await readRolePage(user, 1, " snow ", "active", signal())).toEqual(
      page,
    );
    expect(vi.mocked(apiRequest).mock.calls.map((c) => c[0])).toEqual([
      "/auth/me",
      "/admin/roles?page=1&pageSize=20&keyword=snow&status=active",
      "/auth/me",
    ]);
  });
  it("reads validated detail and authorization bundle with identity checks at both ends", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce(role)
      .mockResolvedValueOnce(user);
    expect(await readRoleDetail(user, 7, signal())).toEqual(role);
    vi.mocked(apiRequest)
      .mockReset()
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce([node])
      .mockResolvedValueOnce([{ resourceKey: "role", label: "角色" }])
      .mockResolvedValueOnce(user);
    expect(await readRoleAuthorization(user, 7, signal())).toEqual({
      role: snapshot,
      permissions: [node],
      resources: [{ resourceKey: "role", label: "角色" }],
    });
  });
  it.each(["list", "detail", "authorization"])(
    "refuses %s after observed revocation",
    async (kind) => {
      const mock = vi.mocked(apiRequest).mockResolvedValueOnce(user);
      if (kind === "authorization")
        mock
          .mockResolvedValueOnce(snapshot)
          .mockResolvedValueOnce([node])
          .mockResolvedValueOnce([]);
      else mock.mockResolvedValueOnce(kind === "list" ? page : role);
      mock.mockResolvedValueOnce({ ...user, permissionKeys: [] });
      await expect(
        kind === "list"
          ? readRolePage(user, 1, "", undefined, signal())
          : kind === "detail"
            ? readRoleDetail(user, 7, signal())
            : readRoleAuthorization(user, 7, signal()),
      ).rejects.toThrow("权限已变化");
    },
  );
  it.each([
    [0, "", undefined],
    [1, "a".repeat(101), undefined],
    [1, "", "unknown"],
    [107374184, "", undefined],
  ])(
    "rejects invalid filters before any network request",
    async (page, keyword, status) => {
      await expect(
        readRolePage(
          user,
          page as number,
          keyword as string,
          status as string | undefined,
          signal(),
        ),
      ).rejects.toThrow();
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
  it("rejects malformed local and remote identities", async () => {
    const malformed = { ...user, menuTree: null } as unknown as RoleUser;
    await expect(
      readRolePage(malformed, 1, "", undefined, signal()),
    ).rejects.toThrow("身份响应异常");
    expect(apiRequest).not.toHaveBeenCalled();
    expect(() => verifyRoleReader({ ...user, roles: [null] }, user)).toThrow(
      "身份响应异常",
    );
    expect(roleWorkspaceKey({ ...user, account: "other" })).not.toBe(
      roleWorkspaceKey(user),
    );
    expect(
      roleWorkspaceKey({
        ...user,
        merchant: { merchantId: 1, businessName: "雪场" },
      }),
    ).not.toBe(roleWorkspaceKey(user));
  });
  it("rejects canceled late data without sending final identity read", async () => {
    let resolve!: (value: unknown) => void;
    const late = new Promise((resolve_) => {
      resolve = resolve_;
    });
    const controller = new AbortController();
    vi.mocked(apiRequest).mockResolvedValueOnce(user).mockReturnValueOnce(late);
    const pending = readRoleDetail(user, 7, controller.signal);
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    controller.abort();
    resolve(role);
    await expect(pending).rejects.toThrow();
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });
});
