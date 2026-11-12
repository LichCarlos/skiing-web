import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import { AccountWriteGate } from "@/features/users/user-workflow";
import {
  AccountRecoveryLedger,
  beginAccountMutation,
  pendingAccountMutations,
  reviewAccountMutations,
  type AccountMutation,
} from "@/features/users/user-recovery";
import { operator, deferred } from "@/features/users/user-fixtures.test-helper";
const mutation: AccountMutation = { action: "status", userId: 7 };
const prepared = async () => ({ body: { status: "disabled" }, mutation });
const error = (status: number) =>
  new ApiError("private-password", { status, code: null, traceId: "trace" });
function setup(current = operator, pending = false) {
  const ledger = new AccountRecoveryLedger(),
    busy = vi.fn(),
    verify = vi.fn(async () => current),
    committed = vi.fn(),
    write = vi.fn(async () => {});
  const gate = new AccountWriteGate(
    current,
    verify,
    busy,
    (m) => ledger.begin(current.userId, m),
    pending,
  );
  gate.activate();
  return { gate, ledger, busy, verify, committed, write };
}
afterEach(() => vi.unstubAllGlobals());
describe("account write gate", () => {
  it("locks before async validation, rejects a competing action, and verifies before writing", async () => {
    const s = setup(),
      validate = deferred<Awaited<ReturnType<typeof prepared>>>();
    const first = s.gate.run(
      "status",
      () => validate.promise,
      s.write,
      s.committed,
    );
    expect(s.gate.isLocked()).toBe(true);
    expect(await s.gate.run("status", prepared, s.write, s.committed)).toEqual({
      status: "ignored",
    });
    expect(s.verify).not.toHaveBeenCalled();
    validate.resolve(await prepared());
    expect(await first).toEqual({ status: "success" });
    expect(s.verify).toHaveBeenCalledOnce();
    expect(s.write).toHaveBeenCalledOnce();
    expect(s.committed).toHaveBeenCalledOnce();
    expect(s.ledger.has(1)).toBe(false);
    expect(s.gate.isLocked()).toBe(false);
  });
  it("does not mutate an invalid form or an action-mismatched descriptor", async () => {
    const s = setup();
    expect(
      await s.gate.run("create", async () => null, s.write, s.committed),
    ).toEqual({ status: "ignored" });
    expect(
      await s.gate.run("roles", prepared, s.write, s.committed),
    ).toMatchObject({ status: "error", uncertain: false });
    expect(s.verify).not.toHaveBeenCalled();
    expect(s.write).not.toHaveBeenCalled();
  });
  it.each(["create", "roles", "status"] as const)(
    "requires exact %s action grant",
    async (action) => {
      const key =
        action === "roles"
          ? "system:user:assign-role"
          : action === "status"
            ? "system:user:update"
            : "system:user:create";
      const s = setup({
        ...operator,
        permissionKeys: operator.permissionKeys.filter((k) => k !== key),
      });
      const descriptor: AccountMutation =
        action === "create"
          ? { action, account: "snow" }
          : { action, userId: 7 };
      expect(
        await s.gate.run(
          action,
          async () => ({ body: {}, mutation: descriptor }),
          s.write,
          s.committed,
        ),
      ).toMatchObject({ status: "error", uncertain: false });
      expect(s.write).not.toHaveBeenCalled();
    },
  );
  it.each([
    { ...operator, userId: 2 },
    {
      ...operator,
      permissionKeys: operator.permissionKeys.filter(
        (k) => k !== "management:portal:enter",
      ),
    },
    { ...operator, permissionKeys: [...operator.permissionKeys, "new:grant"] },
    { ...operator, roles: [{ roleKey: "other", roleName: "Other" }] },
  ])(
    "rejects a fresh identity snapshot change before writing",
    async (current) => {
      const s = setup();
      s.verify.mockResolvedValue(current);
      expect(
        await s.gate.run("status", prepared, s.write, s.committed),
      ).toMatchObject({ status: "error", uncertain: false });
      expect(s.write).not.toHaveBeenCalled();
      expect(s.ledger.has(1)).toBe(false);
    },
  );
  it("does not require a merchant role key or system_admin for delegated account actions", async () => {
    const s = setup({
      ...operator,
      merchant: { merchantId: 8, businessName: "雪场" },
    });
    expect(await s.gate.run("status", prepared, s.write, s.committed)).toEqual({
      status: "success",
    });
  });
  it.each([400, 401, 403, 404, 409, 429])(
    "unlocks a definitive HTTP %s rejection and redacts server text",
    async (status) => {
      const s = setup();
      s.write.mockRejectedValue(error(status));
      const result = await s.gate.run("status", prepared, s.write, s.committed);
      expect(result).toMatchObject({
        status: "error",
        uncertain: false,
        traceId: "trace",
      });
      expect(JSON.stringify(result)).not.toContain("private-password");
      expect(s.ledger.has(1)).toBe(false);
      expect(s.gate.isLocked()).toBe(false);
      expect(s.committed).not.toHaveBeenCalled();
    },
  );
  it.each([408, 500, 503, "network"])(
    "blocks unknown %s write results without retrying",
    async (status) => {
      const s = setup();
      s.write.mockRejectedValue(
        typeof status === "number"
          ? error(status)
          : new Error("private-network"),
      );
      expect(
        await s.gate.run("status", prepared, s.write, s.committed),
      ).toMatchObject({ status: "error", uncertain: true });
      expect(s.ledger.entries(1)).toEqual([mutation]);
      expect(s.gate.isLocked()).toBe(true);
      expect(
        await s.gate.run("status", prepared, s.write, s.committed),
      ).toEqual({ status: "ignored" });
      expect(s.write).toHaveBeenCalledOnce();
      s.gate.acknowledge();
      expect(s.gate.isLocked()).toBe(false);
    },
  );
  it("treats failed identity checks as pre-write failures", async () => {
    const s = setup();
    s.verify.mockRejectedValue(error(503));
    expect(
      await s.gate.run("status", prepared, s.write, s.committed),
    ).toMatchObject({ uncertain: false });
    expect(s.ledger.has(1)).toBe(false);
    expect(s.write).not.toHaveBeenCalled();
  });
  it("starts a remounted gate blocked by an existing pending operation", async () => {
    const s = setup(operator, true);
    expect(await s.gate.run("status", prepared, s.write, s.committed)).toEqual({
      status: "ignored",
    });
    s.gate.acknowledge();
    expect(await s.gate.run("status", prepared, s.write, s.committed)).toEqual({
      status: "success",
    });
  });
  it.each(["validation", "identity"])(
    "does not write after disposal during %s",
    async (phase) => {
      const s = setup(),
        validate = deferred<Awaited<ReturnType<typeof prepared>>>(),
        identity = deferred<typeof operator>();
      if (phase === "identity") s.verify.mockReturnValue(identity.promise);
      const run = s.gate.run(
        "status",
        phase === "validation" ? () => validate.promise : prepared,
        s.write,
        s.committed,
      );
      if (phase === "identity")
        await vi.waitFor(() => expect(s.verify).toHaveBeenCalledOnce());
      s.gate.dispose();
      validate.resolve(await prepared());
      identity.resolve(operator);
      expect(await run).toEqual({ status: "ignored" });
      expect(s.write).not.toHaveBeenCalled();
      expect(s.busy).toHaveBeenCalledTimes(1);
      expect(s.committed).not.toHaveBeenCalled();
    },
  );
  it.each(["success", "rejected", "unknown"])(
    "suppresses late UI callbacks and resolves only definitive %s results",
    async (outcome) => {
      const s = setup(),
        response = deferred<void>();
      s.write.mockReturnValue(response.promise);
      const run = s.gate.run("status", prepared, s.write, s.committed);
      await vi.waitFor(() => expect(s.write).toHaveBeenCalledOnce());
      expect(s.ledger.has(1)).toBe(true);
      s.gate.dispose();
      if (outcome === "success") response.resolve();
      else response.reject(error(outcome === "rejected" ? 403 : 503));
      expect(await run).toEqual({ status: "ignored" });
      expect(s.committed).not.toHaveBeenCalled();
      expect(s.busy).toHaveBeenCalledTimes(1);
      expect(s.ledger.has(1)).toBe(outcome === "unknown");
    },
  );
});
describe("account recovery ledger", () => {
  it("keeps only sanitized operation descriptors, isolated by operator and operation", () => {
    const ledger = new AccountRecoveryLedger();
    const finish = ledger.begin(1, {
      action: "create",
      account: "snow",
      password: "secret",
    } as AccountMutation);
    ledger.begin(1, { action: "roles", userId: 7 });
    ledger.begin(2, { action: "status", userId: 9 });
    expect(ledger.entries(1)).toEqual([
      { action: "create", account: "snow" },
      { action: "roles", userId: 7 },
    ]);
    finish();
    expect(ledger.entries(1)).toEqual([{ action: "roles", userId: 7 }]);
    expect(ledger.has(2)).toBe(true);
    ledger.review(1);
    expect(ledger.has(1)).toBe(false);
    expect(ledger.has(2)).toBe(true);
  });
  it("does not let an old finalizer clear a new operation after review", () => {
    const ledger = new AccountRecoveryLedger(),
      finish = ledger.begin(1, mutation);
    ledger.review(1);
    ledger.begin(1, { action: "roles", userId: 8 });
    finish();
    expect(ledger.entries(1)).toEqual([{ action: "roles", userId: 8 }]);
  });
  it("has no process-wide SSR account records", () => {
    beginAccountMutation(1, mutation);
    expect(pendingAccountMutations(1)).toEqual([]);
  });
  it("retains browser records across feature remounts without credentials", () => {
    vi.stubGlobal("window", {});
    reviewAccountMutations(1);
    const finish = beginAccountMutation(1, mutation);
    expect(pendingAccountMutations(1)).toEqual([mutation]);
    finish();
    expect(pendingAccountMutations(1)).toEqual([]);
  });
});
