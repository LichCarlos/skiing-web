import { describe, expect, it, vi } from "vitest";
import { ApiError, type ApiClient } from "@common/api-contracts/client";
import {
  RegistrationRun,
  initialRegistration,
  type RegistrationState,
} from "@/features/auth/registration-run";

function setup() {
  let state: RegistrationState = initialRegistration;
  const request = vi.fn<ApiClient["request"]>(
    async () => ({ userId: 7, account: "snow", nickname: "雪友" }) as never,
  );
  const registered = vi.fn();
  const changed = vi.fn((next: RegistrationState) => {
    state = next;
  });
  const run = new RegistrationRun({
    request: request as ApiClient["request"],
    registered,
    changed,
  });
  run.activate();
  return {
    run,
    request,
    registered,
    changed,
    get state() {
      return state;
    },
  };
}
describe("registration lifecycle", () => {
  it("calls the confirmed API once and never logs in", async () => {
    const f = setup();
    await f.run.submit(" Snow ", "password8", " 雪友 ");
    expect(f.request).toHaveBeenCalledExactlyOnceWith("/auth/register", {
      method: "POST",
      body: { account: "snow", password: "password8", nickname: "雪友" },
      signal: expect.any(AbortSignal),
    });
    expect(f.registered).toHaveBeenCalledWith("snow");
    expect(f.state).toEqual({ busy: false, error: null });
    expect(JSON.stringify(f.state)).not.toContain("password8");
  });
  it("validates before touching the API", async () => {
    const f = setup();
    await f.run.submit("snow", "short", "雪");
    expect(f.request).not.toHaveBeenCalled();
    expect(f.state.error).toContain("8–72");
  });
  it.each([409, 429, 422, 403])(
    "provides recoverable feedback on %s without retries",
    async (status) => {
      const f = setup();
      f.request.mockRejectedValueOnce(
        new ApiError("private details", {
          status,
          code: status,
          traceId: null,
        }),
      );
      await f.run.submit("snow", "password8", "雪");
      expect(f.request).toHaveBeenCalledTimes(1);
      expect(f.registered).not.toHaveBeenCalled();
      expect(f.state.busy).toBe(false);
      expect(f.state.error).not.toContain("private details");
    },
  );
  it.each([
    new Error("offline"),
    new ApiError("timeout", { status: 408, code: 408, traceId: null }),
    new ApiError("unavailable", { status: 503, code: 503, traceId: null }),
  ])("does not automatically repeat an uncertain write", async (error) => {
    const f = setup();
    f.request.mockRejectedValueOnce(error);
    await f.run.submit("snow", "password8", "雪");
    expect(f.state.error).toContain("不要重复注册");
    expect(f.request).toHaveBeenCalledTimes(1);
    f.run.clear();
    expect(f.state.error).toBeNull();
  });
  it("rejects malformed success", async () => {
    const f = setup();
    f.request.mockResolvedValueOnce({ account: "other" } as never);
    await f.run.submit("snow", "password8", "雪");
    expect(f.registered).not.toHaveBeenCalled();
    expect(f.state.error).toContain("结果尚未确认");
  });
  it("blocks duplicate submissions and ignores late results after unmount/replay", async () => {
    const f = setup();
    let resolve!: (v: never) => void;
    f.request.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const work = f.run.submit("snow", "password8", "雪");
    await f.run.submit("snow", "password8", "雪");
    expect(f.request).toHaveBeenCalledTimes(1);
    const signal = f.request.mock.calls[0]![1]!.signal!;
    f.run.deactivate();
    f.run.activate();
    expect(signal.aborted).toBe(true);
    resolve({ userId: 7, account: "snow", nickname: "雪" } as never);
    await work;
    expect(f.registered).not.toHaveBeenCalled();
    expect(f.state.busy).toBe(false);
    await f.run.submit("snow", "password8", "雪");
    expect(f.registered).toHaveBeenCalledOnce();
  });
});
