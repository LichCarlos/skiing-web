import { expect, it, vi } from "vitest";
import {
  RagCommandSession,
  RagRecoveryLedger,
  ragRecoveryLedger,
} from "@/features/ai-operations/rag-workflow";
import {
  commandResult,
  ragCommandRequest,
  ragOperator,
  ragSource,
} from "@/features/ai-operations/rag-fixtures.test-helper";
import { deferred } from "@/platform/auth/session-fixtures.test-helper";
async function untilWrite(request: ReturnType<typeof ragCommandRequest>) {
  for (let i = 0; i < 30; i++) {
    if (request.mock.calls.some(([, options]) => options?.method)) return;
    await Promise.resolve();
  }
  throw new Error("Command was not dispatched");
}
function setup(
  request = ragCommandRequest(),
  ledger = new RagRecoveryLedger(),
) {
  const changed = vi.fn();
  const writer = new RagCommandSession(request, ragOperator, ledger, changed);
  return { request, ledger, changed, writer };
}
it("requires visible activation, takes a synchronous lock and publishes one validated result", async () => {
  const { writer, request, changed, ledger } = setup();
  expect(await writer.run(ragSource, "reindex", "reason")).toBe(false);
  writer.activate(false);
  expect(await writer.run(ragSource, "reindex", "reason")).toBe(false);
  expect(request).not.toHaveBeenCalled();
  writer.setVisible(true);
  const first = writer.run(ragSource, "reindex", "reason");
  expect(await writer.run(ragSource, "reindex", "second")).toBe(false);
  expect(await first).toBe(true);
  expect(changed).toHaveBeenLastCalledWith({
    busy: false,
    result: commandResult(),
  });
  expect(ledger.entry(ragOperator.userId, 8)).toBeUndefined();
  expect(
    request.mock.calls.filter(([, options]) => options?.method),
  ).toHaveLength(1);
});
it("keeps only target metadata across remounts and requires an up-to-date explicit acknowledgement", async () => {
  const pending = deferred<unknown>(),
    request = ragCommandRequest();
  request.mockImplementation(async (path, options) =>
    options?.method
      ? pending.promise
      : path === "/auth/me"
        ? ragOperator
        : ragSource,
  );
  const { writer, ledger } = setup(request);
  const dispose = writer.activate(true),
    task = writer.run(ragSource, "reindex", "private-reason");
  await untilWrite(request);
  const inFlightVersion = ledger.version;
  expect(ledger.acknowledge(ragOperator.userId, 8, inFlightVersion)).toBe(
    false,
  );
  expect(ledger.confirmRead(ragOperator.userId, 8, inFlightVersion)).toBe(
    false,
  );
  expect(JSON.stringify(ledger.entry(ragOperator.userId, 8))).not.toContain(
    "private",
  );
  dispose();
  const remounted = setup(request, ledger);
  remounted.writer.activate(true);
  expect(await remounted.writer.run(ragSource, "reindex", "reason")).toBe(
    false,
  );
  pending.reject(new Error("private-provider-error"));
  expect(await task).toBe(false);
  expect(ledger.entry(ragOperator.userId, 8)?.inFlight).toBe(false);
  expect(ledger.acknowledge(ragOperator.userId, 8, inFlightVersion)).toBe(
    false,
  );
  expect(ledger.acknowledge(ragOperator.userId, 8, ledger.version)).toBe(false);
  expect(ledger.confirmRead(ragOperator.userId, 8, ledger.version)).toBe(true);
  expect(ledger.acknowledge(ragOperator.userId, 8, ledger.version)).toBe(true);
  expect(ledger.entry(ragOperator.userId, 8)).toBeUndefined();
});
it.each(["hide", "dispose", "reactivate"] as const)(
  "isolates late command success after %s without clearing recovery",
  async (action) => {
    const pending = deferred<unknown>(),
      request = ragCommandRequest();
    request.mockImplementation(async (path, options) =>
      options?.method
        ? pending.promise
        : path === "/auth/me"
          ? ragOperator
          : ragSource,
    );
    const { writer, ledger, changed } = setup(request),
      dispose = writer.activate(true);
    const task = writer.run(ragSource, "reindex", "reason");
    await untilWrite(request);
    if (action === "hide") writer.setVisible(false);
    else if (action === "dispose") dispose();
    else writer.activate(true);
    if (action !== "reactivate") writer.activate(true);
    expect(await writer.run(ragSource, "reindex", "reason")).toBe(false);
    pending.resolve(commandResult());
    expect(await task).toBe(false);
    expect(ledger.entry(ragOperator.userId, 8)?.inFlight).toBe(false);
    expect(
      changed.mock.calls.every(([state]) => !state.result && !state.error),
    ).toBe(true);
  },
);
it("a stale activation cleanup cannot abort the new activation", async () => {
  const { writer } = setup(),
    oldDispose = writer.activate(true);
  writer.activate(true);
  oldDispose();
  expect(await writer.run(ragSource, "reindex", "reason")).toBe(true);
});
it("aborting during preflight never records or dispatches a command", async () => {
  const pending = deferred<unknown>(),
    request = ragCommandRequest();
  request.mockReturnValue(pending.promise);
  const { writer, ledger } = setup(request),
    dispose = writer.activate(true);
  const task = writer.run(ragSource, "reindex", "reason");
  dispose();
  pending.resolve(ragOperator);
  expect(await task).toBe(false);
  expect(ledger.entry(ragOperator.userId, 8)).toBeUndefined();
  expect(request).toHaveBeenCalledTimes(1);
});
it.each(["network", "malformed", "identity"])(
  "keeps uncertain %s outcomes locked without replay or raw error leaks",
  async (failure) => {
    const request = ragCommandRequest();
    let sent = false;
    request.mockImplementation(async (path, options) => {
      if (options?.method) {
        sent = true;
        if (failure === "network") throw new Error("private-provider-error");
        return failure === "malformed"
          ? { ...commandResult(), eventId: null }
          : commandResult();
      }
      if (path === "/auth/me")
        return sent && failure === "identity"
          ? { ...ragOperator, account: "changed" }
          : ragOperator;
      return ragSource;
    });
    const { writer, ledger, changed } = setup(request);
    writer.activate(true);
    expect(await writer.run(ragSource, "reindex", "reason")).toBe(false);
    expect(ledger.entry(ragOperator.userId, 8)?.inFlight).toBe(false);
    expect(await writer.run(ragSource, "reindex", "reason")).toBe(false);
    expect(
      changed.mock.calls.every(
        ([state]) =>
          !state.result && !state.error?.includes("private-provider"),
      ),
    ).toBe(true);
    expect(
      request.mock.calls.filter(([, options]) => options?.method),
    ).toHaveLength(1);
  },
);
it("pre-dispatch validation errors preserve the form without creating recovery entries", async () => {
  const { writer, ledger, request, changed } = setup();
  writer.activate(true);
  expect(await writer.run(ragSource, "reindex", " ")).toBe(false);
  expect(request).not.toHaveBeenCalled();
  expect(ledger.entry(ragOperator.userId, 8)).toBeUndefined();
  expect(changed).toHaveBeenLastCalledWith({
    busy: false,
    error: "操作原因须为 1–500 字",
  });
});
it("allows only one dispatch across concurrent components sharing the ledger", async () => {
  const pending = deferred<unknown>(),
    request = ragCommandRequest();
  request.mockImplementation(async (path, options) =>
    options?.method
      ? pending.promise
      : path === "/auth/me"
        ? ragOperator
        : ragSource,
  );
  const first = setup(request),
    second = setup(request, first.ledger);
  first.writer.activate(true);
  second.writer.activate(true);
  const a = first.writer.run(ragSource, "reindex", "reason"),
    b = second.writer.run(ragSource, "reindex", "reason");
  await untilWrite(request);
  pending.resolve(commandResult());
  expect((await Promise.all([a, b])).filter(Boolean)).toHaveLength(1);
  expect(
    request.mock.calls.filter(([, options]) => options?.method),
  ).toHaveLength(1);
});
it("isolates recovery by account and target, not configurable role keys", () => {
  const ledger = new RagRecoveryLedger(),
    listener = vi.fn(),
    unsubscribe = ledger.subscribe(listener);
  const settle = ledger.begin(7, ragSource, "disable");
  const entry = ledger.entry(7, 8)!;
  entry.expectedVersion = 99;
  expect(ledger.entry(7, 8)?.expectedVersion).toBe(4);
  expect(ledger.entry(8, 8)).toBeUndefined();
  expect(ledger.entry(7, 9)).toBeUndefined();
  const version = ledger.version;
  settle(false);
  settle(true);
  expect(ledger.acknowledge(7, 8, version)).toBe(false);
  expect(ledger.confirmRead(7, 8, version)).toBe(false);
  expect(ledger.confirmRead(7, 8, ledger.version)).toBe(true);
  expect(ledger.acknowledge(7, 8, ledger.version)).toBe(true);
  expect(listener).toHaveBeenCalledTimes(3);
  unsubscribe();
});
it("does not share an SSR ledger between requests", () => {
  expect(ragRecoveryLedger()).not.toBe(ragRecoveryLedger());
});
