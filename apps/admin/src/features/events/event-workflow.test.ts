import { describe, it, expect, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import {
  EventConflictError,
  eventMutation,
  EventInputError,
} from "@/features/events/event-model";
import {
  EventRecoveryLedger,
  EventWriteGate,
} from "@/features/events/event-workflow";
import {
  operator,
  item,
  deferred,
} from "@/features/events/event-fixtures.test-helper";
const mutation = eventMutation(item);
function setup(ledger = new EventRecoveryLedger()) {
  const verify = vi.fn(async () => operator),
    busy = vi.fn(),
    write = vi.fn(async () => undefined),
    committed = vi.fn();
  const gate = new EventWriteGate(operator, verify, ledger, busy);
  gate.activate();
  return { ledger, gate, verify, busy, write, committed };
}
describe("event retry lifecycle", () => {
  it("retains an unknown record when a successful response arrives after disposal", async () => {
    const s = setup(),
      pending = deferred<void>();
    const task = s.gate.run(
      mutation,
      async () => item.eventId,
      () => pending.promise,
      s.committed,
    );
    await vi.waitFor(() => expect(s.ledger.entries(1)).toHaveLength(1));
    s.gate.dispose();
    pending.resolve();
    expect(await task).toEqual({ status: "ignored" });
    expect(s.ledger.entries(1)[0]?.inFlight).toBe(false);
    expect(s.committed).not.toHaveBeenCalled();
    expect(setup(s.ledger).gate.isLocked()).toBe(true);
  });
  it("retains the committed-but-unconfirmed outcome after final authorization changes", async () => {
    const s = setup();
    s.verify.mockResolvedValueOnce(operator).mockResolvedValueOnce({
      ...operator,
      permissionKeys: operator.permissionKeys.filter(
        (k) => k !== "system:event:retry",
      ),
    });
    expect(
      await s.gate.run(
        mutation,
        async () => item.eventId,
        s.write,
        s.committed,
      ),
    ).toMatchObject({ status: "error", uncertain: true });
    expect(s.write).toHaveBeenCalledTimes(1);
    expect(s.committed).not.toHaveBeenCalled();
    expect(s.gate.isLocked()).toBe(true);
  });
  it("retains recovery if final authorization is cancelled after the server response", async () => {
    const s = setup(),
      pending = deferred<typeof operator>();
    s.verify
      .mockResolvedValueOnce(operator)
      .mockImplementationOnce(() => pending.promise);
    const task = s.gate.run(
      mutation,
      async () => item.eventId,
      s.write,
      s.committed,
    );
    await vi.waitFor(() => expect(s.verify).toHaveBeenCalledTimes(2));
    s.gate.dispose();
    pending.resolve(operator);
    expect(await task).toEqual({ status: "ignored" });
    expect(s.ledger.entries(1)).toHaveLength(1);
    expect(s.committed).not.toHaveBeenCalled();
  });
  it("blocks two component gates sharing the same account ledger before a duplicate dispatch", async () => {
    const a = setup(),
      b = setup(a.ledger),
      pending = deferred<void>();
    const first = a.gate.run(
      mutation,
      async () => item.eventId,
      () => pending.promise,
      a.committed,
    );
    await vi.waitFor(() => expect(a.ledger.entries(1)).toHaveLength(1));
    expect(
      await b.gate.run(
        mutation,
        async () => item.eventId,
        b.write,
        b.committed,
      ),
    ).toEqual({ status: "ignored" });
    expect(b.write).not.toHaveBeenCalled();
    pending.resolve();
    await first;
  });
  it("requires a current completed read proof and invalidates it when another ledger record changes", () => {
    const s = setup(),
      settle = s.ledger.begin(1, mutation);
    expect(s.ledger.confirmRead(1, s.ledger.version)).toBe(false);
    settle(false);
    const version = s.ledger.version;
    expect(s.ledger.acknowledge(1, version)).toBe(false);
    expect(s.ledger.confirmRead(1, version)).toBe(true);
    s.ledger.begin(2, mutation)(false);
    expect(s.ledger.acknowledge(1, version)).toBe(false);
    expect(s.ledger.acknowledge(1, s.ledger.version)).toBe(false);
    expect(s.ledger.confirmRead(1, s.ledger.version)).toBe(true);
    expect(s.ledger.acknowledge(1, s.ledger.version)).toBe(true);
    expect(s.ledger.entries(1)).toHaveLength(0);
    expect(s.ledger.entries(2)).toHaveLength(1);
  });
  it.each(["preflight", "server"])(
    "reports a %s conflict without rebasing or keeping an unknown write",
    async (kind) => {
      const s = setup();
      const result = await s.gate.run(
        mutation,
        async () => {
          if (kind === "preflight") throw new EventConflictError("事件已变化");
          return item.eventId;
        },
        async () => {
          throw new ApiError("conflict", {
            status: 409,
            code: 409,
            traceId: null,
          });
        },
        s.committed,
      );
      expect(result).toMatchObject({
        status: "error",
        conflict: true,
        uncertain: false,
      });
      expect(s.ledger.entries(1)).toEqual([]);
      expect(s.committed).not.toHaveBeenCalled();
    },
  );
  it("keeps a mismatched retry receipt unknown rather than accepting a successful HTTP status", async () => {
    const s = setup();
    const result = await s.gate.run(
      mutation,
      async () => item.eventId,
      async () => {
        throw new EventInputError("重试返回内容不匹配");
      },
      s.committed,
    );
    expect(result).toMatchObject({ status: "error", uncertain: true });
    expect(s.ledger.entries(1)).toHaveLength(1);
    expect(s.committed).not.toHaveBeenCalled();
  });
  it("stores only immutable locator and counters, and returns defensive copies", () => {
    const s = setup(),
      original = eventMutation(item);
    const settle = s.ledger.begin(1, {
      ...original,
      reason: "private reason",
      payload: "secret",
    } as typeof original);
    original.target.eventId = "changed externally";
    settle(false);
    const entries = s.ledger.entries(1);
    expect(entries[0]?.mutation).toEqual(mutation);
    entries[0]!.mutation.target.eventId = "changed copy";
    expect(s.ledger.entries(1)[0]?.mutation).toEqual(mutation);
    expect(JSON.stringify(s.ledger.entries(1))).not.toMatch(
      /private reason|payload|secret/,
    );
  });
  it("locks synchronously before fresh-target preparation", async () => {
    const s = setup(),
      pending = deferred<string>();
    const task = s.gate.run(
      mutation,
      () => pending.promise,
      s.write,
      s.committed,
    );
    expect(
      await s.gate.run(
        mutation,
        async () => item.eventId,
        s.write,
        s.committed,
      ),
    ).toEqual({ status: "ignored" });
    pending.resolve(item.eventId);
    expect(await task).toEqual({ status: "success" });
    expect(s.write).toHaveBeenCalledTimes(1);
  });
  it.each([
    "management:portal:enter",
    "system:event:list",
    "system:event:retry",
  ])("checks current %s immediately before retry", async (grant) => {
    const s = setup();
    s.verify.mockResolvedValue({
      ...operator,
      permissionKeys: operator.permissionKeys.filter((key) => key !== grant),
    });
    await s.gate.run(mutation, async () => item.eventId, s.write, s.committed);
    expect(s.write).not.toHaveBeenCalled();
  });
  it("refuses actor changes and disposal during preparation", async () => {
    const s = setup();
    s.verify.mockResolvedValue({ ...operator, userId: 2 });
    await s.gate.run(mutation, async () => item.eventId, s.write, s.committed);
    expect(s.write).not.toHaveBeenCalled();
    const pending = deferred<string>();
    const task = s.gate.run(
      mutation,
      () => pending.promise,
      s.write,
      s.committed,
    );
    s.gate.dispose();
    pending.resolve(item.eventId);
    await task;
    expect(s.write).not.toHaveBeenCalled();
  });
  it.each([400, 401, 403, 404, 409, 422, 429])(
    "does not replay definitive status %s",
    async (status) => {
      const s = setup();
      expect(
        await s.gate.run(
          mutation,
          async () => item.eventId,
          async () => {
            throw new ApiError("refused", {
              status,
              code: status,
              traceId: null,
            });
          },
          s.committed,
        ),
      ).toMatchObject({ status: "error", uncertain: false });
      expect(s.ledger.entries(1)).toEqual([]);
    },
  );
  it.each([401, 403, 429, 503])(
    "keeps a completed write protected when final identity verification returns %s",
    async (status) => {
      const s = setup();
      s.verify.mockResolvedValueOnce(operator);
      s.verify.mockRejectedValueOnce(
        new ApiError("identity unavailable", {
          status,
          code: status,
          traceId: null,
        }),
      );
      const result = await s.gate.run(
        mutation,
        async () => item.eventId,
        s.write,
        s.committed,
      );
      expect(result).toMatchObject({ status: "error", uncertain: true });
      expect(s.write).toHaveBeenCalledTimes(1);
      expect(s.committed).not.toHaveBeenCalled();
      expect(s.ledger.entries(1)).toHaveLength(1);
      expect(s.ledger.entries(1)[0]?.inFlight).toBe(false);
      expect(s.gate.isLocked()).toBe(true);
    },
  );
  it.each([0, 408, 500])(
    "retains uncertain outcome %s and blocks retry",
    async (status) => {
      const s = setup();
      expect(
        await s.gate.run(
          mutation,
          async () => item.eventId,
          async () => {
            throw new ApiError("unknown", {
              status,
              code: status,
              traceId: null,
            });
          },
          s.committed,
        ),
      ).toMatchObject({ status: "error", uncertain: true });
      expect(s.gate.isLocked()).toBe(true);
      expect(
        await s.gate.run(
          mutation,
          async () => item.eventId,
          s.write,
          s.committed,
        ),
      ).toEqual({ status: "ignored" });
    },
  );
  it("keeps the original request in flight across remount and forbids premature acknowledgement", async () => {
    const s = setup(),
      pending = deferred<void>();
    const task = s.gate.run(
      mutation,
      async () => item.eventId,
      () => pending.promise,
      s.committed,
    );
    await vi.waitFor(() => expect(s.ledger.entries(1)).toHaveLength(1));
    s.gate.dispose();
    const next = setup(s.ledger);
    expect(next.gate.isLocked()).toBe(true);
    expect(s.ledger.acknowledge(1, s.ledger.version)).toBe(false);
    pending.reject(new Error("cancelled"));
    await task;
    expect(s.committed).not.toHaveBeenCalled();
    expect(s.ledger.entries(1)[0]?.inFlight).toBe(false);
  });
  it("isolates accounts and rejects a stale review version", () => {
    const s = setup(),
      settle = s.ledger.begin(1, mutation),
      old = s.ledger.version;
    settle(false);
    expect(s.ledger.entries(2)).toEqual([]);
    expect(s.ledger.acknowledge(1, old)).toBe(false);
    expect(s.ledger.acknowledge(1, s.ledger.version)).toBe(false);
    expect(s.ledger.confirmRead(1, s.ledger.version)).toBe(true);
    expect(s.ledger.acknowledge(1, s.ledger.version)).toBe(true);
  });
  it("isolates strict-mode reactivation and confirmed callback errors", async () => {
    const s = setup(),
      pending = deferred<string>();
    const task = s.gate.run(
      mutation,
      () => pending.promise,
      s.write,
      s.committed,
    );
    s.gate.dispose();
    s.gate.activate();
    pending.resolve(item.eventId);
    await task;
    expect(s.write).not.toHaveBeenCalled();
    await s.gate.run(
      mutation,
      async () => item.eventId,
      s.write,
      () => {
        throw new Error("render failure");
      },
    );
    expect(s.ledger.entries(1)).toEqual([]);
  });
});
