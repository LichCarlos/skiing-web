import { describe, expect, it, vi } from "vitest";
import type { SiteConfig } from "@/features/site-config/site-config-api";
import {
  SiteConfigRun,
  initialConfigState,
  visibleConfig,
  type ConfigState,
} from "@/features/site-config/site-config-run";
const data: SiteConfig = {
  siteName: "雪客",
  tagline: "滑雪平台",
  about: null,
  contactEmail: null,
  privacyPolicy: "隐私正文",
  termsOfService: "协议正文",
  revision: "a".repeat(64),
};
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup() {
  const current = { path: "/privacy" as string | null };
  const states: ConfigState[] = [];
  const ports = {
    pathname: () => current.path,
    read: vi.fn(async (_signal: AbortSignal): Promise<SiteConfig> => data),
    changed: (state: ConfigState) => {
      states.push(state);
    },
  };
  const run = new SiteConfigRun(ports);
  return { current, states, ports, run };
}
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
describe("public config read lifecycle", () => {
  it("does not start before activation and publishes a validated read after activation", async () => {
    const { run, ports, states } = setup();
    await run.reload("/privacy");
    expect(ports.read).not.toHaveBeenCalled();
    run.activate("/privacy");
    expect(states.at(-1)).toMatchObject({
      data: null,
      loading: true,
      error: false,
    });
    await settle();
    expect(states.at(-1)).toMatchObject({
      pathname: "/privacy",
      data,
      loading: false,
      error: false,
    });
  });
  it("deduplicates synchronous repeated retries", async () => {
    const { run, ports } = setup();
    const pending = deferred<SiteConfig>();
    ports.read.mockReturnValue(pending.promise);
    run.activate("/privacy");
    const retry = run.retry("/privacy");
    retry();
    retry();
    await run.reload("/privacy");
    expect(ports.read).toHaveBeenCalledTimes(1);
    pending.resolve(data);
    await settle();
  });
  it("clears old content during manual reload and failure", async () => {
    const { run, ports, states } = setup();
    run.activate("/privacy");
    await settle();
    const failure = deferred<SiteConfig>();
    ports.read.mockReturnValueOnce(failure.promise);
    const work = run.reload("/privacy");
    expect(states.at(-1)).toMatchObject({ data: null, loading: true });
    failure.reject(new Error("internal failure must not be displayed"));
    await work;
    expect(states.at(-1)).toEqual({
      pathname: "/privacy",
      data: null,
      loading: false,
      error: true,
    });
    expect(ports.read).toHaveBeenCalledTimes(2);
  });
  it("can explicitly retry a failed read", async () => {
    const { run, ports, states } = setup();
    ports.read.mockRejectedValueOnce(new Error("offline"));
    run.activate("/privacy");
    await settle();
    await run.reload("/privacy");
    expect(states.at(-1)?.data).toEqual(data);
    expect(ports.read).toHaveBeenCalledTimes(2);
  });
  it("cancels on leaving and ignores an adapter's late success", async () => {
    const { run, ports, states } = setup();
    const pending = deferred<SiteConfig>();
    ports.read.mockReturnValue(pending.promise);
    const cleanup = run.activate("/privacy");
    const signal = ports.read.mock.calls[0]?.[0];
    expect(signal).toBeDefined();
    cleanup();
    pending.resolve(data);
    await settle();
    expect(signal?.aborted).toBe(true);
    expect(states).toHaveLength(1);
  });
  it("ignores a late error after a different page has loaded", async () => {
    const { run, ports, states, current } = setup();
    const first = deferred<SiteConfig>();
    ports.read.mockReturnValueOnce(first.promise);
    run.activate("/privacy");
    current.path = "/terms";
    run.activate("/terms");
    await settle();
    first.reject(new Error("old"));
    await settle();
    expect(states.at(-1)).toMatchObject({
      pathname: "/terms",
      data,
      error: false,
    });
  });
  it("does not let an old completion release the next read's gate", async () => {
    const { run, ports, current } = setup();
    const first = deferred<SiteConfig>(),
      second = deferred<SiteConfig>();
    ports.read
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    run.activate("/privacy");
    current.path = "/terms";
    run.activate("/terms");
    first.resolve(data);
    await settle();
    await run.reload("/terms");
    expect(ports.read).toHaveBeenCalledTimes(2);
    second.resolve(data);
    await settle();
  });
  it("ignores an old cleanup and retry even after returning to the same pathname", async () => {
    const { run, ports, current } = setup();
    const oldCleanup = run.activate("/privacy");
    const oldRetry = run.retry("/privacy");
    await settle();
    current.path = "/terms";
    run.activate("/terms");
    await settle();
    current.path = "/privacy";
    run.activate("/privacy");
    await settle();
    oldCleanup();
    oldRetry();
    expect(ports.read).toHaveBeenCalledTimes(3);
    await run.reload("/privacy");
    expect(ports.read).toHaveBeenCalledTimes(4);
  });
  it("blocks stale retry synchronously when pathname changes before effect cleanup", async () => {
    const { run, ports, current } = setup();
    run.activate("/privacy");
    await settle();
    const retry = run.retry("/privacy");
    current.path = "/terms";
    retry();
    await settle();
    expect(ports.read).toHaveBeenCalledTimes(1);
  });
  it("does not publish a reply after pathname changes before cleanup", async () => {
    const { run, ports, current, states } = setup();
    const pending = deferred<SiteConfig>();
    ports.read.mockReturnValueOnce(pending.promise);
    run.activate("/privacy");
    current.path = "/terms";
    pending.resolve(data);
    await settle();
    expect(states).toHaveLength(1);
  });
  it("handles synchronous transport configuration errors as a recoverable failure", async () => {
    const { run, ports, states } = setup();
    ports.read.mockImplementationOnce(() => {
      throw new Error("config");
    });
    run.activate("/privacy");
    await settle();
    expect(states.at(-1)).toMatchObject({ error: true, data: null });
    await run.reload("/privacy");
    expect(states.at(-1)?.data).toEqual(data);
  });
  it("supports effect cleanup and reactivation for the same path", async () => {
    const { run, ports, states } = setup();
    const pending = deferred<SiteConfig>();
    ports.read.mockReturnValueOnce(pending.promise);
    const cleanup = run.activate("/privacy");
    cleanup();
    run.activate("/privacy");
    await settle();
    pending.resolve({ ...data, siteName: "old" });
    await settle();
    expect(states.at(-1)?.data).toEqual(data);
    expect(ports.read).toHaveBeenCalledTimes(2);
  });
  it("masks a previous route's data, success or error before effects run", () => {
    expect(
      visibleConfig(
        { pathname: "/privacy", data, loading: false, error: false },
        "/terms",
      ),
    ).toEqual({ ...initialConfigState, pathname: "/terms" });
    expect(
      visibleConfig(
        { pathname: "/privacy", data: null, loading: false, error: true },
        "/terms",
      ).error,
    ).toBe(false);
  });
});
