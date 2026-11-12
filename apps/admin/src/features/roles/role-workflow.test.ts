import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import {
  RoleRecoveryLedger,
  hasPendingRoleWrite,
  beginRoleWrite,
  reviewRoleWrite,
} from "@/features/roles/role-recovery";
import {
  RoleWriteGate,
  verifyRoleReader,
  roleWorkspaceKey,
  roleError,
  type RoleUser,
} from "@/features/roles/role-workflow";

const user: RoleUser = {
  userId: 1,
  account: "operator",
  nickname: "运营",
  avatarUrl: null,
  merchant: null,
  roles: [{ roleKey: "system_admin", roleName: "管理员" }],
  menuTree: [],
  permissionKeys: [
    "management:portal:enter",
    "system:role:list",
    "system:role:create",
    "system:role:update",
    "system:role:delete",
    "system:permission:assign",
  ],
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const apiError = (status: number) =>
  new ApiError("private server detail", {
    status,
    code: null,
    traceId: "trace",
  });
function setup(expected = user, current = expected, pending = false) {
  const ledger = new RoleRecoveryLedger();
  const verify = vi.fn(async () => current),
    busy = vi.fn(),
    committed = vi.fn();
  const gate = new RoleWriteGate(
    expected,
    verify,
    busy,
    () => ledger.begin(expected.userId),
    pending,
  );
  gate.activate();
  const write = vi.fn(async () => {});
  return { gate, ledger, verify, busy, write, committed };
}
describe("role mutation gate", () => {
  it("locks synchronously before async validation and verifies identity before writing", async () => {
    const s = setup(),
      validation = deferred<{ value: number }>();
    const first = s.gate.run(
      "update",
      () => validation.promise,
      s.write,
      s.committed,
    );
    expect(s.gate.isLocked()).toBe(true);
    expect(
      await s.gate.run("update", async () => ({}), s.write, s.committed),
    ).toEqual({ status: "ignored" });
    expect(s.verify).not.toHaveBeenCalled();
    validation.resolve({ value: 1 });
    expect(await first).toEqual({ status: "success" });
    expect(s.verify).toHaveBeenCalledOnce();
    expect(s.write).toHaveBeenCalledOnce();
    expect(s.committed).toHaveBeenCalledOnce();
    expect(s.ledger.has(1)).toBe(false);
    expect(s.gate.isLocked()).toBe(false);
  });
  it("does not verify or mutate an invalid form", async () => {
    const s = setup();
    expect(
      await s.gate.run("create", async () => null, s.write, s.committed),
    ).toEqual({ status: "ignored" });
    expect(s.verify).not.toHaveBeenCalled();
    expect(s.write).not.toHaveBeenCalled();
  });
  it.each([
    { ...user, userId: 2 },
    { ...user, roles: [{ roleKey: "different", roleName: "其他" }] },
    {
      ...user,
      permissionKeys: user.permissionKeys.filter(
        (k) => k !== "system:role:update",
      ),
    },
    { ...user, permissionKeys: [...user.permissionKeys, "new:grant"] },
  ])("rejects identity or grant snapshot changes", async (current) => {
    const s = setup(user, current);
    expect(
      await s.gate.run("update", async () => ({}), s.write, s.committed),
    ).toMatchObject({ status: "error", uncertain: false });
    expect(s.write).not.toHaveBeenCalled();
    expect(s.ledger.has(1)).toBe(false);
  });
  it.each(["create", "update", "delete", "authorize"] as const)(
    "requires exact permissions for %s",
    async (action) => {
      const permission =
        action === "authorize"
          ? "system:permission:assign"
          : `system:role:${action}`;
      const current = {
        ...user,
        permissionKeys: user.permissionKeys.filter((k) => k !== permission),
      };
      const s = setup(current);
      expect(
        await s.gate.run(action, async () => ({}), s.write, s.committed),
      ).toMatchObject({ status: "error", uncertain: false });
      expect(s.write).not.toHaveBeenCalled();
    },
  );
  it("requires role:update independently of permission:assign", async () => {
    const current = {
        ...user,
        permissionKeys: user.permissionKeys.filter(
          (k) => k !== "system:role:update",
        ),
      },
      s = setup(current);
    await s.gate.run("authorize", async () => ({}), s.write, s.committed);
    expect(s.write).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "uses grants for delegated edits and requires admin only for authorization settings (%s)",
    async (requiresAdmin) => {
      const current = {
          ...user,
          roles: [{ roleKey: "custom_editor", roleName: "编辑" }],
        },
        s = setup(current);
      const result = await s.gate.run(
        "update",
        async () => ({}),
        s.write,
        s.committed,
        requiresAdmin,
      );
      expect(result.status).toBe(requiresAdmin ? "error" : "success");
      expect(s.write).toHaveBeenCalledTimes(requiresAdmin ? 0 : 1);
    },
  );
  it("rejects delegated authorization even with both grants", async () => {
    const s = setup({
      ...user,
      roles: [{ roleKey: "custom_editor", roleName: "编辑" }],
    });
    await s.gate.run("authorize", async () => ({}), s.write, s.committed);
    expect(s.write).not.toHaveBeenCalled();
  });
  it.each([400, 401, 403, 404, 409, 422, 429])(
    "allows correction after definitive HTTP %s rejection",
    async (status) => {
      const s = setup();
      s.write.mockRejectedValueOnce(apiError(status));
      expect(
        await s.gate.run("update", async () => ({}), s.write, s.committed),
      ).toMatchObject({ status: "error", uncertain: false, traceId: "trace" });
      expect(s.ledger.has(1)).toBe(false);
      expect(s.gate.isLocked()).toBe(false);
      expect(
        await s.gate.run("update", async () => ({}), s.write, s.committed),
      ).toEqual({ status: "success" });
    },
  );
  it.each([new Error("network"), apiError(408), apiError(500), apiError(503)])(
    "blocks unknown outcomes until explicit review",
    async (cause) => {
      const s = setup();
      s.write.mockRejectedValueOnce(cause);
      expect(
        await s.gate.run("delete", async () => 7, s.write, s.committed),
      ).toMatchObject({ status: "error", uncertain: true });
      expect(s.ledger.has(1)).toBe(true);
      expect(s.gate.isLocked()).toBe(true);
      await s.gate.run("delete", async () => 7, s.write, s.committed);
      expect(s.write).toHaveBeenCalledOnce();
      s.ledger.review(1);
      s.gate.acknowledge();
      expect(
        await s.gate.run("delete", async () => 7, s.write, s.committed),
      ).toEqual({ status: "success" });
    },
  );
  it("does not mark failed pre-read or verification as an attempted mutation", async () => {
    const s = setup();
    await s.gate.run(
      "delete",
      async () => {
        throw apiError(503);
      },
      s.write,
      s.committed,
    );
    expect(s.gate.isLocked()).toBe(false);
    expect(s.ledger.has(1)).toBe(false);
    s.verify.mockRejectedValueOnce(new Error("network"));
    await s.gate.run("update", async () => ({}), s.write, s.committed);
    expect(s.write).not.toHaveBeenCalled();
    expect(s.ledger.has(1)).toBe(false);
  });
  it("stops before sending after disposal during validation", async () => {
    const s = setup(),
      validation = deferred<object>();
    const task = s.gate.run(
      "update",
      () => validation.promise,
      s.write,
      s.committed,
    );
    s.gate.dispose();
    validation.resolve({});
    await task;
    expect(s.write).not.toHaveBeenCalled();
    expect(s.busy.mock.calls).toEqual([[true]]);
  });
  it("resumes a suspended preparation without allowing the old intent to write", async () => {
    const s = setup(),
      validation = deferred<object>();
    const old = s.gate.run(
      "update",
      () => validation.promise,
      s.write,
      s.committed,
    );
    s.gate.dispose();
    expect(s.gate.isRunning()).toBe(false);
    s.gate.activate(false);
    expect(
      await s.gate.run("update", async () => ({}), s.write, s.committed),
    ).toEqual({ status: "success" });
    validation.resolve({});
    expect(await old).toEqual({ status: "ignored" });
    expect(s.write).toHaveBeenCalledOnce();
    expect(s.committed).toHaveBeenCalledOnce();
  });
  it("keeps an interrupted dispatched write blocked on resume until explicit review", async () => {
    const s = setup(),
      response = deferred<void>();
    s.write.mockImplementationOnce(() => response.promise);
    const pending = s.gate.run(
      "update",
      async () => ({}),
      s.write,
      s.committed,
    );
    await vi.waitFor(() => expect(s.write).toHaveBeenCalledOnce());
    s.gate.dispose();
    s.gate.activate(s.ledger.has(1));
    expect(
      await s.gate.run("update", async () => ({}), s.write, s.committed),
    ).toEqual({ status: "ignored" });
    response.reject(new Error("network"));
    expect(await pending).toEqual({ status: "ignored" });
    expect(s.ledger.has(1)).toBe(true);
    expect(s.gate.isLocked()).toBe(true);
    s.ledger.review(1);
    s.gate.acknowledge();
    expect(
      await s.gate.run("update", async () => ({}), s.write, s.committed),
    ).toEqual({ status: "success" });
  });
  it("rejects malformed local identity before preparation can request any role", async () => {
    const s = setup({ ...user, roles: [null] } as unknown as RoleUser),
      prepare = vi.fn(async () => ({}));
    expect(
      await s.gate.run("update", prepare, s.write, s.committed),
    ).toMatchObject({ status: "error", uncertain: false });
    expect(prepare).not.toHaveBeenCalled();
    expect(s.write).not.toHaveBeenCalled();
  });
  it.each(["success", "definitive", "unknown"])(
    "handles late %s without unmounted callbacks or clearing newer operations",
    async (outcome) => {
      const s = setup(),
        response = deferred<void>();
      s.write.mockImplementationOnce(() => response.promise);
      const task = s.gate.run("update", async () => ({}), s.write, s.committed);
      await vi.waitFor(() => expect(s.write).toHaveBeenCalledOnce());
      s.gate.dispose();
      const finishNew = s.ledger.begin(1);
      if (outcome === "success") response.resolve();
      else
        response.reject(
          outcome === "definitive" ? apiError(403) : new Error("network"),
        );
      expect(await task).toEqual({ status: "ignored" });
      expect(s.committed).not.toHaveBeenCalled();
      expect(s.busy.mock.calls).toEqual([[true]]);
      expect(s.ledger.has(1)).toBe(true);
      finishNew();
      expect(s.ledger.has(1)).toBe(outcome === "unknown");
    },
  );
  it("retains pending state on a new gate and refuses acknowledgement while writing", async () => {
    const s = setup(user, user, true);
    await s.gate.run("update", async () => ({}), s.write, s.committed);
    expect(s.write).not.toHaveBeenCalled();
    s.gate.acknowledge();
    const validation = deferred<object>();
    const task = s.gate.run(
      "update",
      () => validation.promise,
      s.write,
      s.committed,
    );
    s.gate.acknowledge();
    expect(s.gate.isLocked()).toBe(true);
    validation.resolve({});
    await task;
  });
});
describe("role recovery and read identity", () => {
  it("isolates account and operation tokens even after an explicit review", () => {
    const ledger = new RoleRecoveryLedger(),
      old = ledger.begin(1),
      other = ledger.begin(2);
    ledger.review(1);
    const current = ledger.begin(1);
    old();
    expect(ledger.has(1)).toBe(true);
    expect(ledger.has(2)).toBe(true);
    current();
    expect(ledger.has(1)).toBe(false);
    other();
    expect(ledger.has(2)).toBe(false);
  });
  it("does not share account state between server requests", () => {
    beginRoleWrite(1);
    expect(hasPendingRoleWrite(1)).toBe(false);
    reviewRoleWrite(1);
  });
  it("retains browser memory across feature remounts", () => {
    vi.stubGlobal("window", {});
    try {
      const finish = beginRoleWrite(9);
      expect(hasPendingRoleWrite(9)).toBe(true);
      expect(hasPendingRoleWrite(10)).toBe(false);
      finish();
      expect(hasPendingRoleWrite(9)).toBe(false);
    } finally {
      reviewRoleWrite(9);
      vi.unstubAllGlobals();
    }
  });
  it("normalizes order of grants but rejects missing management entry", () => {
    expect(
      roleWorkspaceKey({
        ...user,
        permissionKeys: [...user.permissionKeys].reverse(),
      }),
    ).toBe(roleWorkspaceKey(user));
    expect(() =>
      verifyRoleReader({ ...user, permissionKeys: ["system:role:list"] }, user),
    ).toThrow();
  });
  it.each([401, 403, 404, 500])(
    "redacts raw HTTP %s errors while retaining trace ID",
    (status) => {
      expect(roleError(apiError(status))).not.toContain(
        "private server detail",
      );
      expect(roleError(apiError(status))).toContain("trace");
    },
  );
});
