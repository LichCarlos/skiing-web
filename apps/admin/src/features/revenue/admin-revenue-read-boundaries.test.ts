import { describe, expect, it, vi } from "vitest";
import type { apiRequest } from "@/platform/api";
import {
  records,
  operator,
  deferred,
} from "@/features/revenue/merchant-revenue-fixtures.test-helper";
import {
  readAdminRevenue,
  RevenueRecovery,
} from "@/features/revenue/admin-revenue-workflow";
import {
  RevenueImportRecovery,
  type RevenueImportAttempt,
  type RevenueImportStorage,
} from "@/features/revenue/admin-revenue-import-workflow";
const actor = {
  ...operator,
  merchant: null,
  permissionKeys: [
    "management:portal:enter",
    "revenue:system:list",
    "revenue:system:upsert",
  ],
};
const key = "b0bb38a0-d895-4243-afc1-eb356c7dbde1";
const query = () => new URLSearchParams({ page: "1", pageSize: "20" });
function transport(value: unknown) {
  const request = vi.fn(async (path: string) =>
    path === "/auth/me" ? actor : value,
  );
  return { request, api: request as unknown as typeof apiRequest };
}
describe("admin revenue complete read boundaries", () => {
  it("projects only approved fields including nested creator", async () => {
    const raw = {
      ...records,
      payload: "private",
      items: [
        {
          ...records.items[0]!,
          merchantPhone: "private",
          createdBy: {
            ...records.items[0]!.createdBy,
            passwordHash: "private",
          },
        },
      ],
    };
    const { api } = transport(raw);
    const result = await readAdminRevenue(
      api,
      actor,
      query(),
      new AbortController().signal,
    );
    expect(result).toEqual(records);
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it.each([
    { total: -1 },
    { total: "1" },
    { items: [] },
    { hasNext: true },
    { pageSize: 10 },
    { items: [{ ...records.items[0]!, revenueId: 0 }] },
    { items: [{ ...records.items[0]!, resortId: 2147483648 }] },
    { items: [{ ...records.items[0]!, resortName: "" }] },
    { items: [{ ...records.items[0]!, reportDate: "2026-02-30" }] },
    { items: [{ ...records.items[0]!, revenueAmount: 1.2 }] },
    { items: [{ ...records.items[0]!, revenueAmount: "10000000000.00" }] },
    { items: [{ ...records.items[0]!, source: "unknown" }] },
    { items: [{ ...records.items[0]!, note: { secret: true } }] },
    {
      items: [
        { ...records.items[0]!, createdBy: { userId: 0, nickname: "n" } },
      ],
    },
    { items: [{ ...records.items[0]!, updatedAt: "2026-10-01" }] },
    { total: 2, items: [records.items[0], records.items[0]] },
  ])("rejects malformed pages before display %j", async (patch) => {
    const { api } = transport({ ...records, ...patch });
    await expect(
      readAdminRevenue(api, actor, query(), new AbortController().signal),
    ).rejects.toThrow("收益");
  });
  it.each(["resortId=10", "fromDate=2026-10-02", "toDate=2026-09-30"])(
    "rejects rows outside %s",
    async (filter) => {
      const { api } = transport(records),
        q = query();
      for (const [k, v] of new URLSearchParams(filter)) q.set(k, v);
      await expect(
        readAdminRevenue(api, actor, q, new AbortController().signal),
      ).rejects.toThrow("筛选");
    },
  );
  it.each([
    "page=0&pageSize=20",
    "page=2147483648&pageSize=1",
    "page=1&pageSize=20&ownerId=1",
    "page=1&page=2&pageSize=20",
  ])(
    "rejects invalid direct query before identity/network %s",
    async (value) => {
      const { api, request } = transport(records);
      await expect(
        readAdminRevenue(
          api,
          actor,
          new URLSearchParams(value),
          new AbortController().signal,
        ),
      ).rejects.toThrow();
      expect(request).not.toHaveBeenCalled();
    },
  );
  it("captures caller query before awaiting identity", async () => {
    const wait = deferred<unknown>(),
      { api, request } = transport(records);
    request.mockImplementationOnce(
      async () => wait.promise as Promise<typeof actor>,
    );
    const q = query(),
      read = readAdminRevenue(api, actor, q, new AbortController().signal);
    q.set("resortId", "10");
    wait.resolve(actor);
    await expect(read).resolves.toEqual(records);
    expect(request.mock.calls[1]?.[0]).toBe(
      "/admin/revenue?page=1&pageSize=20",
    );
  });
  it("accepts a later empty page and an unbounded date query", async () => {
    const page = { ...records, page: 2, items: [] },
      { api } = transport(page);
    await expect(
      readAdminRevenue(
        api,
        actor,
        new URLSearchParams({ page: "2", pageSize: "20" }),
        new AbortController().signal,
      ),
    ).resolves.toEqual(page);
  });
});
function storage() {
  let value: RevenueImportAttempt | undefined;
  const store: RevenueImportStorage = {
    get: async () => value,
    create: async (v) => {
      value = v;
    },
    set: async (v) => (value = v),
    remove: async () => {
      value = undefined;
    },
  };
  return store;
}
describe("admin revenue lifetime cancellation keeps original recovery", () => {
  it("stores known CSV task metadata after a hidden response without calling another identity request", async () => {
    const recovery = new RevenueImportRecovery(actor.userId, storage());
    await recovery.restore();
    await recovery.choose(
      new File(["csv"], "revenue.csv", { type: "text/csv" }),
      () => key,
    );
    const wait = deferred<unknown>(),
      controller = new AbortController(),
      request = vi.fn(async (path: string) =>
        path === "/auth/me" ? actor : wait.promise,
      );
    const uploading = recovery.upload(
      request as unknown as typeof apiRequest,
      actor,
      controller.signal,
    );
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    controller.abort();
    const job = {
      jobId: "927c2386-6461-4fd4-9cbe-a1a33096841f",
      status: "pending",
      createdAt: "2026-11-01T00:00:00Z",
      updatedAt: "2026-11-01T00:00:00Z",
      totalRows: 1,
      processedRows: 0,
      succeededRows: 0,
      failedRows: 0,
      result: null,
    };
    wait.resolve(job);
    await expect(uploading).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(2);
    expect(recovery.snapshot()).toMatchObject({
      requestId: key,
      jobId: job.jobId,
    });
    expect(recovery.busy).toBe(false);
  });
  it("aborted original imports keep key/file without marking rejection or allocating another task", async () => {
    const recovery = new RevenueImportRecovery(actor.userId, storage());
    await recovery.restore();
    await recovery.choose(
      new File(["csv"], "revenue.csv", { type: "text/csv" }),
      () => key,
    );
    const wait = deferred<unknown>(),
      controller = new AbortController(),
      request = vi.fn(async (path: string) =>
        path === "/auth/me" ? actor : wait.promise,
      );
    const uploading = recovery.upload(
      request as unknown as typeof apiRequest,
      actor,
      controller.signal,
    );
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    controller.abort();
    wait.reject(new TypeError("cancelled"));
    await expect(uploading).rejects.toThrow();
    expect(recovery.snapshot()).toMatchObject({ requestId: key });
    expect(recovery.snapshot()?.rejected).toBeUndefined();
    expect(recovery.snapshot()?.jobId).toBeUndefined();
    expect(await recovery.snapshot()?.file.text()).toBe("csv");
  });
  it("stops single writes when hidden during identity verification", async () => {
    const recovery = new RevenueRecovery(actor.userId, {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      }),
      wait = deferred<unknown>(),
      controller = new AbortController();
    const request = vi.fn(
      async () => wait.promise,
    ) as unknown as typeof apiRequest;
    const sending = recovery.send(
      request,
      actor,
      { resortId: 9, reportDate: "2026-10-01", revenueAmount: "1.20" },
      () => key,
      controller.signal,
    );
    controller.abort();
    wait.resolve(actor);
    await expect(sending).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
    expect(recovery.snapshot()?.requestId).toBe(key);
    expect(recovery.snapshot()?.checked).toBeUndefined();
  });
  it("retains uncertain single write when hidden after PUT starts", async () => {
    const recovery = new RevenueRecovery(actor.userId, {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      }),
      wait = deferred<unknown>(),
      controller = new AbortController();
    const request = vi.fn(async (path: string) =>
      path === "/auth/me" ? actor : wait.promise,
    );
    const sending = recovery.send(
      request as unknown as typeof apiRequest,
      actor,
      { resortId: 9, reportDate: "2026-10-01", revenueAmount: "1.20" },
      () => key,
      controller.signal,
    );
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    controller.abort();
    wait.reject(new TypeError("cancelled response"));
    await expect(sending).rejects.toThrow();
    expect(recovery.snapshot()).toMatchObject({
      requestId: key,
      checked: false,
    });
    expect(recovery.snapshot()?.rejected).toBeUndefined();
  });
  it("serializes file preparation before asynchronous byte read", async () => {
    const recovery = new RevenueImportRecovery(actor.userId, storage());
    await recovery.restore();
    const wait = deferred<ArrayBuffer>(),
      file = new File(["csv"], "revenue.csv", { type: "text/csv" });
    vi.spyOn(file, "arrayBuffer").mockReturnValue(wait.promise);
    const choosing = recovery.choose(file, () => key);
    await expect(recovery.choose(file, () => key)).rejects.toThrow("处理中");
    expect(recovery.busy).toBe(true);
    wait.resolve(new ArrayBuffer(3));
    await choosing;
    expect(recovery.snapshot()?.requestId).toBe(key);
    expect(recovery.busy).toBe(false);
  });
  it("does not persist new file preparation after page cancellation", async () => {
    const store = storage(),
      create = vi.spyOn(store, "create"),
      recovery = new RevenueImportRecovery(actor.userId, store);
    await recovery.restore();
    const wait = deferred<ArrayBuffer>(),
      controller = new AbortController(),
      file = new File(["csv"], "revenue.csv", { type: "text/csv" });
    vi.spyOn(file, "arrayBuffer").mockReturnValue(wait.promise);
    const choosing = recovery.choose(file, () => key, controller.signal);
    controller.abort();
    wait.resolve(new ArrayBuffer(3));
    await expect(choosing).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
  it("does not choose over an unreadable original import record", async () => {
    const store = storage();
    store.get = async () => {
      throw new Error("storage unavailable");
    };
    const recovery = new RevenueImportRecovery(actor.userId, store);
    await recovery.restore();
    await expect(
      recovery.choose(
        new File(["csv"], "revenue.csv", { type: "text/csv" }),
        () => key,
      ),
    ).rejects.toThrow("存储");
  });
  it("stops CSV upload before POST and retains the exact file/key", async () => {
    const recovery = new RevenueImportRecovery(actor.userId, storage());
    await recovery.restore();
    await recovery.choose(
      new File(["csv"], "revenue.csv", { type: "text/csv" }),
      () => key,
    );
    const wait = deferred<unknown>(),
      controller = new AbortController(),
      request = vi.fn(async () => wait.promise);
    const uploading = recovery.upload(
      request as unknown as typeof apiRequest,
      actor,
      controller.signal,
    );
    controller.abort();
    wait.resolve(actor);
    await expect(uploading).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
    expect(await recovery.snapshot()?.file.text()).toBe("csv");
    expect(recovery.snapshot()?.requestId).toBe(key);
  });
});
