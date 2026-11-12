import { describe, it, expect, vi } from "vitest";
import {
  ApiError,
  type ApiRequestOptions,
  type ApiClient,
} from "@common/api-contracts/client";
import { PublicSessionRun } from "@/platform/auth/public-session-run";
import { PublicSessionFence } from "@/platform/auth/public-session-fence";
import {
  initialPublicSession,
  type PublicSessionState,
} from "@/platform/auth/public-session-model";
import {
  user,
  auth,
  deferred,
} from "@/platform/auth/public-session-fixtures.test-helper";
function error(status: number) {
  return new ApiError("hidden server details", {
    status,
    code: status,
    traceId: null,
  });
}
function fixture(fence = new PublicSessionFence()) {
  const values = {
    me: user as unknown,
    login: auth as unknown,
    logout: { loggedOut: true } as unknown,
  };
  let path = "/knowledge";
  let state: PublicSessionState = initialPublicSession;
  const changed = vi.fn((value: PublicSessionState) => {
    state = value;
  });
  const request = vi.fn(async (route: string, _options?: ApiRequestOptions) => {
    const result =
      route === "/auth/me"
        ? values.me
        : route === "/auth/login"
          ? values.login
          : route === "/auth/logout"
            ? values.logout
            : error(404);
    if (result instanceof Error) throw result;
    return result;
  });
  const run = new PublicSessionRun(
    { pathname: () => path, request: request as ApiClient["request"], changed },
    fence,
  );
  let stop = () => {};
  return {
    values,
    request,
    changed,
    fence,
    run,
    get state() {
      return state;
    },
    get path() {
      return path;
    },
    start(next = path) {
      path = next;
      stop = run.activate(path);
      return stop;
    },
    stop() {
      stop();
    },
    actions() {
      return run.actions(path);
    },
  };
}
async function ready(s: ReturnType<typeof fixture>) {
  await vi.waitFor(() => expect(s.state.reading).toBe(false));
}
describe("public website session lifecycle", () => {
  it("hides identity immediately during rechecks, uses cancellation and no-store", async () => {
    const s = fixture();
    s.start();
    await ready(s);
    const read = deferred<unknown>();
    s.values.me = read.promise;
    const task = s.actions().restore();
    expect(s.state).toMatchObject({ ready: false, user: null, reading: true });
    expect(s.request).toHaveBeenLastCalledWith(
      "/auth/me",
      expect.objectContaining({
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    );
    read.resolve(user);
    await task;
    expect(s.state.user).toEqual(user);
    s.stop();
  });
  it("single-flights focus and manual rechecks", async () => {
    const s = fixture(),
      read = deferred<unknown>();
    s.values.me = read.promise;
    s.start();
    await s.actions().restore();
    await s.actions().restore(false);
    expect(s.request).toHaveBeenCalledTimes(1);
    read.resolve(user);
    await ready(s);
    s.stop();
  });
  it("cancels stale route reads, and stale actions cannot write or stop a newer route", async () => {
    const s = fixture(),
      read = deferred<unknown>();
    s.values.me = read.promise;
    const oldStop = s.start();
    const old = s.actions();
    const signal = s.request.mock.calls[0]?.[1]?.signal;
    s.values.me = { ...user, userId: 8 };
    s.start("/privacy");
    await ready(s);
    expect(signal?.aborted).toBe(true);
    oldStop();
    await old.login("snow.user", "password");
    await old.logout();
    await old.restore();
    read.resolve(user);
    await Promise.resolve();
    expect(s.state.user?.userId).toBe(8);
    expect(s.request).toHaveBeenCalledTimes(2);
    s.stop();
  });
  it("invalidates actions even after returning to the same path", async () => {
    const s = fixture();
    s.start();
    await ready(s);
    const old = s.actions();
    s.start();
    await ready(s);
    await old.logout();
    expect(s.request.mock.calls.every(([p]) => p === "/auth/me")).toBe(true);
    s.stop();
  });
  it.each([403, 500])(
    "does not treat HTTP %s as a guest or preserve an old identity",
    async (status) => {
      const s = fixture();
      s.start();
      await ready(s);
      s.values.me = error(status);
      await s.actions().restore();
      expect(s.state).toMatchObject({
        ready: false,
        user: null,
        reading: false,
      });
      expect(s.state.error).not.toContain("hidden server");
      s.stop();
    },
  );
  it("recognizes only a final 401 as an anonymous session", async () => {
    const s = fixture();
    s.values.me = error(401);
    s.start();
    await ready(s);
    expect(s.state).toMatchObject({ ready: true, user: null, error: null });
    s.stop();
  });
  it("uses a synchronous command fence, normalizes inputs, and rechecks actual cookie identity after login", async () => {
    const s = fixture(),
      write = deferred<unknown>();
    s.values.me = error(401);
    s.start();
    await ready(s);
    s.values.login = write.promise;
    const a = s.actions().login(" Snow.User ", " password ");
    const b = s.actions().login("snow.user", "password");
    expect(s.state).toMatchObject({ ready: false, user: null, busy: true });
    expect(await b).toBe(false);
    expect(s.request).toHaveBeenLastCalledWith("/auth/login", {
      method: "POST",
      body: { account: "snow.user", password: " password " },
    });
    s.values.me = { ...user, userId: 8, nickname: "Cookie当前账号" };
    write.resolve(auth);
    await a;
    await ready(s);
    expect(s.state.user?.userId).toBe(8);
    expect(
      s.request.mock.calls.filter(([p]) => p === "/auth/login"),
    ).toHaveLength(1);
    s.stop();
  });
  it("validates before dispatch, without hiding a known identity for invalid input", async () => {
    const s = fixture();
    s.start();
    await ready(s);
    expect(await s.actions().login(" ", "x")).toBe(false);
    expect(s.state.user).toEqual(user);
    expect(s.request).toHaveBeenCalledTimes(1);
    s.stop();
  });
  it.each([new Error("lost"), error(408), error(500), error(503)])(
    "blocks unknown login outcomes until explicit successful identity recovery",
    async (cause) => {
      const s = fixture();
      s.start();
      await ready(s);
      s.values.login = cause;
      await s.actions().login(user.account, "password");
      expect(s.state).toMatchObject({
        ready: false,
        user: null,
        uncertain: true,
        busy: false,
      });
      const calls = s.request.mock.calls.length;
      await s.actions().restore(false);
      expect(await s.actions().login(user.account, "password")).toBe(false);
      expect(s.request).toHaveBeenCalledTimes(calls);
      s.values.me = error(401);
      await s.actions().restore();
      expect(s.state).toMatchObject({
        ready: true,
        user: null,
        uncertain: false,
      });
      expect(s.fence.pending).toBe(false);
      s.stop();
    },
  );
  it.each([400, 401, 403, 422, 429])(
    "reconciles definitive credential rejection %s without replaying the command",
    async (status) => {
      const s = fixture();
      s.start();
      await ready(s);
      s.values.login = error(status);
      await s.actions().login(user.account, "password");
      await ready(s);
      expect(s.fence.pending).toBe(false);
      expect(s.state.error).toContain(
        status === 429 ? "登录过于频繁" : "被拒绝",
      );
      expect(
        s.request.mock.calls.filter(([p]) => p === "/auth/login"),
      ).toHaveLength(1);
      s.stop();
    },
  );
  it("keeps recovery blocked after malformed identity or an unsuccessful recovery read", async () => {
    const s = fixture();
    s.start();
    await ready(s);
    s.values.logout = { loggedOut: false };
    await s.actions().logout();
    expect(s.state.uncertain).toBe(true);
    s.values.me = { ...user, roles: null };
    await s.actions().restore();
    expect(s.fence.pending).toBe(true);
    s.values.me = error(500);
    await s.actions().restore();
    expect(s.state.ready).toBe(false);
    s.values.me = user;
    await s.actions().restore();
    expect(s.state.user).toEqual(user);
    expect(s.fence.pending).toBe(false);
    s.stop();
  });
  it("rechecks after a successful logout acknowledgement and never replays it", async () => {
    const s = fixture();
    s.start();
    await ready(s);
    s.values.me = error(401);
    await s.actions().logout();
    await ready(s);
    expect(s.state).toMatchObject({
      ready: true,
      user: null,
      uncertain: false,
    });
    expect(s.request).toHaveBeenCalledWith("/auth/logout", {
      method: "POST",
      body: {},
    });
    s.stop();
  });
  it("keeps dispatched writes blocked across provider remounts and isolates late completions", async () => {
    const fence = new PublicSessionFence(),
      s = fixture(fence),
      write = deferred<unknown>();
    s.start();
    await ready(s);
    s.values.logout = write.promise;
    const task = s.actions().logout();
    s.stop();
    const calls = s.changed.mock.calls.length;
    const next = fixture(fence);
    next.start();
    expect(next.state.busy).toBe(true);
    expect(next.request).not.toHaveBeenCalled();
    expect(await next.actions().login(user.account, "password")).toBe(false);
    write.reject(new Error("lost"));
    await task;
    expect(s.changed).toHaveBeenCalledTimes(calls);
    expect(next.state.uncertain).toBe(true);
    next.values.me = error(401);
    await next.actions().restore();
    expect(next.state.ready).toBe(true);
    next.stop();
  });
  it("stops a stale recovery from clearing a newer fence generation", async () => {
    const s = fixture();
    s.start();
    await ready(s);
    s.values.login = new Error("lost");
    await s.actions().login(user.account, "password");
    const read = deferred<unknown>();
    s.values.me = read.promise;
    const task = s.actions().restore();
    const version = s.fence.version;
    expect(s.fence.acknowledge(version)).toBe(true);
    const settle = s.fence.begin()!;
    read.resolve(user);
    await task;
    expect(s.state.user).toBeNull();
    expect(s.fence.inFlight).toBe(true);
    settle(false);
    s.stop();
  });
});
