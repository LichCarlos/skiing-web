import { describe, it, expect, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import {
  ConfigConflictError,
  ConfigInputError,
} from "@/features/system-config/config-model";
import {
  ConfigRecoveryLedger,
  ConfigWriteGate,
} from "@/features/system-config/config-workflow";
import {
  operator,
  item,
  deferred,
} from "@/features/system-config/config-fixtures.test-helper";
const mutation = { configKey: item.configKey };
function setup(ledger = new ConfigRecoveryLedger()) {
  const verify = vi.fn(async () => operator),
    busy = vi.fn(),
    write = vi.fn(async () => undefined),
    committed = vi.fn();
  const gate = new ConfigWriteGate(operator, verify, ledger, busy);
  gate.activate();
  return { ledger, gate, verify, busy, write, committed };
}
describe("configuration save lifecycle", () => {
  it.each(["preflight", "server"])(
    "reports a %s conflict without rebasing or keeping an unknown write",
    async (kind) => {
      const s = setup();
      const result = await s.gate.run(
        mutation,
        async () => {
          if (kind === "preflight") throw new ConfigConflictError("配置已变化");
          return item.configKey;
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
  it("keeps a mismatched save receipt unknown rather than accepting a successful HTTP status", async () => {
    const s = setup();
    const result = await s.gate.run(
      mutation,
      async () => item.configKey,
      async () => {
        throw new ConfigInputError("保存返回内容不匹配");
      },
      s.committed,
    );
    expect(result).toMatchObject({ status: "error", uncertain: true });
    expect(s.ledger.entries(1)).toHaveLength(1);
    expect(s.committed).not.toHaveBeenCalled();
  });
  it("stores only the configuration key in its recovery records", () => {
    const s = setup(),
      settle = s.ledger.begin(1, mutation);
    settle(false);
    expect(s.ledger.entries(1)[0]?.mutation).toEqual({
      configKey: item.configKey,
    });
    expect(JSON.stringify(s.ledger.entries(1))).not.toContain(item.value);
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
        async () => item.configKey,
        s.write,
        s.committed,
      ),
    ).toEqual({ status: "ignored" });
    pending.resolve(item.configKey);
    expect(await task).toEqual({ status: "success" });
    expect(s.write).toHaveBeenCalledTimes(1);
  });
  it.each(["management:portal:enter", "system:config:update"])(
    "checks current %s immediately before save",
    async (grant) => {
      const s = setup();
      s.verify.mockResolvedValue({
        ...operator,
        permissionKeys: operator.permissionKeys.filter((key) => key !== grant),
      });
      await s.gate.run(
        mutation,
        async () => item.configKey,
        s.write,
        s.committed,
      );
      expect(s.write).not.toHaveBeenCalled();
    },
  );
  it("refuses actor changes and disposal during preparation", async () => {
    const s = setup();
    s.verify.mockResolvedValue({ ...operator, userId: 2 });
    await s.gate.run(
      mutation,
      async () => item.configKey,
      s.write,
      s.committed,
    );
    expect(s.write).not.toHaveBeenCalled();
    const pending = deferred<string>();
    const task = s.gate.run(
      mutation,
      () => pending.promise,
      s.write,
      s.committed,
    );
    s.gate.dispose();
    pending.resolve(item.configKey);
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
          async () => item.configKey,
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
          async () => item.configKey,
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
          async () => item.configKey,
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
      async () => item.configKey,
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
    pending.resolve(item.configKey);
    await task;
    expect(s.write).not.toHaveBeenCalled();
    await s.gate.run(
      mutation,
      async () => item.configKey,
      s.write,
      () => {
        throw new Error("render failure");
      },
    );
    expect(s.ledger.entries(1)).toEqual([]);
  });
});
