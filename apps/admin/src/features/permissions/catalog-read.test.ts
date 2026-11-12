import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/platform/api";
import {
  parseCatalog,
  parseCatalogNode,
  parseCatalogSync,
  readCatalog,
  readCatalogDetail,
} from "@/features/permissions/catalog-queries";
import {
  verifyCatalogIdentity,
  catalogWorkspaceKey,
  CatalogWriteGate,
  type CatalogNode,
  type CatalogUser,
} from "@/features/permissions/catalog-model";
import { CatalogRecoveryLedger } from "@/features/permissions/catalog-recovery";
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const user: CatalogUser = {
  userId: 7,
  account: "operator",
  nickname: "运营",
  avatarUrl: null,
  merchant: null,
  menuTree: [],
  roles: [{ roleKey: "custom_operator", roleName: "运营" }],
  permissionKeys: [
    "management:portal:enter",
    "system:permission:list",
    "system:permission:update",
  ],
};
const node: CatalogNode = {
  permissionId: 1,
  parentId: null,
  permissionKey: "custom:root",
  permissionName: "目录",
  permissionType: "directory",
  source: "custom",
  status: "active",
  route: null,
  icon: null,
  sortOrder: 0,
  visible: true,
  children: [],
};
const child: CatalogNode = {
  ...node,
  permissionId: 2,
  parentId: 1,
  permissionKey: "custom:menu",
  permissionName: "菜单",
  permissionType: "menu",
  route: "/reports",
};
const signal = () => new AbortController().signal;
describe("permission catalog response", () => {
  it("projects a complete tree and nested detail without retaining unexpected data", () => {
    const result = parseCatalog([
      {
        ...node,
        secret: "private",
        children: [{ ...child, secret: "private" }],
      },
    ]);
    expect(result).toEqual([{ ...node, children: [child] }]);
    expect(parseCatalogNode({ ...child, extra: true }, 2)).toEqual(child);
    expect(
      parseCatalogSync({ created: 1, updated: 2, disabled: 3, private: true }),
    ).toEqual({ created: 1, updated: 2, disabled: 3 });
  });
  it.each([
    { ...node, permissionId: 0 },
    { ...node, parentId: 0 },
    { ...node, permissionKey: "" },
    { ...node, permissionName: null },
    { ...node, permissionType: "unknown" },
    { ...node, source: "unknown" },
    { ...node, status: "deleted" },
    { ...node, route: 12 },
    { ...node, icon: {} },
    { ...node, visible: "true" },
    { ...node, sortOrder: 1.5 },
    { ...node, sortOrder: 2147483648 },
    { ...node, children: null },
    { ...node, children: [null] },
    { ...node, children: [{ ...child, parentId: 3 }] },
  ])("rejects malformed node and nested values", (value) => {
    expect(() => parseCatalog([value])).toThrow();
  });
  it.each(
    [
      null,
      {},
      [node, node],
      [child],
      [
        {
          ...node,
          children: [{ ...child, permissionKey: node.permissionKey }],
        },
      ],
    ].map((value) => ({ value })),
  )(
    "rejects malformed root, duplicates and inconsistent hierarchy",
    ({ value }) => {
      expect(() => parseCatalog(value)).toThrow();
    },
  );
  it("checks detail id and detects a cyclic in-memory tree", () => {
    expect(() => parseCatalogNode(child, 3)).toThrow();
    const cyclic = { ...node, children: [] as CatalogNode[] };
    cyclic.children.push(cyclic);
    expect(() => parseCatalog([cyclic])).toThrow();
  });
  it("copies a deep valid tree without recursion or retaining response references", () => {
    const root = { ...node, children: [] as CatalogNode[] };
    let parent = root;
    for (let i = 2; i <= 1000; i++) {
      const next = {
        ...node,
        permissionId: i,
        permissionKey: `custom:${i}`,
        parentId: parent.permissionId,
        children: [] as CatalogNode[],
      };
      parent.children.push(next);
      parent = next;
    }
    const copy = parseCatalog([root]);
    expect(copy[0]).not.toBe(root);
    let leaf = copy[0]!;
    for (let i = 2; i <= 1000; i++) leaf = leaf.children[0]!;
    expect(leaf.permissionId).toBe(1000);
  });
  it.each([
    { created: -1, updated: 0, disabled: 0 },
    { created: 0, updated: "1", disabled: 0 },
    { created: 0, updated: 0 },
    null,
  ])("rejects invalid sync receipts", (value) => {
    expect(() => parseCatalogSync(value)).toThrow();
  });
});
describe("catalog reader authorization", () => {
  it("retains a dispatched unknown write when the hidden gate is reactivated", async () => {
    const ledger = new CatalogRecoveryLedger();
    let reject!: (reason: unknown) => void;
    const response = new Promise((_, reject_) => {
      reject = reject_;
    });
    const write = vi.fn(() => response),
      committed = vi.fn();
    const gate = new CatalogWriteGate(
      user,
      async () => user,
      vi.fn(),
      false,
      () => {
        const token = ledger.begin(user.userId);
        return () => ledger.finish(user.userId, token);
      },
    );
    gate.activate();
    const pending = gate.run("update", async () => ({}), write, committed);
    await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
    gate.dispose();
    gate.activate(ledger.has(user.userId));
    expect(
      await gate.run("update", async () => ({}), write, committed),
    ).toEqual({ status: "ignored" });
    reject(new Error("response lost"));
    expect(await pending).toEqual({ status: "ignored" });
    expect(ledger.has(user.userId)).toBe(true);
    expect(gate.isLocked()).toBe(true);
    expect(committed).not.toHaveBeenCalled();
  });
  it("checks local identity and both ends of a projected tree read", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce([{ ...node, secret: true }])
      .mockResolvedValueOnce(user);
    expect(await readCatalog(user, signal())).toEqual([node]);
    expect(vi.mocked(apiRequest).mock.calls.map((c) => c[0])).toEqual([
      "/auth/me",
      "/admin/permissions",
      "/auth/me",
    ]);
  });
  it.each(["list", "detail"])(
    "rejects observed revocation after %s response",
    async (kind) => {
      vi.mocked(apiRequest)
        .mockResolvedValueOnce(user)
        .mockResolvedValueOnce(kind === "list" ? [node] : child)
        .mockResolvedValueOnce({ ...user, permissionKeys: [] });
      await expect(
        kind === "list"
          ? readCatalog(user, signal())
          : readCatalogDetail(user, 2, signal()),
      ).rejects.toThrow("变化");
    },
  );
  it("validates and returns a subtree after final identity check", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce(child)
      .mockResolvedValueOnce(user);
    expect(await readCatalogDetail(user, 2, signal())).toEqual(child);
  });
  it("rejects malformed local identity before any network read or write preparation", async () => {
    const malformed = { ...user, roles: [null] } as unknown as CatalogUser;
    await expect(readCatalog(malformed, signal())).rejects.toThrow(
      "身份响应异常",
    );
    expect(apiRequest).not.toHaveBeenCalled();
    const prepare = vi.fn(async () => ({})),
      write = vi.fn();
    const gate = new CatalogWriteGate(malformed, async () => user, vi.fn());
    gate.activate();
    expect(await gate.run("update", prepare, write, vi.fn())).toMatchObject({
      status: "error",
      uncertain: false,
    });
    expect(prepare).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
  it.each([
    { ...user, account: "other" },
    { ...user, merchant: { merchantId: 1, businessName: "雪场" } },
    { ...user, roles: [] },
  ])("rejects stale account, business identity and role inputs", (current) => {
    expect(catalogWorkspaceKey(current)).not.toBe(catalogWorkspaceKey(user));
    expect(() => verifyCatalogIdentity(current, user)).toThrow();
  });
  it("cancels late transport without sending a final identity request", async () => {
    let resolve!: (value: unknown) => void;
    const pendingResponse = new Promise((resolve_) => {
        resolve = resolve_;
      }),
      c = new AbortController();
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(user)
      .mockReturnValueOnce(pendingResponse);
    const pending = readCatalogDetail(user, 2, c.signal);
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    c.abort();
    resolve(child);
    await expect(pending).rejects.toThrow();
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });
  it.each([0, -1, 1.1, 2147483648])(
    "rejects invalid target %s before identity requests",
    async (id) => {
      await expect(readCatalogDetail(user, id, signal())).rejects.toThrow();
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
  it("prevents suspended form preparation from dispatching after a new activation", async () => {
    let resolve!: (value: unknown) => void;
    const validation = new Promise((resolve_) => {
      resolve = resolve_;
    });
    const gate = new CatalogWriteGate(user, async () => user, vi.fn()),
      write = vi.fn(),
      committed = vi.fn();
    gate.activate();
    const old = gate.run("update", () => validation, write, committed);
    gate.dispose();
    expect(gate.isRunning()).toBe(false);
    gate.activate(false);
    expect(
      await gate.run("update", async () => ({}), write, committed),
    ).toEqual({ status: "success" });
    resolve({});
    expect(await old).toEqual({ status: "ignored" });
    expect(write).toHaveBeenCalledOnce();
    expect(committed).toHaveBeenCalledOnce();
  });
});
