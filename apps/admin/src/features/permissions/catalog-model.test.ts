import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import {
  flattenCatalog,
  parentCandidates,
  createCatalogBody,
  updateCatalogBody,
  catalogWorkspaceKey,
  canReadCatalog,
  canDisableCatalogNode,
  catalogReadError,
  CatalogInputError,
  CatalogWriteGate,
  type CatalogNode,
  type CatalogUser,
  type CatalogForm,
} from "@/features/permissions/catalog-model";

const user: CatalogUser = {
  userId: 7,
  account: "operator",
  nickname: "Operator",
  avatarUrl: null,
  roles: [{ roleKey: "custom_operator", roleName: "Operator" }],
  merchant: null,
  menuTree: [],
  permissionKeys: [
    "management:portal:enter",
    "system:permission:list",
    "system:permission:create",
    "system:permission:update",
    "system:permission:delete",
  ],
};
const node = (
  permissionId: number,
  patch: Partial<CatalogNode> = {},
): CatalogNode => ({
  permissionId,
  parentId: null,
  permissionKey: `custom:node.${permissionId}`,
  permissionName: `Node ${permissionId}`,
  permissionType: "directory",
  source: "custom",
  route: null,
  icon: null,
  sortOrder: 0,
  visible: true,
  status: "active",
  children: [],
  ...patch,
});
const form: CatalogForm = {
  permissionKey: "custom:reports",
  permissionType: "menu",
  parentId: 1,
  permissionName: " Reports ",
  route: " /reports ",
  icon: " icon ",
  sortOrder: 0,
  visible: false,
  status: "active",
};
const candidates = [{ value: 1 }];
function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
const apiError = (status: number) =>
  new ApiError("private details", {
    status,
    code: 50000,
    traceId: "trace-catalog",
  });
function setup(current = user, expected = user) {
  const verify = vi.fn(async () => current),
    busy = vi.fn(),
    write = vi.fn(async () => ({})),
    committed = vi.fn();
  const gate = new CatalogWriteGate(expected, verify, busy);
  gate.activate();
  return { gate, verify, busy, write, committed };
}

describe("catalog tree and DTO model", () => {
  it("flattens in stable preorder without Table children or duplicate child rows", () => {
    const rows = flattenCatalog([
      node(1, {
        children: [
          node(2, {
            permissionType: "menu",
            parentId: 1,
            children: [node(3, { permissionType: "button", parentId: 2 })],
          }),
        ],
      }),
      node(4),
    ]);
    expect(rows.map((n) => [n.permissionId, n.depth, n.childCount])).toEqual([
      [1, 0, 1],
      [2, 1, 1],
      [3, 2, 0],
      [4, 0, 0],
    ]);
    expect(rows.every((n) => !("children" in n))).toBe(true);
  });
  it("rejects repeated identity and cycles without recursion", () => {
    const root = node(1);
    root.children = [root];
    expect(() => flattenCatalog([root])).toThrow(CatalogInputError);
    expect(() => flattenCatalog([node(1), node(1)])).toThrow(CatalogInputError);
  });
  it("offers active parents of the right type and excludes self/descendants", () => {
    const editing = node(3, {
      permissionType: "menu",
      children: [node(4, { permissionType: "menu" })],
    });
    const tree = [
      node(1, { children: [node(2, { permissionType: "menu" }), editing] }),
      node(5, { status: "disabled" }),
    ];
    expect(parentCandidates(tree, "directory")).toEqual([]);
    expect(parentCandidates(tree, "menu").map((n) => n.value)).toEqual([1]);
    expect(
      parentCandidates(tree, "button", editing).map((n) => n.value),
    ).toEqual([2]);
  });
  it("whitelists create keys, trims optional text, and preserves zero/false", () => {
    const body = createCatalogBody(
      {
        ...form,
        source: "code",
        status: "disabled",
        children: [],
      } as CatalogForm,
      candidates,
    );
    expect(body).toEqual({
      permissionKey: "custom:reports",
      permissionType: "menu",
      parentId: 1,
      permissionName: "Reports",
      route: "/reports",
      icon: "icon",
      sortOrder: 0,
      visible: false,
    });
  });
  it("clears nullable text and roots while excluding immutable update identity", () => {
    const body = updateCatalogBody(
      {
        ...form,
        permissionKey: "evil",
        permissionType: "button",
        route: "",
        icon: null,
        parentId: 99,
      },
      node(1),
      [],
    );
    expect(body).toEqual({
      parentId: null,
      permissionName: "Reports",
      route: null,
      icon: null,
      sortOrder: 0,
      visible: false,
    });
    expect(body).not.toHaveProperty("permissionKey");
    expect(body).not.toHaveProperty("permissionType");
  });
  it("keeps directory/button route metadata editable rather than silently clearing it", () => {
    expect(updateCatalogBody(form, node(1), []).route).toBe("/reports");
  });
  it.each(["code", "custom"] as const)(
    "does not submit a disable status for protected %s directories",
    (source) => {
      expect(
        updateCatalogBody(
          { ...form, status: "disabled" },
          node(1, { source }),
          [],
        ),
      ).not.toHaveProperty("status");
    },
  );
  it("supports custom menu status and rejects API edits", () => {
    expect(
      updateCatalogBody(
        { ...form, status: "disabled" },
        node(2, { permissionType: "menu" }),
        candidates,
      ).status,
    ).toBe("disabled");
    expect(
      updateCatalogBody(
        form,
        node(2, { permissionType: "menu", source: "code" }),
        candidates,
      ),
    ).not.toHaveProperty("status");
    expect(() =>
      updateCatalogBody(form, node(1, { permissionType: "api" }), []),
    ).toThrow(CatalogInputError);
  });
  it.each([null, undefined, 0, -1, 1.5, 999])(
    "rejects an unavailable menu parent %s",
    (parentId) => {
      expect(() =>
        createCatalogBody({ ...form, parentId }, candidates),
      ).toThrow("活动父级");
    },
  );
  it.each([
    { permissionKey: "system:fake" },
    { permissionType: "api" },
    { permissionName: "  " },
    { route: "https://example.com" },
    { sortOrder: 1.5 },
    { sortOrder: 100001 },
    { visible: null },
  ])("rejects invalid values before a request: %j", (patch) => {
    expect(() =>
      createCatalogBody({ ...form, ...patch } as CatalogForm, candidates),
    ).toThrow(CatalogInputError);
  });
  it.each([
    [node(1), false],
    [node(1, { permissionType: "api" }), false],
    [node(1, { permissionType: "menu", source: "code" }), false],
    [node(1, { permissionType: "menu", status: "disabled" }), false],
    [node(1, { permissionType: "menu" }), true],
    [node(1, { permissionType: "button" }), true],
  ] as const)("matches the existing soft-disable rules", (target, expected) => {
    expect(canDisableCatalogNode(target)).toBe(expected);
  });
  it("uses configurable grants and isolates account/grant/role workspaces", () => {
    expect(canReadCatalog(user)).toBe(true);
    expect(
      canReadCatalog({ ...user, permissionKeys: ["system:permission:list"] }),
    ).toBe(false);
    expect(
      catalogWorkspaceKey({
        ...user,
        permissionKeys: [...user.permissionKeys].reverse(),
      }),
    ).toBe(catalogWorkspaceKey(user));
    expect(catalogWorkspaceKey({ ...user, userId: 8 })).not.toBe(
      catalogWorkspaceKey(user),
    );
    expect(catalogWorkspaceKey({ ...user, permissionKeys: [] })).not.toBe(
      catalogWorkspaceKey(user),
    );
    expect(catalogWorkspaceKey({ ...user, roles: [] })).not.toBe(
      catalogWorkspaceKey(user),
    );
  });
  it("redacts provider errors while retaining safe trace diagnostics", () => {
    expect(catalogReadError(apiError(403))).toContain("trace-catalog");
    expect(catalogReadError(apiError(404))).toContain("不存在");
    expect(catalogReadError(new Error("private details"))).not.toContain(
      "private",
    );
  });
});

describe("catalog write ownership and recovery", () => {
  it.each(["success", "definitive", "unknown"] as const)(
    "tracks unmounted in-flight %s outcomes without UI callbacks",
    async (outcome) => {
      const pending = deferred<number>(),
        finish = vi.fn(),
        begin = vi.fn(() => finish),
        committed = vi.fn();
      const gate = new CatalogWriteGate(
        user,
        async () => user,
        vi.fn(),
        false,
        begin,
      );
      gate.activate();
      const work = gate.run(
        "update",
        async () => 1,
        () => pending.promise,
        committed,
      );
      await Promise.resolve();
      await Promise.resolve();
      expect(begin).toHaveBeenCalledOnce();
      gate.dispose();
      if (outcome === "success") pending.resolve(1);
      else
        pending.reject(
          outcome === "definitive" ? apiError(409) : new Error("lost response"),
        );
      expect((await work).status).toBe("ignored");
      expect(committed).not.toHaveBeenCalled();
      expect(finish).toHaveBeenCalledTimes(outcome === "unknown" ? 0 : 1);
    },
  );
  it("restores an account's unconfirmed state after identity reloading", async () => {
    const verify = vi.fn(async () => user),
      write = vi.fn(),
      committed = vi.fn();
    const gate = new CatalogWriteGate(user, verify, vi.fn(), true);
    gate.activate();
    expect(
      (await gate.run("create", async () => 1, write, committed)).status,
    ).toBe("ignored");
    expect(verify).not.toHaveBeenCalled();
    gate.acknowledgeReview();
    expect(
      (await gate.run("create", async () => 1, write, committed)).status,
    ).toBe("success");
  });
  it("locks before asynchronous validation and prevents two immediate writes", async () => {
    const s = setup(),
      value = deferred<number>(),
      prepare = vi.fn(() => value.promise);
    const first = s.gate.run("create", prepare, s.write, s.committed);
    expect(s.gate.isLocked()).toBe(true);
    expect(
      (await s.gate.run("create", prepare, s.write, s.committed)).status,
    ).toBe("ignored");
    value.resolve(1);
    expect((await first).status).toBe("success");
    expect(prepare).toHaveBeenCalledOnce();
    expect(s.verify).toHaveBeenCalledOnce();
    expect(s.write).toHaveBeenCalledOnce();
    expect(s.committed).toHaveBeenCalledOnce();
    expect(s.busy.mock.calls).toEqual([[true], [false]]);
  });
  it.each([
    "management:portal:enter",
    "system:permission:list",
    "system:permission:update",
  ])("rejects revoked %s after validation", async (permission) => {
    const s = setup({
      ...user,
      permissionKeys: user.permissionKeys.filter((k) => k !== permission),
    });
    expect(
      await s.gate.run("update", async () => 1, s.write, s.committed),
    ).toMatchObject({ status: "error", uncertain: false });
    expect(s.write).not.toHaveBeenCalled();
  });
  it("rejects another logged-in account", async () => {
    const s = setup({ ...user, userId: 8 });
    expect(
      await s.gate.run("delete", async () => 1, s.write, s.committed),
    ).toMatchObject({ status: "error", uncertain: false });
    expect(s.write).not.toHaveBeenCalled();
  });
  it("requires current admin identity and update grant for sync", async () => {
    const custom = setup();
    expect(
      (
        await custom.gate.run(
          "sync",
          async () => ({}),
          custom.write,
          custom.committed,
        )
      ).status,
    ).toBe("error");
    expect(custom.write).not.toHaveBeenCalled();
    const adminUser = {
      ...user,
      roles: [{ roleKey: "system_admin", roleName: "Admin" }],
    };
    const admin = setup(adminUser, adminUser);
    expect(
      (
        await admin.gate.run(
          "sync",
          async () => ({}),
          admin.write,
          admin.committed,
        )
      ).status,
    ).toBe("success");
    const revoked = setup({
      ...user,
      roles: [{ roleKey: "system_admin", roleName: "Admin" }],
      permissionKeys: user.permissionKeys.filter(
        (k) => k !== "system:permission:update",
      ),
    });
    expect(
      (
        await revoked.gate.run(
          "sync",
          async () => ({}),
          revoked.write,
          revoked.committed,
        )
      ).status,
    ).toBe("error");
    expect(revoked.write).not.toHaveBeenCalled();
  });
  it("does not call identity or mutation after invalid form preparation", async () => {
    const s = setup();
    expect(
      (await s.gate.run("create", async () => null, s.write, s.committed))
        .status,
    ).toBe("ignored");
    expect(s.verify).not.toHaveBeenCalled();
    expect(s.write).not.toHaveBeenCalled();
  });
  it("does not mark a failed detail pre-read as an uncertain mutation", async () => {
    const s = setup();
    expect(
      await s.gate.run(
        "delete",
        async () => {
          throw new Error("read failed");
        },
        s.write,
        s.committed,
      ),
    ).toMatchObject({ status: "error", uncertain: false });
    expect(s.gate.isLocked()).toBe(false);
    expect(s.verify).not.toHaveBeenCalled();
    expect(s.write).not.toHaveBeenCalled();
  });
  it.each([400, 401, 403, 404, 409, 422])(
    "permits correcting a definitive HTTP %s rejection",
    async (status) => {
      const s = setup();
      s.write.mockRejectedValueOnce(apiError(status));
      expect(
        await s.gate.run("update", async () => 1, s.write, s.committed),
      ).toMatchObject({
        status: "error",
        uncertain: false,
        traceId: "trace-catalog",
      });
      expect(
        (await s.gate.run("update", async () => 1, s.write, s.committed))
          .status,
      ).toBe("success");
    },
  );
  it.each([408, 500, 503])(
    "blocks replay of an uncertain HTTP %s write until review",
    async (status) => {
      const s = setup();
      s.write.mockRejectedValueOnce(apiError(status));
      expect(
        await s.gate.run("create", async () => 1, s.write, s.committed),
      ).toMatchObject({ status: "error", uncertain: true });
      expect(
        (await s.gate.run("create", async () => 1, s.write, s.committed))
          .status,
      ).toBe("ignored");
      expect(s.write).toHaveBeenCalledOnce();
      s.gate.acknowledgeReview();
      expect(
        (await s.gate.run("create", async () => 1, s.write, s.committed))
          .status,
      ).toBe("success");
    },
  );
  it("blocks a lost network response without leaking its body", async () => {
    const s = setup();
    s.write.mockRejectedValueOnce(new Error("private details"));
    const result = await s.gate.run(
      "delete",
      async () => 1,
      s.write,
      s.committed,
    );
    expect(result).toMatchObject({ status: "error", uncertain: true });
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it.each(["prepare", "verify", "write"] as const)(
    "suppresses an unmounted %s result and callbacks",
    async (stage) => {
      const s = setup(),
        pending = deferred<number>(),
        identity = deferred<CatalogUser>();
      if (stage === "verify")
        s.verify.mockImplementationOnce(() => identity.promise);
      const write = stage === "write" ? vi.fn(() => pending.promise) : s.write;
      const work = s.gate.run(
        "update",
        stage === "prepare" ? () => pending.promise : async () => 1,
        write,
        s.committed,
      );
      await Promise.resolve();
      await Promise.resolve();
      s.gate.dispose();
      s.gate.activate();
      s.busy.mockClear();
      pending.resolve(1);
      identity.resolve(user);
      expect((await work).status).toBe("ignored");
      expect(s.committed).not.toHaveBeenCalled();
      expect(s.busy).not.toHaveBeenCalled();
    },
  );
});
