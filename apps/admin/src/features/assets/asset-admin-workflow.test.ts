import { describe, it, expect, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import {
  AssetDeletionLedger,
  AssetDeletionGate,
} from "@/features/assets/asset-admin-workflow";
import {
  operator,
  asset,
  deferred,
} from "@/features/assets/asset-admin-fixtures.test-helper";
const mutation = { assetId: asset.assetId };
function setup(ledger = new AssetDeletionLedger()) {
  const verify = vi.fn(async () => operator),
    busy = vi.fn(),
    write = vi.fn(async () => undefined),
    committed = vi.fn();
  const gate = new AssetDeletionGate(operator, verify, ledger, busy);
  gate.activate();
  return { ledger, gate, verify, busy, write, committed };
}
describe("asset deletion lifecycle", () => {
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
        async () => asset.assetId,
        s.write,
        s.committed,
      ),
    ).toEqual({ status: "ignored" });
    pending.resolve(asset.assetId);
    expect(await task).toEqual({ status: "success" });
    expect(s.write).toHaveBeenCalledTimes(1);
  });
  it.each(["management:portal:enter", "content:asset:delete"])(
    "checks current %s immediately before deletion",
    async (grant) => {
      const s = setup();
      s.verify.mockResolvedValue({
        ...operator,
        permissionKeys: operator.permissionKeys.filter((key) => key !== grant),
      });
      await s.gate.run(
        mutation,
        async () => asset.assetId,
        s.write,
        s.committed,
      );
      expect(s.write).not.toHaveBeenCalled();
    },
  );
  it("refuses actor changes and disposal during preparation", async () => {
    const s = setup();
    s.verify.mockResolvedValue({ ...operator, userId: 2 });
    await s.gate.run(mutation, async () => asset.assetId, s.write, s.committed);
    expect(s.write).not.toHaveBeenCalled();
    const pending = deferred<string>();
    const task = s.gate.run(
      mutation,
      () => pending.promise,
      s.write,
      s.committed,
    );
    s.gate.dispose();
    pending.resolve(asset.assetId);
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
          async () => asset.assetId,
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
  it.each([0, 408, 500])(
    "retains uncertain outcome %s and blocks retry",
    async (status) => {
      const s = setup();
      expect(
        await s.gate.run(
          mutation,
          async () => asset.assetId,
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
          async () => asset.assetId,
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
      async () => asset.assetId,
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
    pending.resolve(asset.assetId);
    await task;
    expect(s.write).not.toHaveBeenCalled();
    await s.gate.run(
      mutation,
      async () => asset.assetId,
      s.write,
      () => {
        throw new Error("render failure");
      },
    );
    expect(s.ledger.entries(1)).toEqual([]);
  });
  it("arbitrates two prepared deletions sharing one ledger before sending", async () => {
    const ledger = new AssetDeletionLedger(),
      first = setup(ledger),
      second = setup(ledger),
      pending = deferred<void>();
    const send = vi.fn(() => pending.promise);
    const tasks = [first, second].map((s) =>
      s.gate.run(mutation, async () => asset.assetId, send, s.committed),
    );
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    pending.resolve();
    const results = await Promise.all(tasks);
    expect(results.map((result) => result.status).sort()).toEqual([
      "ignored",
      "success",
    ]);
    expect(ledger.entries(1)).toEqual([]);
  });
  it("does not prepare deletion under invalid local identity", async () => {
    const prepare = vi.fn(async () => asset.assetId),
      write = vi.fn();
    const gate = new AssetDeletionGate(
      { ...operator, account: "" },
      async () => operator,
      new AssetDeletionLedger(),
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
});
