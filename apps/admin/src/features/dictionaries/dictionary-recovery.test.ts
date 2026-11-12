import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import type { components } from "@common/api-contracts/openapi";
import { DictionaryWriteGate } from "@/features/dictionaries/dictionary-model";
import {
  DictionaryRecoveryLedger,
  beginDictionaryWrite,
  dictionaryRecoverySnapshot,
  dictionaryRecoveryState,
  reviewDictionaryWrite,
} from "@/features/dictionaries/dictionary-recovery";
const user: components["schemas"]["CurrentUserVO"] = {
  userId: 7,
  account: "operator",
  nickname: "Operator",
  avatarUrl: null,
  merchant: null,
  menuTree: [],
  roles: [{ roleKey: "custom", roleName: "Custom" }],
  permissionKeys: [
    "management:portal:enter",
    "system:dict:list",
    "system:dict:create",
  ],
};
function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup(store: DictionaryRecoveryLedger, verify = async () => user) {
  const write = vi.fn(async (_body: string, _signal: AbortSignal) => {}),
    done = vi.fn();
  const gate = new DictionaryWriteGate(user.userId, verify, vi.fn(), {
    user,
    has: () => store.state(user.userId) !== null,
    begin: (key: string) => store.begin(user.userId, key),
  });
  gate.activate();
  return {
    gate,
    write,
    done,
    run: () =>
      gate.run(
        "system:dict:create",
        async () => "body",
        write,
        done,
        "resort.tags",
      ),
  };
}
afterEach(() => vi.unstubAllGlobals());
describe("dictionary recovery survives mounted workspaces", () => {
  it("blocks another mount while a write is in flight and preserves the exact type key", async () => {
    const store = new DictionaryRecoveryLedger(),
      first = setup(store),
      pending = deferred();
    first.write.mockImplementation(() => pending.promise);
    const running = first.run();
    await vi.waitFor(() => expect(first.write).toHaveBeenCalledOnce());
    expect(store.state(7)).toEqual({ dictType: "resort.tags", inFlight: true });
    const second = setup(store);
    expect(await second.run()).toEqual({ status: "ignored" });
    expect(second.write).not.toHaveBeenCalled();
    first.gate.dispose();
    pending.resolve();
    await running;
    expect(store.state(7)).toBeNull();
    expect(first.done).not.toHaveBeenCalled();
  });
  it.each([408, 500, 0])(
    "retains unknown %i even after disposal until explicit target review",
    async (status) => {
      const store = new DictionaryRecoveryLedger(),
        first = setup(store),
        pending = deferred();
      first.write.mockImplementation(() => pending.promise);
      const running = first.run();
      await vi.waitFor(() => expect(first.write).toHaveBeenCalledOnce());
      first.gate.dispose();
      pending.reject(
        new ApiError("private", { status, code: status, traceId: "test" }),
      );
      await running;
      expect(store.state(7)).toEqual({
        dictType: "resort.tags",
        inFlight: false,
      });
      const second = setup(store);
      second.gate.acknowledgeReview();
      expect(await second.run()).toEqual({ status: "ignored" });
      expect(store.review(7, "another.type", store.snapshot())).toBe(false);
      expect(store.review(7, "resort.tags", store.snapshot())).toBe(true);
      expect(await second.run()).toEqual({ status: "success" });
    },
  );
  it.each([400, 401, 403, 404, 409, 422, 429])(
    "clears a definitive %i rejection after disposal",
    async (status) => {
      const store = new DictionaryRecoveryLedger(),
        first = setup(store),
        pending = deferred();
      first.write.mockImplementation(() => pending.promise);
      const running = first.run();
      await vi.waitFor(() => expect(first.write).toHaveBeenCalledOnce());
      first.gate.dispose();
      pending.reject(
        new ApiError("private", { status, code: status, traceId: "test" }),
      );
      await running;
      expect(store.state(7)).toBeNull();
    },
  );
  it("arbitrates concurrent mounts after asynchronous identity verification", async () => {
    const store = new DictionaryRecoveryLedger(),
      pending = deferred();
    const verify = async () => {
      await pending.promise;
      return user;
    };
    const first = setup(store, verify),
      second = setup(store, verify),
      write = deferred();
    first.write.mockImplementation(() => write.promise);
    const one = first.run(),
      two = second.run();
    pending.resolve();
    await vi.waitFor(() => expect(first.write).toHaveBeenCalledOnce());
    expect(await two).toEqual({ status: "ignored" });
    write.resolve();
    await one;
  });
  it.each(["role", "grant"])(
    "rejects a changed %s snapshot before sending a write",
    async (kind) => {
      const current =
        kind === "role"
          ? {
              ...user,
              roles: [{ roleKey: "different", roleName: "Different" }],
            }
          : {
              ...user,
              permissionKeys: [...user.permissionKeys, "other:grant"],
            };
      const value = setup(new DictionaryRecoveryLedger(), async () => current);
      expect(await value.run()).toMatchObject({
        status: "error",
        uncertain: false,
      });
      expect(value.write).not.toHaveBeenCalled();
    },
  );
  it("fences late receipts and stale reviews, isolates users and notifies subscribers", () => {
    const store = new DictionaryRecoveryLedger(),
      listener = vi.fn(),
      off = store.subscribe(listener);
    const first = store.begin(7, "resort.tags")!;
    expect(store.review(7, "resort.tags", store.snapshot())).toBe(false);
    first.uncertain();
    const version = store.snapshot();
    expect(store.begin(8, "resort.tags")).not.toBeNull();
    expect(store.review(7, "resort.tags", version)).toBe(false);
    expect(store.review(7, "resort.tags", store.snapshot())).toBe(true);
    const next = store.begin(7, "knowledge.categories")!;
    first.confirm();
    first.uncertain();
    expect(store.state(7)?.dictType).toBe("knowledge.categories");
    expect(listener).toHaveBeenCalled();
    off();
    const count = listener.mock.calls.length;
    next.confirm();
    expect(listener).toHaveBeenCalledTimes(count);
  });
  it("keeps no SSR ledger and retains browser state across new readers", () => {
    expect(beginDictionaryWrite(7, "resort.tags")).toBeNull();
    expect(dictionaryRecoverySnapshot()).toBe(0);
    vi.stubGlobal("window", {});
    const receipt = beginDictionaryWrite(7, "resort.tags")!;
    receipt.uncertain();
    expect(dictionaryRecoveryState(7)?.dictType).toBe("resort.tags");
    expect(dictionaryRecoveryState(8)).toBeNull();
    expect(
      reviewDictionaryWrite(7, "resort.tags", dictionaryRecoverySnapshot()),
    ).toBe(true);
  });
});
