import { describe, it, expect, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import {
  GlobalResortLedger,
  GlobalResortWriteGate,
} from "@/features/admin-resorts/global-resort-workflow";
import {
  operator,
  deferred,
} from "@/features/admin-resorts/global-resort-fixtures.test-helper";
const mutation = { action: "publish", resortId: 42 } as const;
function setup(ledger = new GlobalResortLedger()) {
  const verify = vi.fn(async () => operator),
    write = vi.fn(async () => 42),
    committed = vi.fn(),
    busy = vi.fn();
  const gate = new GlobalResortWriteGate(operator, verify, ledger, busy);
  gate.activate();
  return { gate, ledger, verify, write, committed, busy };
}
describe("global resort operation recovery", () => {
  it("arbitrates two prepared gates against the same ledger before dispatch", async () => {
    const ledger = new GlobalResortLedger(),
      a = setup(ledger),
      b = setup(ledger);
    const firstIdentity = deferred<typeof operator>(),
      secondIdentity = deferred<typeof operator>(),
      reply = deferred<number>();
    a.verify.mockImplementation(() => firstIdentity.promise);
    b.verify.mockImplementation(() => secondIdentity.promise);
    a.write.mockImplementation(() => reply.promise);
    const first = a.gate.run(mutation, async () => "x", a.write, a.committed);
    const second = b.gate.run(mutation, async () => "x", b.write, b.committed);
    await vi.waitFor(() => expect(b.verify).toHaveBeenCalled());
    firstIdentity.resolve(operator);
    await vi.waitFor(() => expect(a.write).toHaveBeenCalledOnce());
    secondIdentity.resolve(operator);
    expect(await second).toEqual({ status: "ignored" });
    expect(b.write).not.toHaveBeenCalled();
    reply.resolve(42);
    await first;
    a.gate.dispose();
    b.gate.dispose();
  });
  it("rejects malformed local operator before preparation or verification", async () => {
    const prepare = vi.fn(async () => "x"),
      verify = vi.fn(async () => operator),
      write = vi.fn();
    const gate = new GlobalResortWriteGate(
      { ...operator, nickname: null } as never,
      verify,
      new GlobalResortLedger(),
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
  it("locks before asynchronous validation so repeated confirmation cannot duplicate a write", async () => {
    const s = setup(),
      validation = deferred<string>();
    const task = s.gate.run(
      mutation,
      () => validation.promise,
      s.write,
      s.committed,
    );
    expect(
      await s.gate.run(mutation, async () => "x", s.write, s.committed),
    ).toEqual({ status: "ignored" });
    validation.resolve("validated");
    await task;
    expect(s.write).toHaveBeenCalledTimes(1);
    expect(s.committed).toHaveBeenCalledTimes(1);
  });
  it("does not start HTTP after the workspace was disposed during validation", async () => {
    const s = setup(),
      validation = deferred<string>();
    const task = s.gate.run(
      mutation,
      () => validation.promise,
      s.write,
      s.committed,
    );
    s.gate.dispose();
    validation.resolve("x");
    await task;
    expect(s.write).not.toHaveBeenCalled();
    expect(s.verify).not.toHaveBeenCalled();
  });
  it("revalidates exact action permissions after target preparation", async () => {
    const s = setup();
    s.verify.mockResolvedValue({
      ...operator,
      permissionKeys: operator.permissionKeys.filter(
        (key) => key !== "content:resort:publish",
      ),
    });
    expect(
      await s.gate.run(mutation, async () => "x", s.write, s.committed),
    ).toMatchObject({ status: "error", uncertain: false });
    expect(s.write).not.toHaveBeenCalled();
    expect(s.ledger.entries(operator.userId)).toEqual([]);
  });
  it.each([400, 401, 403, 404, 409, 422])(
    "treats HTTP %s as a definitive rejection",
    async (status) => {
      const s = setup();
      s.write.mockRejectedValue(
        new ApiError("rejected", { status, code: status, traceId: null }),
      );
      expect(
        await s.gate.run(mutation, async () => "x", s.write, s.committed),
      ).toMatchObject({ status: "error", uncertain: false });
      expect(s.ledger.entries(operator.userId)).toEqual([]);
    },
  );
  it.each([408, 500, 503])(
    "retains an uncertain HTTP %s result across workspace remounts",
    async (status) => {
      const s = setup();
      s.write.mockRejectedValue(
        new ApiError("unknown", { status, code: status, traceId: null }),
      );
      expect(
        await s.gate.run(mutation, async () => "x", s.write, s.committed),
      ).toMatchObject({ status: "error", uncertain: true });
      const next = setup(s.ledger);
      expect(
        await next.gate.run(
          mutation,
          async () => "x",
          next.write,
          next.committed,
        ),
      ).toEqual({ status: "ignored" });
      expect(s.write).toHaveBeenCalledTimes(1);
      expect(s.ledger.entries(operator.userId)[0]?.inFlight).toBe(false);
    },
  );
  it("keeps in-flight writes blocked, and suppresses late UI effects", async () => {
    const s = setup(),
      reply = deferred<number>();
    s.write.mockImplementation(() => reply.promise);
    const task = s.gate.run(mutation, async () => "x", s.write, s.committed);
    await vi.waitFor(() => expect(s.write).toHaveBeenCalled());
    const version = s.ledger.version;
    expect(s.ledger.acknowledge(operator.userId, version)).toBe(false);
    s.gate.dispose();
    reply.resolve(42);
    await task;
    expect(s.committed).not.toHaveBeenCalled();
    expect(s.ledger.entries(operator.userId)).toEqual([]);
  });
  it("refuses an old review when another operation changed the ledger", () => {
    const ledger = new GlobalResortLedger();
    ledger.begin(1, mutation)(false);
    const reviewed = ledger.version;
    ledger.begin(2, mutation)(false);
    expect(ledger.acknowledge(1, reviewed)).toBe(false);
    expect(ledger.acknowledge(1, ledger.version)).toBe(true);
    expect(ledger.entries(2)).toHaveLength(1);
  });
});
