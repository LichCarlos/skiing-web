import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import {
  KnowledgeRecoveryLedger,
  KnowledgeWriteGate,
} from "@/features/project-knowledge/knowledge-workflow";
import {
  operator,
  deferred,
} from "@/features/project-knowledge/knowledge-fixtures.test-helper";
import { RequestLane } from "@/platform/api/request-lane";
const mutation = { action: "publish", projectKnowledgeId: 7 } as const;
function setup() {
  const ledger = new KnowledgeRecoveryLedger(),
    busy = vi.fn(),
    verify = vi.fn(async () => operator),
    committed = vi.fn(),
    write = vi.fn(async () => "saved");
  const gate = new KnowledgeWriteGate(operator, verify, ledger, busy);
  gate.activate();
  return { ledger, gate, busy, verify, committed, write };
}
describe("project knowledge write lifecycle", () => {
  it("arbitrates two prepared commands sharing the same recovery ledger", async () => {
    const ledger = new KnowledgeRecoveryLedger(),
      pending = deferred<void>(),
      write = vi.fn(() => pending.promise);
    const gates = [0, 1].map(
      () =>
        new KnowledgeWriteGate(operator, async () => operator, ledger, vi.fn()),
    );
    gates.forEach((gate) => gate.activate());
    const tasks = gates.map((gate) =>
      gate.run(mutation, async () => 7, write, vi.fn()),
    );
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    pending.resolve();
    expect(
      (await Promise.all(tasks)).map((result) => result.status).sort(),
    ).toEqual(["ignored", "success"]);
    expect(ledger.entries(1)).toEqual([]);
  });
  it("rejects invalid local identity before preparing a command", async () => {
    const prepare = vi.fn(async () => 7),
      write = vi.fn(),
      gate = new KnowledgeWriteGate(
        { ...operator, account: "" },
        async () => operator,
        new KnowledgeRecoveryLedger(),
        vi.fn(),
      );
    gate.activate();
    expect(await gate.run(mutation, prepare, write, vi.fn())).toMatchObject({
      status: "error",
      uncertain: false,
    });
    expect(prepare).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
  it("locks before validation to prevent duplicate writes", async () => {
    const s = setup(),
      pending = deferred<number>(),
      prepare = vi.fn(() => pending.promise);
    const first = s.gate.run(mutation, prepare, s.write, s.committed);
    expect(await s.gate.run(mutation, prepare, s.write, s.committed)).toEqual({
      status: "ignored",
    });
    pending.resolve(7);
    expect(await first).toEqual({ status: "success" });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(s.write).toHaveBeenCalledTimes(1);
    expect(s.ledger.entries(1)).toEqual([]);
  });
  it.each(["publish", "withdraw", "delete", "update", "create"] as const)(
    "checks the exact %s grant immediately before writing",
    async (action) => {
      const s = setup();
      s.verify.mockResolvedValue({
        ...operator,
        permissionKeys: operator.permissionKeys.filter(
          (key) => key !== `content:project-knowledge:${action}`,
        ),
      });
      const target =
        action === "create"
          ? { action, title: "FAQ" }
          : { action, projectKnowledgeId: 7 };
      expect(
        await s.gate.run(target, async () => 7, s.write, s.committed),
      ).toMatchObject({ status: "error", uncertain: false });
      expect(s.write).not.toHaveBeenCalled();
    },
  );
  it("does not write when the signed-in actor changes after preparation", async () => {
    const s = setup();
    s.verify.mockResolvedValue({ ...operator, userId: 2 });
    await s.gate.run(mutation, async () => 7, s.write, s.committed);
    expect(s.write).not.toHaveBeenCalled();
  });
  it("keeps a version conflict definitive and allows manual retry without automatic replay", async () => {
    const s = setup();
    const result = await s.gate.run(
      mutation,
      async () => 7,
      async () => {
        throw new ApiError("concurrent", {
          status: 409,
          code: 409,
          traceId: "trace",
        });
      },
      s.committed,
    );
    expect(result).toMatchObject({ status: "error", uncertain: false });
    expect(s.ledger.entries(1)).toEqual([]);
    expect(s.committed).not.toHaveBeenCalled();
  });
  it.each([0, 408, 500])(
    "blocks retries after an unknown %s outcome",
    async (status) => {
      const s = setup();
      expect(
        await s.gate.run(
          mutation,
          async () => 7,
          async () => {
            throw new ApiError("unknown", {
              status,
              code: null,
              traceId: null,
            });
          },
          s.committed,
        ),
      ).toMatchObject({ status: "error", uncertain: true });
      expect(s.gate.isLocked()).toBe(true);
      expect(
        await s.gate.run(mutation, async () => 7, s.write, s.committed),
      ).toEqual({ status: "ignored" });
      expect(s.ledger.acknowledge(1, s.ledger.version)).toBe(true);
      expect(s.gate.isLocked()).toBe(false);
    },
  );
  it("retains the live request on remount and rejects premature acknowledgement", async () => {
    const s = setup(),
      pending = deferred<string>(),
      started = deferred<void>();
    const run = s.gate.run(
      mutation,
      async () => 7,
      () => {
        started.resolve();
        return pending.promise;
      },
      s.committed,
    );
    await started.promise;
    s.gate.dispose();
    const next = new KnowledgeWriteGate(
      operator,
      async () => operator,
      s.ledger,
      vi.fn(),
    );
    next.activate();
    expect(next.isLocked()).toBe(true);
    expect(s.ledger.acknowledge(1, s.ledger.version)).toBe(false);
    pending.reject(new DOMException("cancel", "AbortError"));
    expect(await run).toEqual({ status: "ignored" });
    expect(s.ledger.entries(1)[0]?.inFlight).toBe(false);
    expect(s.committed).not.toHaveBeenCalled();
  });
  it("ignores late success callbacks after a strict-mode lifecycle restart", async () => {
    const s = setup(),
      pending = deferred<string>(),
      started = deferred<void>();
    const run = s.gate.run(
      mutation,
      async () => 7,
      () => {
        started.resolve();
        return pending.promise;
      },
      s.committed,
    );
    await started.promise;
    s.gate.dispose();
    s.gate.activate();
    pending.resolve("saved");
    expect(await run).toEqual({ status: "ignored" });
    expect(s.committed).not.toHaveBeenCalled();
    expect(s.ledger.entries(1)).toEqual([]);
  });
  it("isolates actor ledgers and invalidates an older review when records change", () => {
    const s = setup();
    s.ledger.begin(1, mutation)(false);
    const version = s.ledger.version;
    expect(s.ledger.entries(2)).toEqual([]);
    s.ledger.begin(1, mutation)(false);
    expect(s.ledger.acknowledge(1, version)).toBe(false);
    expect(s.ledger.entries(1)).toHaveLength(2);
  });
  it("does not mark post-confirmation navigation errors as unknown writes", async () => {
    const s = setup();
    expect(
      await s.gate.run(
        mutation,
        async () => 7,
        s.write,
        () => {
          throw new Error("view");
        },
      ),
    ).toMatchObject({ status: "error", uncertain: false });
    expect(s.ledger.entries(1)).toEqual([]);
  });
  it("suppresses old list completions when filters change or the workspace leaves", async () => {
    const lane = new RequestLane(),
      pending = deferred<string>(),
      publish = vi.fn(),
      fail = vi.fn(),
      settled = vi.fn();
    const old = lane.run(() => pending.promise, publish, fail, settled);
    await lane.run(async () => "latest", publish, fail, settled);
    pending.resolve("old");
    expect(await old).toBe(false);
    expect(publish.mock.calls).toEqual([["latest"]]);
    expect(settled).toHaveBeenCalledTimes(1);
  });
});
