import { describe, expect, it, vi } from "vitest";
import {
  AssetPickerRun,
  pickerIdentity,
} from "@/features/assets/asset-picker-run";
import {
  operator,
  deferred,
} from "@/features/assets/asset-admin-fixtures.test-helper";
import type { AssetRequest } from "@/features/assets/asset-library-model";

const actor = () =>
  structuredClone({
    ...operator,
    permissionKeys: [...operator.permissionKeys, "asset:upload"],
  });
function setup() {
  const user = actor();
  const request = vi.fn().mockResolvedValue(user);
  const run = new AssetPickerRun(user, request as AssetRequest);
  const callbacks = { done: vi.fn(), error: vi.fn(), settled: vi.fn() };
  run.activate();
  return { user, request, run, callbacks };
}
describe("mounted media picker authorization and late-result isolation", () => {
  it("checks the current cookie identity before and after each operation", async () => {
    const { run, request, callbacks } = setup();
    const work = vi.fn(async () => {
      expect(request).toHaveBeenCalledTimes(1);
      return "image";
    });
    await run.execute("asset:upload", work, callbacks);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenCalledWith("/auth/me", {
      cache: "no-store",
      signal: expect.any(AbortSignal),
    });
    expect(callbacks.done).toHaveBeenCalledWith("image");
    expect(callbacks.error).not.toHaveBeenCalled();
    expect(callbacks.settled).toHaveBeenCalledTimes(1);
  });
  it.each(["account", "grant", "portal", "role", "merchant", "malformed"])(
    "does not start work after %s changes",
    async (change) => {
      const { run, request, user, callbacks } = setup();
      const actual = structuredClone(user);
      if (change === "account") actual.userId++;
      if (change === "grant")
        actual.permissionKeys = actual.permissionKeys.filter(
          (key) => key !== "asset:upload",
        );
      if (change === "portal")
        actual.permissionKeys = actual.permissionKeys.filter(
          (key) => key !== "management:portal:enter",
        );
      if (change === "role") actual.roles = [];
      if (change === "merchant")
        actual.merchant = { merchantId: 99, businessName: "changed" };
      request.mockResolvedValue(
        change === "malformed" ? { userId: user.userId } : actual,
      );
      const work = vi.fn();
      await run.execute("asset:upload", work, callbacks);
      expect(work).not.toHaveBeenCalled();
      expect(callbacks.done).not.toHaveBeenCalled();
      expect(callbacks.error).toHaveBeenCalledTimes(1);
      expect(callbacks.settled).toHaveBeenCalledTimes(1);
    },
  );
  it("refuses a late response when current identity changes during upload", async () => {
    const { run, request, user, callbacks } = setup();
    const uploaded = deferred<string>();
    const work = vi.fn(() => uploaded.promise);
    const pending = run.execute("asset:upload", work, callbacks);
    await vi.waitFor(() => expect(work).toHaveBeenCalledTimes(1));
    request.mockResolvedValue({ ...user, userId: 12 });
    uploaded.resolve("old image");
    await pending;
    expect(callbacks.done).not.toHaveBeenCalled();
    expect(callbacks.error).toHaveBeenCalledTimes(1);
  });
  it("cancels waiting work and suppresses late success/error/finally after disposal", async () => {
    const { run, request, callbacks } = setup();
    const result = deferred<string>();
    let signal!: AbortSignal;
    const work = vi.fn((value: AbortSignal) => {
      signal = value;
      return result.promise;
    });
    const pending = run.execute("content:asset:list", work, callbacks);
    await vi.waitFor(() => expect(work).toHaveBeenCalled());
    run.dispose();
    expect(signal.aborted).toBe(true);
    result.resolve("old");
    await pending;
    expect(request).toHaveBeenCalledTimes(1);
    for (const callback of Object.values(callbacks))
      expect(callback).not.toHaveBeenCalled();
  });
  it("a former lifecycle cannot publish into a reactivated picker", async () => {
    const { run, callbacks } = setup();
    const waiting = deferred<string>();
    const work = vi.fn(() => waiting.promise);
    const old = run.execute("asset:upload", work, callbacks);
    await vi.waitFor(() => expect(work).toHaveBeenCalled());
    run.dispose();
    run.activate();
    const fresh = { done: vi.fn(), error: vi.fn() };
    await run.execute("asset:upload", async () => "new", fresh);
    waiting.reject(new Error("old error"));
    await old;
    expect(fresh.done).toHaveBeenCalledWith("new");
    for (const callback of Object.values(callbacks))
      expect(callback).not.toHaveBeenCalled();
  });
  it("does not dispatch captured actions after unmount", async () => {
    const { run, callbacks, request } = setup();
    run.dispose();
    const work = vi.fn();
    await run.execute("asset:upload", work, callbacks);
    expect(request).not.toHaveBeenCalled();
    expect(work).not.toHaveBeenCalled();
  });
  it("cancels only this run, leaving another picker operational", async () => {
    const a = setup(),
      b = setup();
    a.run.dispose();
    await b.run.execute("content:asset:list", async () => "b", b.callbacks);
    expect(b.callbacks.done).toHaveBeenCalledWith("b");
  });
  it("does not retry a failed upload or re-read identity after failure", async () => {
    const { run, callbacks, request } = setup();
    const work = vi.fn().mockRejectedValue(new Error("network unknown"));
    await run.execute("asset:upload", work, callbacks);
    expect(work).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);
    expect(callbacks.done).not.toHaveBeenCalled();
    expect(callbacks.error).toHaveBeenCalledTimes(1);
  });
  it("permission ordering and duplicates do not imply an identity change", () => {
    const user = actor();
    expect(pickerIdentity(user)).toBe(
      pickerIdentity({
        ...user,
        permissionKeys: [...user.permissionKeys]
          .reverse()
          .concat(user.permissionKeys),
      }),
    );
  });
});
