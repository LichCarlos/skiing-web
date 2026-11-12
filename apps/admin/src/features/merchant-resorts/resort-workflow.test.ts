import { describe, it, expect, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import {
  ResortRecoveryLedger,
  ResortWriteGate,
} from "@/features/merchant-resorts/resort-workflow";
import {
  operator,
  deferred,
} from "@/features/merchant-resorts/resort-fixtures.test-helper";
import type { ResortMutation } from "@/features/merchant-resorts/resort-model";
const mutation: ResortMutation = { action: "update", resortId: 42 };
function setup(ledger = new ResortRecoveryLedger()) {
  const verify = vi.fn(async () => operator),
    write = vi.fn(async () => 42),
    committed = vi.fn(),
    busy = vi.fn();
  const gate = new ResortWriteGate(operator, verify, ledger, busy);
  gate.activate();
  return { gate, ledger, verify, write, committed, busy };
}
describe("merchant resort write workflow", () => {
  it("locks synchronously while validation is unresolved", async () => {
    const s = setup(),
      pending = deferred<string>();
    const first = s.gate.run(
      mutation,
      () => pending.promise,
      s.write,
      s.committed,
    );
    expect(
      await s.gate.run(mutation, async () => "x", s.write, s.committed),
    ).toEqual({ status: "ignored" });
    pending.resolve("validated");
    expect(await first).toEqual({ status: "success" });
    expect(s.write).toHaveBeenCalledTimes(1);
  });
  it.each(["create", "update", "delete", "submit-review"] as const)(
    "checks the exact %s grant before writing",
    async (action) => {
      const s = setup();
      s.verify.mockResolvedValue({
        ...operator,
        permissionKeys: operator.permissionKeys.filter(
          (key) => key !== `resort:merchant:${action}`,
        ),
      });
      await s.gate.run(
        action === "create"
          ? { action, name: "雪场" }
          : { action, resortId: 42 },
        async () => "x",
        s.write,
        s.committed,
      );
      expect(s.write).not.toHaveBeenCalled();
      expect(s.ledger.entries(1)).toEqual([]);
    },
  );
  it("rejects merchant reassignment before submission", async () => {
    const s = setup();
    s.verify.mockResolvedValue({ ...operator, merchant: { merchantId: 8 } });
    await s.gate.run(mutation, async () => "x", s.write, s.committed);
    expect(s.write).not.toHaveBeenCalled();
  });
  it("does not write after validation was cancelled by unmount", async () => {
    const s = setup(),
      pending = deferred<string>();
    const task = s.gate.run(
      mutation,
      () => pending.promise,
      s.write,
      s.committed,
    );
    s.gate.dispose();
    pending.resolve("x");
    await task;
    expect(s.verify).not.toHaveBeenCalled();
    expect(s.write).not.toHaveBeenCalled();
  });
  it("does not record a validation failure as an unknown server result", async () => {
    const s = setup();
    await s.gate.run(
      mutation,
      async () => {
        throw new Error("invalid");
      },
      s.write,
      s.committed,
    );
    expect(s.write).not.toHaveBeenCalled();
    expect(s.ledger.entries(1)).toEqual([]);
  });
  it.each([400, 401, 403, 404, 409, 422, 429])(
    "clears a definitive %s without automatic replay",
    async (status) => {
      const s = setup();
      s.write.mockRejectedValue(
        new ApiError("denied", { status, code: status, traceId: null }),
      );
      expect(
        await s.gate.run(mutation, async () => "x", s.write, s.committed),
      ).toMatchObject({ status: "error", uncertain: false });
      expect(s.ledger.entries(1)).toEqual([]);
      expect(s.write).toHaveBeenCalledTimes(1);
    },
  );
  it.each([408, 500, 503])(
    "retains uncertain %s and blocks retries across remount",
    async (status) => {
      const s = setup();
      s.write.mockRejectedValue(
        new ApiError("unknown", { status, code: status, traceId: "trace" }),
      );
      expect(
        await s.gate.run(mutation, async () => "x", s.write, s.committed),
      ).toMatchObject({ uncertain: true });
      const next = setup(s.ledger);
      expect(
        await next.gate.run(
          mutation,
          async () => "x",
          next.write,
          next.committed,
        ),
      ).toEqual({ status: "ignored" });
      expect(s.ledger.entries(2)).toEqual([]);
      expect(next.write).not.toHaveBeenCalled();
    },
  );
  it("retains requests still in flight after unmount and ignores their late callbacks", async () => {
    const s = setup(),
      pending = deferred<number>();
    s.write.mockReturnValue(pending.promise);
    const task = s.gate.run(mutation, async () => "x", s.write, s.committed);
    await vi.waitFor(() => expect(s.write).toHaveBeenCalledTimes(1));
    s.gate.dispose();
    expect(s.ledger.acknowledge(1, s.ledger.version)).toBe(false);
    pending.resolve(42);
    await task;
    expect(s.committed).not.toHaveBeenCalled();
    expect(s.ledger.entries(1)).toEqual([]);
  });
  it("does not release a recovery review after a newer operation changed its version", () => {
    const ledger = new ResortRecoveryLedger(),
      finish = ledger.begin(1, mutation);
    finish(false);
    const version = ledger.version;
    const second = ledger.begin(1, { action: "delete", resortId: 43 });
    second(false);
    expect(ledger.acknowledge(1, version)).toBe(false);
    expect(ledger.entries(1)).toHaveLength(2);
    expect(ledger.acknowledge(1, ledger.version)).toBe(true);
  });
});
