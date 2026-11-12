import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import { apiRequest } from "@/platform/api";
import {
  operator,
  records,
  deferred,
} from "@/features/revenue/merchant-revenue-fixtures.test-helper";
import {
  RevenueRecovery,
  adminRevenueQuery,
  canUseAdminRevenue,
  readAdminRevenue,
} from "@/features/revenue/admin-revenue-workflow";

const actor = {
  ...operator,
  merchant: null,
  permissionKeys: [
    "management:portal:enter",
    "revenue:system:list",
    "revenue:system:upsert",
  ],
};
const body = {
  resortId: 9,
  reportDate: "2026-10-01",
  revenueAmount: "1.20",
  note: "original",
};
const record = { ...records.items[0]!, ...body };
const key = "b0bb38a0-d895-4243-afc1-eb356c7dbde1";
const result = {
  requestId: key,
  status: "completed",
  createdAt: record.createdAt,
  completedAt: record.updatedAt,
  result: record,
};
const fail = (status: number, code?: string) =>
  new ApiError("request failed", {
    status,
    code: status,
    traceId: "test",
    details: code ? [{ code, message: code }] : undefined,
  });
function storage() {
  const entries = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => entries.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      entries.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      entries.delete(key);
    }),
  };
}
function setup() {
  const store = storage();
  const recovery = new RevenueRecovery(actor.userId, store);
  const request = vi.fn(async (path: string, options?: { method?: string }) =>
    path === "/auth/me"
      ? actor
      : options?.method === "PUT"
        ? record
        : path.includes("/requests/")
          ? result
          : records,
  );
  return {
    store,
    recovery,
    request,
    api: request as unknown as typeof apiRequest,
  };
}
beforeEach(() => vi.clearAllMocks());
describe("admin revenue query boundaries", () => {
  it("reads all visible dates by default and encodes only approved filters", () => {
    expect(
      adminRevenueQuery(
        { resortId: "", fromDate: "", toDate: "" },
        1,
        20,
      ).toString(),
    ).toBe("page=1&pageSize=20");
    expect(
      adminRevenueQuery(
        { resortId: " 9 ", fromDate: "2026-01-01", toDate: "" },
        2,
        10,
      ).get("resortId"),
    ).toBe("9");
  });
  it.each([
    { resortId: "2147483648", fromDate: "", toDate: "" },
    { resortId: "0", fromDate: "", toDate: "" },
    { resortId: "", fromDate: "2026-02-30", toDate: "" },
    { resortId: "", fromDate: "2026-10-02", toDate: "2026-10-01" },
    { resortId: "", fromDate: "2025-01-01", toDate: "2026-01-03" },
  ])("rejects invalid query before fetching %j", (input) =>
    expect(() => adminRevenueQuery(input, 1, 20)).toThrow(),
  );
  it.each([
    [0, 20],
    [2147483647, 100],
    [1, 101],
    [1, 0],
    [1.2, 20],
  ])("rejects invalid page %s/%s", (page, size) =>
    expect(() =>
      adminRevenueQuery({ resortId: "", fromDate: "", toDate: "" }, page, size),
    ).toThrow(),
  );
  it.each(["list", "upsert"] as const)(
    "uses configurable grants without requiring a technical merchant/admin role for %s",
    (action) => {
      expect(canUseAdminRevenue(actor, action)).toBe(true);
      expect(
        canUseAdminRevenue(
          {
            ...actor,
            permissionKeys: actor.permissionKeys.filter(
              (key) => key !== `revenue:system:${action}`,
            ),
          },
          action,
        ),
      ).toBe(false);
      expect(
        canUseAdminRevenue(
          {
            ...actor,
            permissionKeys: actor.permissionKeys.filter(
              (key) => key !== "management:portal:enter",
            ),
          },
          action,
        ),
      ).toBe(false);
    },
  );
  it("checks identity before and after the exact read, with no-store", async () => {
    const { api, request } = setup();
    const signal = new AbortController().signal;
    const query = adminRevenueQuery(
      { resortId: "", fromDate: "", toDate: "" },
      1,
      20,
    );
    await expect(readAdminRevenue(api, actor, query, signal)).resolves.toEqual(
      records,
    );
    expect(request.mock.calls.map((call) => call[0])).toEqual([
      "/auth/me",
      "/admin/revenue?page=1&pageSize=20",
      "/auth/me",
    ]);
    expect(
      request.mock.calls.every(
        (call) => (call[1] as { cache?: string })?.cache === "no-store",
      ),
    ).toBe(true);
  });
  it("never publishes read results across a detected account switch", async () => {
    const { api, request } = setup();
    request
      .mockResolvedValueOnce(actor)
      .mockResolvedValueOnce(records)
      .mockResolvedValueOnce({ ...actor, userId: 99 });
    await expect(
      readAdminRevenue(
        api,
        actor,
        new URLSearchParams({ page: "1", pageSize: "20" }),
        new AbortController().signal,
      ),
    ).rejects.toThrow("身份");
  });
});
describe("durable single revenue request recovery", () => {
  it("does not release an uncertain original attempt after a replay is definitively rejected", async () => {
    const { recovery, api, request } = setup();
    request.mockResolvedValueOnce(actor).mockRejectedValueOnce(fail(503));
    await expect(recovery.send(api, actor, body, () => key)).rejects.toThrow();
    request
      .mockResolvedValueOnce(actor)
      .mockRejectedValueOnce(fail(404))
      .mockResolvedValueOnce(actor);
    await recovery.review(api, actor);
    request
      .mockResolvedValueOnce(actor)
      .mockResolvedValueOnce(actor)
      .mockRejectedValueOnce(fail(404))
      .mockResolvedValueOnce(actor)
      .mockRejectedValueOnce(fail(403));
    await expect(recovery.send(api, actor)).rejects.toThrow();
    expect(recovery.snapshot()?.rejected).toBeUndefined();
    expect(recovery.snapshot()?.requestId).toBe(key);
    expect(() => recovery.acknowledge()).toThrow();
  });
  it("persists the UUID and DTO before the PUT and queries the saved result", async () => {
    const { recovery, store, api, request } = setup();
    const observe = vi.fn(() => {
      if (recovery.snapshot()) expect(store.setItem).toHaveBeenCalled();
    });
    recovery.subscribe(observe);
    await recovery.send(api, actor, body, () => key);
    expect(
      request.mock.calls.find((call) => call[0] === "/admin/revenue")?.[1],
    ).toMatchObject({
      method: "PUT",
      headers: { "Idempotency-Key": key },
      body,
    });
    expect(recovery.snapshot()?.result?.requestId).toBe(key);
    recovery.acknowledge();
    expect(recovery.snapshot()).toBeUndefined();
    expect(store.removeItem).toHaveBeenCalled();
  });
  it("survives response loss and reload, recovering only by the original key", async () => {
    const { recovery, store, api, request } = setup();
    request
      .mockResolvedValueOnce(actor)
      .mockRejectedValueOnce(new TypeError("network"));
    await expect(recovery.send(api, actor, body, () => key)).rejects.toThrow(
      "network",
    );
    const restored = new RevenueRecovery(actor.userId, store);
    expect(restored.snapshot()).toMatchObject({ requestId: key, body });
    expect(restored.snapshot()?.checked).toBeUndefined();
    await expect(restored.send(api, actor)).rejects.toThrow("核对");
    request.mockClear();
    await restored.review(api, actor);
    expect(restored.snapshot()?.result?.requestId).toBe(key);
    expect(request.mock.calls.some((call) => call[1]?.method === "PUT")).toBe(
      false,
    );
  });
  it("retains original body after 404 and explicitly retries with the same key and another pre-query", async () => {
    const { recovery, api, request } = setup();
    request.mockResolvedValueOnce(actor).mockRejectedValueOnce(fail(503));
    await expect(recovery.send(api, actor, body, () => key)).rejects.toThrow();
    request
      .mockResolvedValueOnce(actor)
      .mockRejectedValueOnce(fail(404))
      .mockResolvedValueOnce(actor);
    await recovery.review(api, actor);
    expect(recovery.snapshot()).toMatchObject({ checked: true, body });
    request.mockClear();
    request
      .mockResolvedValueOnce(actor)
      .mockResolvedValueOnce(actor)
      .mockRejectedValueOnce(fail(404))
      .mockResolvedValueOnce(actor);
    await recovery.send(api, actor, { ...body, revenueAmount: "99" });
    const writes = request.mock.calls.filter(
      (call) => call[1]?.method === "PUT",
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]?.[1]).toMatchObject({
      body,
      headers: { "Idempotency-Key": key },
    });
    expect(
      request.mock.calls.findIndex((call) => call[0].includes("/requests/")),
    ).toBeLessThan(
      request.mock.calls.findIndex((call) => call[1]?.method === "PUT"),
    );
  });
  it("does not replay if the last pre-query finds completion", async () => {
    const { recovery, api, request } = setup();
    request.mockResolvedValueOnce(actor).mockRejectedValueOnce(fail(503));
    await expect(recovery.send(api, actor, body, () => key)).rejects.toThrow();
    request
      .mockResolvedValueOnce(actor)
      .mockRejectedValueOnce(fail(404))
      .mockResolvedValueOnce(actor);
    await recovery.review(api, actor);
    request.mockClear();
    await recovery.send(api, actor);
    expect(request.mock.calls.some((call) => call[1]?.method === "PUT")).toBe(
      false,
    );
    expect(recovery.snapshot()?.result).toBeDefined();
  });
  it.each([408, 409, 500, 503])(
    "keeps an uncertain %s response locked and never generates a new key",
    async (status) => {
      const { recovery, api, request } = setup();
      const uuid = vi.fn(() => key);
      request.mockResolvedValueOnce(actor).mockRejectedValueOnce(fail(status));
      await expect(recovery.send(api, actor, body, uuid)).rejects.toThrow();
      await expect(recovery.send(api, actor, body, uuid)).rejects.toThrow(
        "核对",
      );
      expect(uuid).toHaveBeenCalledTimes(1);
      expect(recovery.snapshot()?.requestId).toBe(key);
      expect(() => recovery.acknowledge()).toThrow();
    },
  );
  it("does not clear a committed attempt when subsequent result authorization fails", async () => {
    const { recovery, api, request } = setup();
    request
      .mockResolvedValueOnce(actor)
      .mockResolvedValueOnce(record)
      .mockRejectedValueOnce(fail(403));
    await expect(recovery.send(api, actor, body, () => key)).rejects.toThrow();
    expect(recovery.snapshot()?.requestId).toBe(key);
    expect(recovery.snapshot()?.rejected).toBeUndefined();
    expect(() => recovery.acknowledge()).toThrow();
  });
  it.each([400, 401, 403, 422])(
    "keeps definitive %s rejection visible until manual acknowledgement",
    async (status) => {
      const { recovery, api, request } = setup();
      request.mockResolvedValueOnce(actor).mockRejectedValueOnce(fail(status));
      await expect(
        recovery.send(api, actor, body, () => key),
      ).rejects.toThrow();
      expect(recovery.snapshot()?.rejected).toBe(true);
      recovery.acknowledge();
      expect(recovery.snapshot()).toBeUndefined();
    },
  );
  it("blocks expired results permanently instead of releasing a new write", async () => {
    const { recovery, api, request } = setup();
    request
      .mockResolvedValueOnce(actor)
      .mockRejectedValueOnce(fail(409, "REVENUE_REQUEST_EXPIRED"));
    await expect(recovery.send(api, actor, body, () => key)).rejects.toThrow();
    request.mockResolvedValueOnce(actor).mockRejectedValueOnce(fail(410));
    await recovery.review(api, actor);
    expect(recovery.snapshot()?.blocked).toBe(true);
    expect(() => recovery.acknowledge()).toThrow();
    await expect(recovery.send(api, actor, body, () => key)).rejects.toThrow(
      "核对",
    );
  });
  it("blocks an unexpected response body", async () => {
    const { recovery, api, request } = setup();
    request
      .mockResolvedValueOnce(actor)
      .mockResolvedValueOnce({ ...record, resortId: 10 });
    await expect(recovery.send(api, actor, body, () => key)).rejects.toThrow(
      "响应",
    );
    expect(() => recovery.acknowledge()).toThrow();
  });
  it("blocks cross-account attempts before reading or writing", async () => {
    const { recovery, api, request } = setup();
    await expect(
      recovery.send(api, { ...actor, userId: 99 }, body, () => key),
    ).rejects.toThrow("权限");
    expect(request).not.toHaveBeenCalled();
  });
  it("isolates saved requests by actor and refuses corrupted local records", async () => {
    const { recovery, store, api, request } = setup();
    request.mockResolvedValueOnce(actor).mockRejectedValueOnce(fail(500));
    await expect(recovery.send(api, actor, body, () => key)).rejects.toThrow();
    expect(new RevenueRecovery(99, store).snapshot()).toBeUndefined();
    store.getItem.mockReturnValueOnce("{bad");
    const corrupted = new RevenueRecovery(actor.userId, store);
    request.mockClear();
    await expect(corrupted.send(api, actor, body, () => key)).rejects.toThrow(
      "存储",
    );
    expect(request).not.toHaveBeenCalled();
  });
  it("refuses to send if persistence fails", async () => {
    const { recovery, store, api, request } = setup();
    store.setItem.mockImplementationOnce(() => {
      throw new Error("quota");
    });
    await expect(recovery.send(api, actor, body, () => key)).rejects.toThrow(
      "quota",
    );
    expect(request).not.toHaveBeenCalled();
  });
  it("serializes immediate double-clicks and account-local remounts", async () => {
    const { recovery, api, request } = setup();
    const pending = deferred<typeof actor>();
    request.mockImplementationOnce(() => pending.promise);
    const first = recovery.send(api, actor, body, () => key);
    await expect(recovery.send(api, actor, body, () => key)).rejects.toThrow(
      "处理中",
    );
    await expect(recovery.review(api, actor)).rejects.toThrow("处理中");
    pending.resolve(actor);
    await first;
    expect(
      request.mock.calls.filter((call) => call[1]?.method === "PUT"),
    ).toHaveLength(1);
  });
});
