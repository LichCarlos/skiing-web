import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import type { components } from "@common/api-contracts/openapi";
import {
  dictionaryRows,
  dictionaryParents,
  dictionaryItemBody,
  dictionaryReadError,
  DictionaryReadLane,
  DictionaryWriteGate,
  type Item,
} from "@/features/dictionaries/dictionary-model";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const node = (itemId: number, children: Item[] = []): Item => ({
  itemId,
  parentId: null,
  label: `<item-${itemId}>`,
  value: `v${itemId}`,
  color: null,
  status: "active",
  sortOrder: itemId,
  isDefault: false,
  children,
});
const tree = [node(1, [node(2, [node(3)]), node(4)]), node(5)];
const user: components["schemas"]["CurrentUserVO"] = {
  userId: 42,
  account: "custom",
  nickname: "自定义管理员",
  avatarUrl: null,
  roles: [{ roleKey: "custom", roleName: "业务角色" }],
  menuTree: [],
  merchant: null,
  permissionKeys: [
    "management:portal:enter",
    "system:dict:list",
    "system:dict:create",
    "system:dict:update",
    "system:dict:delete",
  ],
};
const apiError = (status: number) =>
  new ApiError("private server message", {
    status,
    code: status,
    traceId: "dictionary-trace",
  });

describe("dictionary hierarchy forms", () => {
  it("shows each item once with its depth, without AntD recursive children", () => {
    const rows = dictionaryRows(tree);
    expect(rows.map((item) => [item.itemId, item.depth])).toEqual([
      [1, 0],
      [2, 1],
      [3, 2],
      [4, 1],
      [5, 0],
    ]);
    expect(rows.every((item) => !("children" in item))).toBe(true);
    expect(tree[0]?.children).toHaveLength(2);
  });
  it.each([
    [1, [5]],
    [2, [1, 4, 5]],
    [3, [1, 2, 4, 5]],
  ])(
    "does not offer item %i or any descendant as its parent",
    (id, allowed) => {
      expect(
        dictionaryParents(tree, id as number).map((item) => item.value),
      ).toEqual(allowed);
    },
  );
  it("offers all levels for new items and handles an empty tree", () => {
    expect(dictionaryParents(tree).map((item) => item.value)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(dictionaryParents(tree)[2]?.label).toContain("　　<item-3>");
    expect(dictionaryParents([])).toEqual([]);
  });
  it.each([undefined, null, 4])(
    "serializes cleared parent %s as an explicit null",
    (parentId) => {
      const body = dictionaryItemBody({
        label: "Label",
        value: "value",
        parentId,
        color: "  ",
        sortOrder: 0,
        isDefault: false,
      });
      expect(JSON.parse(JSON.stringify(body))).toEqual({
        label: "Label",
        value: "value",
        parentId: parentId ?? null,
        color: null,
        sortOrder: 0,
        isDefault: false,
      });
    },
  );
  it("keeps explicit status and trims color without inventing other fields", () => {
    expect(
      dictionaryItemBody({
        label: "L",
        value: "V",
        color: " #Ff0022 ",
        sortOrder: -1,
        isDefault: true,
        status: "disabled",
      }),
    ).toEqual({
      label: "L",
      value: "V",
      parentId: null,
      color: "#Ff0022",
      sortOrder: -1,
      isDefault: true,
      status: "disabled",
    });
  });
  it.each([403, 404, 500])("does not echo raw HTTP %i error text", (status) => {
    expect(dictionaryReadError(apiError(status))).not.toContain("private");
    expect(dictionaryReadError(apiError(status))).toBeTruthy();
  });
});

describe("dictionary list/detail query ownership", () => {
  it("ignores late success even when the transport ignores its aborted signal", async () => {
    const lane = new DictionaryReadLane();
    const old = deferred<string>();
    const publish = vi.fn();
    const fail = vi.fn();
    const settled = vi.fn();
    let oldSignal!: AbortSignal;
    const first = lane.run(
      (signal) => {
        oldSignal = signal;
        return old.promise;
      },
      publish,
      fail,
      settled,
    );
    const next = lane.run(async () => "new group", publish, fail, settled);
    expect(await next).toBe(true);
    expect(oldSignal.aborted).toBe(true);
    old.resolve("old group");
    expect(await first).toBe(false);
    expect(publish.mock.calls).toEqual([["new group"]]);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(fail).not.toHaveBeenCalled();
  });
  it("ignores old errors and finalizers while a newer selection is still loading", async () => {
    const lane = new DictionaryReadLane();
    const old = deferred<string>();
    const next = deferred<string>();
    const publish = vi.fn();
    const fail = vi.fn();
    const settled = vi.fn();
    const first = lane.run(() => old.promise, publish, fail, settled);
    const second = lane.run(() => next.promise, publish, fail, settled);
    old.reject(apiError(403));
    await first;
    expect(settled).not.toHaveBeenCalled();
    expect(fail).not.toHaveBeenCalled();
    next.resolve("selected dictionary");
    await second;
    expect(publish).toHaveBeenCalledWith("selected dictionary");
  });
  it("does not publish after closing details or unmounting the account", async () => {
    const lane = new DictionaryReadLane();
    const pending = deferred<string>();
    const publish = vi.fn();
    const fail = vi.fn();
    const settled = vi.fn();
    const result = lane.run(() => pending.promise, publish, fail, settled);
    lane.cancel();
    pending.resolve("private items");
    expect(await result).toBe(false);
    expect(publish).not.toHaveBeenCalled();
    expect(settled).not.toHaveBeenCalled();
  });
  it("isolates list and detail lanes so a detail response cannot restart a list", async () => {
    const list = new DictionaryReadLane();
    const detail = new DictionaryReadLane();
    const pending = deferred<string>();
    const publish = vi.fn();
    const fail = vi.fn();
    const settled = vi.fn();
    const readList = vi.fn(() => pending.promise);
    const listing = list.run(readList, publish, fail, settled);
    await detail.run(async () => "detail", publish, fail, settled);
    detail.cancel();
    pending.resolve("list");
    expect(await listing).toBe(true);
    expect(readList).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls).toEqual([["detail"], ["list"]]);
  });
  it("can reload after cleanup, and a current failure ends loading exactly once", async () => {
    const lane = new DictionaryReadLane();
    lane.cancel();
    const fail = vi.fn();
    const settled = vi.fn();
    expect(
      await lane.run(
        async () => {
          throw apiError(404);
        },
        vi.fn(),
        fail,
        settled,
      ),
    ).toBe(false);
    expect(fail).toHaveBeenCalledTimes(1);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(await lane.run(async () => "restored", vi.fn(), fail, settled)).toBe(
      true,
    );
  });
});

function setup(verify = vi.fn(async (_signal: AbortSignal) => user)) {
  const busy = vi.fn();
  const write = vi.fn(
    async (_value: string, _signal: AbortSignal) => undefined,
  );
  const committed = vi.fn();
  const gate = new DictionaryWriteGate(user.userId, verify, busy);
  gate.activate();
  const run = (prepare = async () => "body") =>
    gate.run("system:dict:create", prepare, write, committed);
  return { gate, verify, busy, write, committed, run };
}

describe("dictionary account and mutation gate", () => {
  it("locks before async form validation and prevents two simultaneous submits", async () => {
    const { run, write, busy } = setup();
    const pending = deferred<string>();
    const first = run(() => pending.promise);
    expect(await run()).toEqual({ status: "ignored" });
    pending.resolve("form data");
    expect(await first).toEqual({ status: "success" });
    expect(write).toHaveBeenCalledTimes(1);
    expect(busy.mock.calls).toEqual([[true], [false]]);
  });
  it("does not fetch identity or write on invalid form fields", async () => {
    const { gate, verify, write, committed, busy } = setup();
    expect(
      await gate.run("system:dict:create", async () => null, write, committed),
    ).toEqual({ status: "ignored" });
    expect(verify).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(busy.mock.calls).toEqual([[true], [false]]);
  });
  it.each([
    "management:portal:enter",
    "system:dict:list",
    "system:dict:create",
  ])("checks the fresh %s grant before writing", async (removed) => {
    const { run, write } = setup(
      vi.fn(async () => ({
        ...user,
        permissionKeys: user.permissionKeys.filter((key) => key !== removed),
      })),
    );
    expect(await run()).toMatchObject({ status: "error", uncertain: false });
    expect(write).not.toHaveBeenCalled();
  });
  it("refuses a changed Cookie account, without requiring a special business role key", async () => {
    const changed = setup(vi.fn(async () => ({ ...user, userId: 90 })));
    expect(await changed.run()).toMatchObject({
      status: "error",
      uncertain: false,
    });
    expect(changed.write).not.toHaveBeenCalled();
    const custom = setup();
    expect(await custom.run()).toEqual({ status: "success" });
    expect(custom.committed).toHaveBeenCalledTimes(1);
  });
  it("does not send a request if account changes while validating the form", async () => {
    const { gate, run, verify, write } = setup();
    const pending = deferred<string>();
    const result = run(() => pending.promise);
    gate.dispose();
    pending.resolve("old form");
    expect(await result).toEqual({ status: "ignored" });
    expect(verify).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
  it("does not send a write if account changes while identity is being checked", async () => {
    const pending = deferred<typeof user>();
    const { gate, run, verify, write } = setup(vi.fn(() => pending.promise));
    const result = run();
    await vi.waitFor(() => expect(verify).toHaveBeenCalledTimes(1));
    gate.dispose();
    pending.resolve(user);
    expect(await result).toEqual({ status: "ignored" });
    expect(write).not.toHaveBeenCalled();
  });
  it("ignores late write success and does not publish into a different account", async () => {
    const { gate, run, write, committed, busy } = setup();
    const pending = deferred<undefined>();
    write.mockImplementation(() => pending.promise);
    const result = run();
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(write.mock.calls[0]?.[1].aborted).toBe(false);
    gate.dispose();
    pending.resolve(undefined);
    expect(await result).toEqual({ status: "ignored" });
    expect(write.mock.calls[0]?.[1].aborted).toBe(true);
    expect(committed).not.toHaveBeenCalled();
    expect(busy.mock.calls).toEqual([[true]]);
  });
  it.each([400, 401, 403, 404, 409, 429])(
    "a definitive %i rejection does not block a corrected submission",
    async (status) => {
      const { run, write } = setup();
      write.mockRejectedValueOnce(apiError(status));
      expect(await run()).toMatchObject({ status: "error", uncertain: false });
      expect(await run()).toEqual({ status: "success" });
      expect(write).toHaveBeenCalledTimes(2);
    },
  );
  it.each([apiError(408), apiError(500), new TypeError("network lost")])(
    "an unconfirmed response blocks repeated creates until explicit review",
    async (cause) => {
      const { gate, run, write } = setup();
      write.mockRejectedValueOnce(cause);
      expect(await run()).toMatchObject({ status: "error", uncertain: true });
      expect(await run()).toEqual({ status: "ignored" });
      expect(write).toHaveBeenCalledTimes(1);
      gate.acknowledgeReview();
      expect(await run()).toEqual({ status: "success" });
    },
  );
  it("identity network failure is safe to retry because no write was attempted", async () => {
    const verify = vi
      .fn(async (_signal: AbortSignal) => user)
      .mockRejectedValueOnce(new TypeError("offline"));
    const { run, write } = setup(verify);
    expect(await run()).toMatchObject({ status: "error", uncertain: false });
    expect(write).not.toHaveBeenCalled();
    expect(await run()).toEqual({ status: "success" });
  });
  it("supports effect cleanup/reactivation without letting an older operation unlock the new one", async () => {
    const { gate, run, write, busy } = setup();
    const old = deferred<string>();
    const fresh = deferred<string>();
    const beforeCleanup = run(() => old.promise);
    gate.dispose();
    gate.activate();
    const afterCleanup = run(() => fresh.promise);
    old.resolve("old");
    expect(await beforeCleanup).toEqual({ status: "ignored" });
    expect(await run()).toEqual({ status: "ignored" });
    fresh.resolve("fresh");
    expect(await afterCleanup).toEqual({ status: "success" });
    expect(write).toHaveBeenCalledTimes(1);
    expect(busy.mock.calls).toEqual([[true], [true], [false]]);
  });
});
