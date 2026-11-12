import { describe, it, expect, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import { AdminSessionController } from "@/platform/auth/session-controller";
import { SessionCommandGate } from "@/platform/auth/session-command-gate";
import {
  SessionOutcomeUnknown,
  loadingSession,
  type SessionState,
} from "@/platform/auth/session-model";
import { user, deferred } from "@/platform/auth/session-fixtures.test-helper";
function error(status: number) {
  return new ApiError("private backend detail", {
    status,
    code: status,
    traceId: null,
  });
}
function fixture(gate = new SessionCommandGate()) {
  let state: SessionState = loadingSession;
  const changed = vi.fn((value: SessionState) => {
    state = value;
  });
  const read = vi.fn(async (_signal: AbortSignal) => user),
    login = vi.fn(
      async (_input: { account: string; password: string }) => user,
    ),
    logout = vi.fn(async () => {});
  const controller = new AdminSessionController(
    { read, login, logout, changed },
    gate,
  );
  let stop = () => {};
  return {
    controller,
    gate,
    read,
    login,
    logout,
    changed,
    get state() {
      return state;
    },
    start() {
      stop = controller.activate();
      return stop;
    },
    stop() {
      stop();
    },
    actions() {
      return controller.actions();
    },
  };
}
async function ready(s: ReturnType<typeof fixture>) {
  await vi.waitFor(() => expect(s.state.status).not.toBe("loading"));
}
describe("admin credential lifecycle", () => {
  it("single-flights restoration and immediately hides old identity", async () => {
    const s = fixture();
    s.start();
    await ready(s);
    const pending = deferred<typeof user>();
    s.read.mockReturnValue(pending.promise);
    const task = s.actions().retryRestore();
    expect(s.state).toEqual(loadingSession);
    const other = s.actions().retryRestore();
    await Promise.resolve();
    expect(s.read).toHaveBeenCalledTimes(2);
    pending.resolve(user);
    await Promise.all([task, other]);
    expect(s.state.status).toBe("authenticated");
    s.stop();
  });
  it("cancels disposed reads and fences stale completions and actions", async () => {
    const s = fixture(),
      oldRead = deferred<typeof user>();
    s.read.mockReturnValueOnce(oldRead.promise);
    const cleanup = s.start();
    await Promise.resolve();
    const old = s.actions(),
      signal = s.read.mock.calls[0]?.[0];
    s.start();
    await ready(s);
    cleanup();
    const count = s.changed.mock.calls.length;
    oldRead.resolve({ ...user, userId: 8 });
    await Promise.resolve();
    expect(signal?.aborted).toBe(true);
    expect(s.changed).toHaveBeenCalledTimes(count);
    await expect(
      old.signIn({ account: "operator", password: "password" }),
    ).rejects.toThrow("失效");
    await old.signOut();
    expect(s.logout).not.toHaveBeenCalled();
    s.stop();
  });
  it.each([403, 500])("keeps HTTP %s unavailable", async (status) => {
    const s = fixture();
    s.read.mockRejectedValue(error(status));
    s.start();
    await ready(s);
    expect(s.state).toMatchObject({ status: "unavailable", currentUser: null });
    expect(s.state.errorMessage).not.toContain("private");
    expect(s.state).toMatchObject({ canSignOut: true });
    s.stop();
  });
  it("only final 401 becomes anonymous", async () => {
    const s = fixture();
    s.read.mockRejectedValue(error(401));
    s.start();
    await ready(s);
    expect(s.state.status).toBe("anonymous");
    s.stop();
  });
  it("locks login synchronously and uses configured grants without merchant identity", async () => {
    const s = fixture(),
      pending = deferred<typeof user>();
    s.start();
    await ready(s);
    s.login.mockReturnValue(pending.promise);
    const task = s.actions().signIn({ account: " Operator ", password: " a " });
    await expect(
      s.actions().signIn({ account: "operator", password: "password" }),
    ).rejects.toThrow("正在处理");
    expect(s.state).toEqual(loadingSession);
    expect(s.login).toHaveBeenCalledExactlyOnceWith({
      account: "operator",
      password: " a ",
    });
    pending.resolve(user);
    await expect(task).resolves.toEqual(user);
    expect(s.state.status).toBe("authenticated");
    s.stop();
  });
  it("validates before dispatch without erasing a known identity", async () => {
    const s = fixture();
    s.start();
    await ready(s);
    await expect(
      s.actions().signIn({ account: " ", password: "p" }),
    ).rejects.toThrow();
    expect(s.login).not.toHaveBeenCalled();
    expect(s.state.status).toBe("authenticated");
    s.stop();
  });
  it.each([
    new Error("lost"),
    error(408),
    error(500),
    new SessionOutcomeUnknown("malformed"),
  ])("retains unknown login until explicit recovery", async (cause) => {
    const s = fixture();
    s.start();
    await ready(s);
    s.login.mockRejectedValue(cause);
    await expect(
      s.actions().signIn({ account: "operator", password: "p" }),
    ).rejects.toThrow("未确认");
    expect(s.state).toMatchObject({ status: "unavailable", currentUser: null });
    expect(s.gate.pending).toBe(true);
    await expect(
      s.actions().signIn({ account: "operator", password: "p" }),
    ).rejects.toThrow();
    s.read.mockRejectedValue(error(401));
    await s.actions().retryRestore();
    expect(s.state.status).toBe("anonymous");
    expect(s.gate.pending).toBe(false);
    expect(s.login).toHaveBeenCalledTimes(1);
    s.stop();
  });
  it.each([400, 401, 403, 422, 429])(
    "reconciles definitive login rejection %s without replay",
    async (status) => {
      const s = fixture();
      s.start();
      await ready(s);
      s.login.mockRejectedValue(error(status));
      await expect(
        s.actions().signIn({ account: "operator", password: "p" }),
      ).rejects.toThrow(
        status === 429
          ? "登录过于频繁"
          : status === 401
            ? "账号或密码错误"
            : "被拒绝",
      );
      expect(s.login).toHaveBeenCalledTimes(1);
      expect(s.gate.pending).toBe(false);
      expect(s.state.status).toBe("authenticated");
      s.stop();
    },
  );
  it("does not report anonymous on failed logout and rejects duplicates", async () => {
    const s = fixture();
    s.start();
    await ready(s);
    s.logout.mockRejectedValue(new Error("lost"));
    await expect(s.actions().signOut()).rejects.toThrow("未确认");
    expect(s.state).toMatchObject({ status: "unavailable", currentUser: null });
    await expect(s.actions().signOut()).rejects.toThrow();
    expect(s.state).toMatchObject({ canSignOut: false });
    expect(s.logout).toHaveBeenCalledTimes(1);
    s.stop();
  });
  it("re-reads Cookie identity after confirmed logout rather than assuming guest", async () => {
    const s = fixture();
    s.start();
    await ready(s);
    s.read.mockResolvedValue({ ...user, userId: 8 });
    await s.actions().signOut();
    expect(s.state).toMatchObject({
      status: "authenticated",
      currentUser: { userId: 8 },
    });
    expect(s.logout).toHaveBeenCalledTimes(1);
    s.stop();
  });
  it("keeps failed recovery unavailable and preserves the fence", async () => {
    const s = fixture();
    s.start();
    await ready(s);
    s.logout.mockRejectedValue(error(503));
    await expect(s.actions().signOut()).rejects.toThrow();
    s.read.mockRejectedValue(error(500));
    await s.actions().retryRestore();
    expect(s.state.status).toBe("unavailable");
    expect(s.gate.pending).toBe(true);
    s.stop();
  });
  it("blocks dispatched writes across remounts and cannot publish old login", async () => {
    const gate = new SessionCommandGate(),
      s = fixture(gate),
      pending = deferred<typeof user>();
    s.start();
    await ready(s);
    s.login.mockReturnValue(pending.promise);
    const task = s.actions().signIn({ account: "operator", password: "p" });
    const rejected = expect(task).rejects.toThrow("当前页面");
    s.stop();
    const calls = s.changed.mock.calls.length;
    const next = fixture(gate);
    next.start();
    await next.actions().retryRestore();
    expect(next.read).not.toHaveBeenCalled();
    expect(next.state.status).toBe("loading");
    pending.resolve(user);
    await rejected;
    await ready(next);
    expect(next.state.status).toBe("authenticated");
    expect(s.changed).toHaveBeenCalledTimes(calls);
    next.stop();
  });
  it("unknown remount waits for explicit recovery", async () => {
    const gate = new SessionCommandGate(),
      settle = gate.begin()!;
    settle(false);
    const s = fixture(gate);
    s.start();
    expect(s.read).not.toHaveBeenCalled();
    expect(s.state.status).toBe("unavailable");
    await s.actions().retryRestore();
    expect(s.state.status).toBe("authenticated");
    expect(gate.pending).toBe(false);
    s.stop();
  });
  it("stale recovery cannot clear a newer gate generation", async () => {
    const gate = new SessionCommandGate(),
      settle = gate.begin()!;
    settle(false);
    const s = fixture(gate),
      pending = deferred<typeof user>();
    s.read.mockReturnValue(pending.promise);
    s.start();
    const task = s.actions().retryRestore();
    await Promise.resolve();
    expect(gate.acknowledge(gate.revision)).toBe(true);
    const next = gate.begin()!;
    pending.resolve(user);
    await task;
    expect(gate.inFlight).toBe(true);
    expect(s.state.currentUser).toBeNull();
    next(false);
    s.stop();
  });
});
