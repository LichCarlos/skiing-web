import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import {
  ArticleRecoveryLedger,
  ArticleWriteGate,
} from "@/features/articles/article-workflow";
import {
  operator,
  deferred,
} from "@/features/articles/article-fixtures.test-helper";
import { type ArticleOperator } from "@/features/articles/article-model";
import { RequestLane } from "@/platform/api/request-lane";

const mutation = { action: "publish", articleId: 7 } as const;
function setup(verify = vi.fn(async () => operator)) {
  const ledger = new ArticleRecoveryLedger(),
    busy = vi.fn(),
    committed = vi.fn(),
    write = vi.fn(async () => "saved");
  const gate = new ArticleWriteGate(operator, verify, ledger, busy);
  gate.activate();
  return { ledger, gate, busy, verify, committed, write };
}
describe("article write and recovery lifecycle", () => {
  it("locks synchronously before validation and performs only one write", async () => {
    const s = setup(),
      pending = deferred<number>(),
      prepare = vi.fn(() => pending.promise);
    const first = s.gate.run(mutation, prepare, s.write, s.committed);
    expect(await s.gate.run(mutation, prepare, s.write, s.committed)).toEqual({
      status: "ignored",
    });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(s.verify).not.toHaveBeenCalled();
    pending.resolve(7);
    expect(await first).toEqual({ status: "success" });
    expect(s.write).toHaveBeenCalledTimes(1);
    expect(s.committed).toHaveBeenCalledWith("saved");
    expect(s.ledger.entries(1)).toEqual([]);
    expect(s.busy.mock.calls).toEqual([[true], [false]]);
  });
  it("releases a validation failure without marking a write uncertain", async () => {
    const s = setup();
    expect(
      await s.gate.run(
        mutation,
        async () => {
          throw new Error("validation");
        },
        s.write,
        s.committed,
      ),
    ).toMatchObject({ status: "error", uncertain: false });
    expect(s.write).not.toHaveBeenCalled();
    expect(s.gate.isLocked()).toBe(false);
  });
  it.each([
    { ...operator, userId: 2 },
    { ...operator, roles: [] },
    { ...operator, permissionKeys: ["management:portal:enter"] },
  ])("rechecks identity after asynchronous preparation", async (current) => {
    const s = setup(vi.fn(async () => current));
    expect(
      await s.gate.run(mutation, async () => 7, s.write, s.committed),
    ).toMatchObject({ status: "error", uncertain: false });
    expect(s.write).not.toHaveBeenCalled();
    expect(s.ledger.entries(1)).toEqual([]);
  });
  it("does not send a write after disposal during identity verification", async () => {
    const pending = deferred<ArticleOperator>(),
      s = setup(vi.fn(() => pending.promise));
    const result = s.gate.run(mutation, async () => 7, s.write, s.committed);
    await Promise.resolve();
    s.gate.dispose();
    pending.resolve(operator);
    expect(await result).toEqual({ status: "ignored" });
    expect(s.write).not.toHaveBeenCalled();
  });
  it.each([400, 401, 403, 404, 409, 422, 429])(
    "does not block a definitive %s rejection",
    async (status) => {
      const s = setup();
      const result = await s.gate.run(
        mutation,
        async () => 7,
        async () => {
          throw new ApiError("denied", {
            status,
            code: status,
            traceId: "trace",
          });
        },
        s.committed,
      );
      expect(result).toMatchObject({ status: "error", uncertain: false });
      expect(s.ledger.entries(1)).toEqual([]);
      expect(s.committed).not.toHaveBeenCalled();
    },
  );
  it.each([0, 200, 408, 500, 502])(
    "blocks retries for uncertain %s outcomes",
    async (status) => {
      const s = setup();
      const result = await s.gate.run(
        mutation,
        async () => 7,
        async () => {
          throw new ApiError("ambiguous", {
            status,
            code: null,
            traceId: "trace",
          });
        },
        s.committed,
      );
      expect(result).toMatchObject({ status: "error", uncertain: true });
      expect(s.ledger.entries(1)).toMatchObject([
        { mutation, inFlight: false },
      ]);
      expect(
        await s.gate.run(mutation, async () => 7, s.write, s.committed),
      ).toEqual({ status: "ignored" });
      expect(s.ledger.acknowledge(1, s.ledger.version)).toBe(true);
      expect(s.gate.isLocked()).toBe(false);
    },
  );
  it("retains a live write across remount and forbids acknowledgement before it settles", async () => {
    const s = setup(),
      pending = deferred<string>(),
      entered = deferred<void>();
    const result = s.gate.run(
      mutation,
      async () => 7,
      () => {
        entered.resolve();
        return pending.promise;
      },
      s.committed,
    );
    await entered.promise;
    s.gate.dispose();
    const next = new ArticleWriteGate(
      operator,
      async () => operator,
      s.ledger,
      vi.fn(),
    );
    next.activate();
    expect(next.isLocked()).toBe(true);
    expect(s.ledger.acknowledge(1, s.ledger.version)).toBe(false);
    pending.reject(new DOMException("cancelled", "AbortError"));
    expect(await result).toEqual({ status: "ignored" });
    expect(s.committed).not.toHaveBeenCalled();
    expect(s.ledger.entries(1)[0]?.inFlight).toBe(false);
    expect(s.ledger.acknowledge(1, s.ledger.version)).toBe(true);
  });
  it("clears a confirmed late success without callbacks into a new instance", async () => {
    const s = setup(),
      pending = deferred<string>(),
      entered = deferred<void>();
    const result = s.gate.run(
      mutation,
      async () => 7,
      () => {
        entered.resolve();
        return pending.promise;
      },
      s.committed,
    );
    await entered.promise;
    s.gate.dispose();
    s.gate.activate();
    pending.resolve("done");
    expect(await result).toEqual({ status: "ignored" });
    expect(s.committed).not.toHaveBeenCalled();
    expect(s.ledger.entries(1)).toEqual([]);
  });
  it("does not turn a rendering/navigation error after confirmed success into an unknown write", async () => {
    const s = setup();
    expect(
      await s.gate.run(
        mutation,
        async () => 7,
        s.write,
        () => {
          throw new Error("navigation");
        },
      ),
    ).toMatchObject({ status: "error", uncertain: false });
    expect(s.ledger.entries(1)).toEqual([]);
  });
  it("keeps actors isolated, snapshots records and invalidates stale review results", () => {
    const ledger = new ArticleRecoveryLedger(),
      listener = vi.fn(),
      unsubscribe = ledger.subscribe(listener);
    const target = { ...mutation };
    const finish = ledger.begin(1, target);
    target.articleId = 8 as 7;
    finish(false);
    const version = ledger.version;
    expect(ledger.entries(2)).toEqual([]);
    expect(ledger.entries(1)[0]?.mutation).toEqual(mutation);
    const next = ledger.begin(1, mutation);
    next(false);
    expect(ledger.acknowledge(1, version)).toBe(false);
    expect(ledger.entries(1)).toHaveLength(2);
    expect(ledger.acknowledge(2, ledger.version)).toBe(true);
    expect(ledger.entries(1)).toHaveLength(2);
    unsubscribe();
    const count = listener.mock.calls.length;
    ledger.acknowledge(1, ledger.version);
    expect(listener).toHaveBeenCalledTimes(count);
  });
  it("suppresses late list success/error/finally after newer filters", async () => {
    const lane = new RequestLane(),
      old = deferred<string>(),
      publish = vi.fn(),
      error = vi.fn(),
      end = vi.fn();
    const first = lane.run(() => old.promise, publish, error, end);
    await lane.run(async () => "new page", publish, error, end);
    old.resolve("old page");
    expect(await first).toBe(false);
    expect(publish.mock.calls).toEqual([["new page"]]);
    expect(end).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });
  it("suppresses errors and completion after leaving the article workspace", async () => {
    const lane = new RequestLane(),
      old = deferred<string>(),
      publish = vi.fn(),
      error = vi.fn(),
      end = vi.fn();
    const first = lane.run(() => old.promise, publish, error, end);
    lane.cancel();
    old.reject(new Error("late"));
    expect(await first).toBe(false);
    expect(publish).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();
  });
});
