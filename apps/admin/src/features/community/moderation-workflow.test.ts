import { describe, it, expect, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import {
  ModerationRecoveryLedger,
  ModerationWriteGate,
} from "@/features/community/moderation-workflow";
import { mutationFor } from "@/features/community/moderation-model";
import { RequestLane } from "@/platform/api/request-lane";
import {
  operator,
  target,
  deferred,
} from "@/features/community/moderation-fixtures.test-helper";
const mutation = mutationFor(target);
function setup(ledger = new ModerationRecoveryLedger()) {
  const verify = vi.fn(async () => operator),
    busy = vi.fn(),
    write = vi.fn(async () => "saved"),
    committed = vi.fn();
  const gate = new ModerationWriteGate(operator, verify, ledger, busy);
  gate.activate();
  return { verify, busy, write, committed, gate, ledger };
}
describe("moderation write and recovery lifecycle", () => {
  it("arbitrates independently prepared gates sharing the account ledger", async () => {
    const ledger = new ModerationRecoveryLedger(),
      a = setup(ledger),
      b = setup(ledger),
      firstIdentity = deferred<typeof operator>(),
      secondIdentity = deferred<typeof operator>(),
      reply = deferred<string>();
    a.verify.mockImplementation(() => firstIdentity.promise);
    b.verify.mockImplementation(() => secondIdentity.promise);
    a.write.mockImplementation(() => reply.promise);
    const first = a.gate.run(mutation, async () => 7, a.write, a.committed),
      second = b.gate.run(mutation, async () => 7, b.write, b.committed);
    await vi.waitFor(() => expect(b.verify).toHaveBeenCalled());
    firstIdentity.resolve(operator);
    await vi.waitFor(() => expect(a.write).toHaveBeenCalledOnce());
    secondIdentity.resolve(operator);
    expect(await second).toEqual({ status: "ignored" });
    expect(b.write).not.toHaveBeenCalled();
    reply.resolve("saved");
    await first;
    a.gate.dispose();
    b.gate.dispose();
  });
  it("rejects malformed local identity before preparation", async () => {
    const verify = vi.fn(async () => operator),
      prepare = vi.fn(async () => 7),
      write = vi.fn();
    const gate = new ModerationWriteGate(
      { ...operator, nickname: null } as never,
      verify,
      new ModerationRecoveryLedger(),
      () => {},
    );
    gate.activate();
    expect(await gate.run(mutation, prepare, write, () => {})).toMatchObject({
      status: "error",
      uncertain: false,
    });
    expect(prepare).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    gate.dispose();
  });
  it("takes the synchronous lock before asynchronous validation", async () => {
    const s = setup(),
      pending = deferred<number>(),
      prepare = vi.fn(() => pending.promise);
    const task = s.gate.run(mutation, prepare, s.write, s.committed);
    expect(await s.gate.run(mutation, prepare, s.write, s.committed)).toEqual({
      status: "ignored",
    });
    pending.resolve(7);
    expect(await task).toEqual({ status: "success" });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(s.write).toHaveBeenCalledTimes(1);
  });
  it.each(["management:portal:enter", "content:dynamic:moderate"])(
    "refuses a revoked %s before writing",
    async (grant) => {
      const s = setup();
      s.verify.mockResolvedValue({
        ...operator,
        permissionKeys: operator.permissionKeys.filter((key) => key !== grant),
      });
      expect(
        await s.gate.run(mutation, async () => 7, s.write, s.committed),
      ).toMatchObject({ status: "error", uncertain: false });
      expect(s.write).not.toHaveBeenCalled();
    },
  );
  it("refuses account changes after target preparation", async () => {
    const s = setup();
    s.verify.mockResolvedValue({ ...operator, userId: 2 });
    await s.gate.run(mutation, async () => 7, s.write, s.committed);
    expect(s.write).not.toHaveBeenCalled();
  });
  it("does not send after unmount during target preparation", async () => {
    const s = setup(),
      pending = deferred<number>();
    const task = s.gate.run(
      mutation,
      () => pending.promise,
      s.write,
      s.committed,
    );
    s.gate.dispose();
    pending.resolve(7);
    expect(await task).toEqual({ status: "ignored" });
    expect(s.write).not.toHaveBeenCalled();
  });
  it.each([400, 401, 403, 404, 409, 422, 429])(
    "does not replay a definitive %s rejection",
    async (status) => {
      const s = setup(),
        write = vi.fn(async () => {
          throw new ApiError("refused", {
            status,
            code: status,
            traceId: null,
          });
        });
      expect(
        await s.gate.run(mutation, async () => 7, write, s.committed),
      ).toMatchObject({ status: "error", uncertain: false });
      expect(write).toHaveBeenCalledTimes(1);
      expect(s.ledger.entries(1)).toEqual([]);
      expect(s.committed).not.toHaveBeenCalled();
    },
  );
  it.each([0, 408, 500, 503])(
    "blocks retries after an uncertain %s",
    async (status) => {
      const s = setup();
      expect(
        await s.gate.run(
          mutation,
          async () => 7,
          async () => {
            throw new ApiError("unknown", {
              status,
              code: status,
              traceId: "trace",
            });
          },
          s.committed,
        ),
      ).toMatchObject({ status: "error", uncertain: true });
      expect(s.ledger.entries(1)).toMatchObject([
        { inFlight: false, mutation },
      ]);
      expect(s.gate.isLocked()).toBe(true);
      expect(
        await s.gate.run(mutation, async () => 7, s.write, s.committed),
      ).toEqual({ status: "ignored" });
      expect(s.write).not.toHaveBeenCalled();
    },
  );
  it("retains a malformed success as unknown", async () => {
    const s = setup();
    expect(
      await s.gate.run(
        mutation,
        async () => 7,
        async () => {
          throw new Error("invalid response");
        },
        s.committed,
      ),
    ).toMatchObject({ status: "error", uncertain: true });
  });
  it("retains in-flight state across a remount and forbids premature acknowledgement", async () => {
    const s = setup(),
      pending = deferred<string>();
    const task = s.gate.run(
      mutation,
      async () => 7,
      () => pending.promise,
      s.committed,
    );
    await vi.waitFor(() => expect(s.ledger.entries(1)).toHaveLength(1));
    s.gate.dispose();
    const next = setup(s.ledger);
    expect(next.gate.isLocked()).toBe(true);
    expect(s.ledger.acknowledge(1, s.ledger.version)).toBe(false);
    pending.reject(new Error("cancelled transport"));
    expect(await task).toEqual({ status: "ignored" });
    expect(s.committed).not.toHaveBeenCalled();
    expect(next.ledger.entries(1)[0]?.inFlight).toBe(false);
  });
  it("does not block another actor and rejects a stale review", () => {
    const s = setup(),
      settle = s.ledger.begin(1, mutation),
      old = s.ledger.version;
    expect(s.ledger.entries(2)).toEqual([]);
    settle(false);
    expect(s.ledger.acknowledge(1, old)).toBe(false);
    expect(s.ledger.acknowledge(1, s.ledger.version)).toBe(true);
    expect(s.gate.isLocked()).toBe(false);
  });
  it("isolates StrictMode cleanup from a new activation", async () => {
    const s = setup(),
      pending = deferred<number>();
    const task = s.gate.run(
      mutation,
      () => pending.promise,
      s.write,
      s.committed,
    );
    s.gate.dispose();
    s.gate.activate();
    pending.resolve(7);
    await task;
    expect(s.write).not.toHaveBeenCalled();
    expect(
      await s.gate.run(mutation, async () => 7, s.write, s.committed),
    ).toEqual({ status: "success" });
  });
  it("does not classify a callback failure as an unknown write", async () => {
    const s = setup();
    await s.gate.run(
      mutation,
      async () => 7,
      s.write,
      () => {
        throw new Error("render failure");
      },
    );
    expect(s.ledger.entries(1)).toEqual([]);
  });
  it("suppresses stale list success, failure and finally", async () => {
    const lane = new RequestLane(),
      old = deferred<string>(),
      publish = vi.fn(),
      fail = vi.fn(),
      settled = vi.fn();
    const task = lane.run(() => old.promise, publish, fail, settled);
    await lane.run(async () => "new", publish, fail, settled);
    old.reject(new Error("stale"));
    await task;
    expect(publish.mock.calls).toEqual([["new"]]);
    expect(fail).not.toHaveBeenCalled();
    expect(settled).toHaveBeenCalledTimes(1);
  });
});
