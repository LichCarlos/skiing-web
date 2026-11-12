import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import {
  FieldWriteGate,
  type User,
} from "@/features/custom-fields/field-model";
import {
  FieldRecoveryLedger,
  beginFieldWrite,
  fieldRecoveryState,
  fieldRecoverySnapshot,
  fieldRecoveryServerSnapshot,
  reviewFieldWrite,
  subscribeFieldRecovery,
} from "@/features/custom-fields/field-recovery";

const user: User = {
  userId: 991001,
  account: "operator",
  nickname: "Operator",
  avatarUrl: null,
  menuTree: [],
  merchant: null,
  roles: [{ roleKey: "custom", roleName: "Custom" }],
  permissionKeys: [
    "management:portal:enter",
    "system:field:list",
    "system:field:create",
    "system:field-group:create",
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
function setup(ledger = new FieldRecoveryLedger(), current = user) {
  const verify = vi.fn(async () => current),
    write = vi.fn(async () => undefined),
    committed = vi.fn();
  const gate = new FieldWriteGate(user, verify, vi.fn(), {
    has: () => ledger.state(user.userId, "ski_resort").pending,
    begin: (permission) => ledger.begin(user.userId, "ski_resort", permission),
  });
  gate.activate();
  return {
    ledger,
    gate,
    verify,
    write,
    committed,
    run: () => gate.run("system:field:create", async () => 1, write, committed),
  };
}
afterEach(() => vi.unstubAllGlobals());
describe("field writes across remounts and review", () => {
  it("marks the operation before transport and blocks a second mounted writer", async () => {
    const a = setup(),
      pending = deferred<undefined>();
    a.write.mockImplementationOnce(() => pending.promise);
    const task = a.run();
    await vi.waitFor(() => expect(a.write).toHaveBeenCalledOnce());
    expect(a.ledger.state(user.userId, "ski_resort")).toEqual({
      pending: true,
      inFlight: true,
      needsGroup: false,
    });
    const b = setup(a.ledger);
    expect((await b.run()).status).toBe("ignored");
    expect(b.verify).not.toHaveBeenCalled();
    expect(a.ledger.review(user.userId, "ski_resort")).toBe(false);
    pending.resolve(undefined);
    expect((await task).status).toBe("success");
    expect(a.ledger.state(user.userId, "ski_resort").pending).toBe(false);
  });
  it("retains unknown results after disposal and remount until explicit review", async () => {
    const a = setup(),
      pending = deferred<undefined>();
    a.write.mockImplementationOnce(() => pending.promise);
    const task = a.run();
    await vi.waitFor(() => expect(a.write).toHaveBeenCalledOnce());
    a.gate.dispose();
    pending.reject(new TypeError("network"));
    expect((await task).status).toBe("ignored");
    expect(a.committed).not.toHaveBeenCalled();
    expect(a.ledger.state(user.userId, "ski_resort")).toMatchObject({
      pending: true,
      inFlight: false,
    });
    const b = setup(a.ledger);
    expect((await b.run()).status).toBe("ignored");
    expect(a.ledger.review(user.userId, "ski_resort")).toBe(true);
    b.gate.acknowledgeReview();
    expect((await b.run()).status).toBe("success");
  });
  it.each([400, 401, 403, 404, 409, 422, 429])(
    "clears a definitive HTTP %i even after disposal",
    async (status) => {
      const a = setup(),
        pending = deferred<undefined>();
      a.write.mockImplementationOnce(() => pending.promise);
      const task = a.run();
      await vi.waitFor(() => expect(a.write).toHaveBeenCalledOnce());
      a.gate.dispose();
      pending.reject(
        new ApiError("denied", { status, code: status, traceId: "trace" }),
      );
      await task;
      expect(a.ledger.state(user.userId, "ski_resort").pending).toBe(false);
    },
  );
  it.each([408, 500, 0])(
    "retains uncertain HTTP %i after disposal",
    async (status) => {
      const a = setup(),
        pending = deferred<undefined>();
      a.write.mockImplementationOnce(() => pending.promise);
      const task = a.run();
      await vi.waitFor(() => expect(a.write).toHaveBeenCalledOnce());
      a.gate.dispose();
      pending.reject(
        new ApiError("unknown", { status, code: status, traceId: "trace" }),
      );
      await task;
      expect(a.ledger.state(user.userId, "ski_resort")).toMatchObject({
        pending: true,
        inFlight: false,
      });
    },
  );
  it("clears a confirmed late response without notifying the disposed UI", async () => {
    const a = setup(),
      pending = deferred<undefined>();
    a.write.mockImplementationOnce(() => pending.promise);
    const task = a.run();
    await vi.waitFor(() => expect(a.write).toHaveBeenCalledOnce());
    a.gate.dispose();
    pending.resolve(undefined);
    await task;
    expect(a.ledger.state(user.userId, "ski_resort").pending).toBe(false);
    expect(a.committed).not.toHaveBeenCalled();
  });
  it("rejects role changes with the same account and action grant before transport", async () => {
    const a = setup(undefined, {
      ...user,
      roles: [{ roleKey: "other", roleName: "Other" }],
    });
    expect((await a.run()).status).toBe("error");
    expect(a.write).not.toHaveBeenCalled();
    expect(a.ledger.state(user.userId, "ski_resort").pending).toBe(false);
  });
  it("rejects grant changes even if the requested action remains allowed", async () => {
    const a = setup(undefined, {
      ...user,
      permissionKeys: [...user.permissionKeys, "other:action"],
    });
    expect((await a.run()).status).toBe("error");
    expect(a.write).not.toHaveBeenCalled();
  });
  it("checks the shared lock again after asynchronous identity verification", async () => {
    const ledger = new FieldRecoveryLedger(),
      pending = deferred<User>();
    const a = setup(ledger);
    a.verify.mockImplementationOnce(() => pending.promise);
    const task = a.run();
    await vi.waitFor(() => expect(a.verify).toHaveBeenCalledOnce());
    const receipt = ledger.begin(
      user.userId,
      "ski_resort",
      "system:field-group:create",
    );
    pending.resolve(user);
    expect((await task).status).toBe("ignored");
    expect(a.write).not.toHaveBeenCalled();
    receipt!.confirm();
  });
});
describe("field recovery memory boundary", () => {
  it("rejects an obsolete review if a newer unknown operation appeared in another mount", () => {
    const ledger = new FieldRecoveryLedger();
    const first = ledger.begin(1, "article", "system:field:create")!;
    first.uncertain();
    const revision = ledger.snapshot();
    expect(ledger.review(1, "article", revision)).toBe(true);
    ledger.begin(1, "article", "system:field-group:create")!.uncertain();
    expect(ledger.review(1, "article", revision)).toBe(false);
    expect(ledger.state(1, "article")).toEqual({
      pending: true,
      inFlight: false,
      needsGroup: true,
    });
  });
  it("allows a retained mount to continue after another mount explicitly reviewed the same operation", async () => {
    const a = setup();
    a.write.mockRejectedValueOnce(new TypeError("network"));
    expect(await a.run()).toMatchObject({ status: "error", uncertain: true });
    expect(
      a.ledger.review(user.userId, "ski_resort", a.ledger.snapshot()),
    ).toBe(true);
    expect((await a.run()).status).toBe("success");
  });
  it("separates accounts and entities and preserves whether group review is required", () => {
    const l = new FieldRecoveryLedger();
    const a = l.begin(1, "ski_resort", "system:field-group:create")!,
      b = l.begin(2, "ski_resort", "system:field:create")!,
      c = l.begin(1, "article", "system:field:create")!;
    a.uncertain();
    expect(l.state(1, "ski_resort")).toEqual({
      pending: true,
      inFlight: false,
      needsGroup: true,
    });
    expect(l.review(1, "ski_resort")).toBe(true);
    expect(l.state(2, "ski_resort").pending).toBe(true);
    expect(l.state(1, "article").pending).toBe(true);
    b.confirm();
    c.confirm();
  });
  it("does not let an old response clear a newer operation after review", () => {
    const l = new FieldRecoveryLedger(),
      old = l.begin(1, "article", "system:field:create")!;
    old.uncertain();
    l.review(1, "article");
    const current = l.begin(1, "article", "system:field:create")!;
    old.confirm();
    old.uncertain();
    expect(l.state(1, "article")).toMatchObject({
      pending: true,
      inFlight: true,
    });
    current.confirm();
  });
  it("notifies subscribers only for actual state changes and unsubscribes", () => {
    const l = new FieldRecoveryLedger(),
      listener = vi.fn(),
      unsubscribe = l.subscribe(listener);
    const a = l.begin(1, "article", "system:field:create")!;
    expect(l.begin(1, "article", "system:field:create")).toBeNull();
    expect(l.review(1, "article")).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    a.uncertain();
    a.uncertain();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    a.confirm();
    expect(listener).toHaveBeenCalledTimes(2);
  });
  it("stores nothing during SSR and exposes no pending cross-request state", () => {
    vi.stubGlobal("window", undefined);
    expect(
      beginFieldWrite(991002, "article", "system:field:create"),
    ).toBeNull();
    expect(fieldRecoveryState(991002, "article").pending).toBe(false);
    expect(fieldRecoverySnapshot()).toBe(0);
    expect(fieldRecoveryServerSnapshot()).toBe(0);
    expect(reviewFieldWrite(991002, "article", fieldRecoverySnapshot())).toBe(
      false,
    );
  });
  it("remembers browser writes across readers and emits changes for a fresh mount", () => {
    vi.stubGlobal("window", {});
    const listener = vi.fn(),
      unsubscribe = subscribeFieldRecovery(listener),
      before = fieldRecoverySnapshot();
    const receipt = beginFieldWrite(
      991003,
      "article",
      "system:field-group:create",
    )!;
    expect(fieldRecoverySnapshot()).toBeGreaterThan(before);
    expect(fieldRecoveryState(991003, "article").needsGroup).toBe(true);
    expect(reviewFieldWrite(991003, "article", fieldRecoverySnapshot())).toBe(
      false,
    );
    receipt.uncertain();
    expect(reviewFieldWrite(991003, "article", fieldRecoverySnapshot())).toBe(
      true,
    );
    expect(fieldRecoveryState(991003, "article").pending).toBe(false);
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
  });
});
