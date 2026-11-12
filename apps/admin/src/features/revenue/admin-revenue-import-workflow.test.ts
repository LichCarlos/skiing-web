import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import type { components } from "@common/api-contracts/openapi";
import type { apiRequest } from "@/platform/api";
import { operator } from "@/features/revenue/merchant-revenue-fixtures.test-helper";
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
    "revenue:system:upsert",
    "revenue:system:list",
  ],
};
const key = "b0bb38a0-d895-4243-afc1-eb356c7dbde1";
const jobId = "927c2386-6461-4fd4-9cbe-a1a33096841f";
const job: components["schemas"]["RevenueImportJobVO"] = {
  jobId,
  status: "pending",
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  totalRows: 2,
  processedRows: 0,
  succeededRows: 0,
  failedRows: 0,
  result: null,
};
const bytes = "resortId,reportDate,revenueAmount,note\n9,2026-10-01,1.20,n";

function memoryStorage(): RevenueImportStorage & {
  value?: RevenueImportAttempt;
  create: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
} {
  const storage = {
    value: undefined as RevenueImportAttempt | undefined,
    get: vi.fn(async () =>
      storage.value ? structuredClone(storage.value) : undefined,
    ),
    create: vi.fn(async (value: RevenueImportAttempt) => {
      if (storage.value) throw new Error("本机已有待确认导入");
      storage.value = structuredClone(value);
    }),
    set: vi.fn(async (value: RevenueImportAttempt) => {
      if (storage.value?.requestId !== value.requestId)
        throw new Error("本机记录已变化");
      const current = storage.value;
      if (current.jobId && value.jobId && current.jobId !== value.jobId)
        throw new Error("本机任务编号已变化");
      const oldJob = current.job;
      const nextJob = value.job;
      const nextIsNewer =
        !oldJob ||
        Boolean(
          nextJob &&
          (nextJob.status === "completed" ||
            nextJob.status === "failed" ||
            nextJob.processedRows >= oldJob.processedRows),
        );
      const saved = structuredClone({
        ...current,
        jobId: current.jobId ?? value.jobId,
        job: nextIsNewer ? (value.job ?? current.job) : current.job,
        rejected: current.rejected || value.rejected || undefined,
        blocked: current.blocked || value.blocked || undefined,
      });
      storage.value = saved;
      return structuredClone(saved);
    }),
    remove: vi.fn(async (_actorId: number, requestId: string) => {
      if (storage.value?.requestId !== requestId)
        throw new Error("本机记录已变化");
      storage.value = undefined;
    }),
  };
  return storage;
}
function response(overrides: Partial<typeof job> = {}) {
  return { ...job, ...overrides };
}
function failure(status: number, code?: string) {
  return new ApiError("request failed", {
    status,
    code: status,
    traceId: "test",
    details: code ? [{ code, message: code }] : undefined,
  });
}
function setup() {
  const storage = memoryStorage();
  const recovery = new RevenueImportRecovery(actor.userId, storage);
  const request = vi.fn(async (path: string, _options?: { body?: unknown }) => {
    if (path === "/auth/me") return actor;
    return response();
  });
  return {
    storage,
    recovery,
    request,
    api: request as unknown as typeof apiRequest,
  };
}
async function choose(recovery: RevenueImportRecovery, uuid = key) {
  await recovery.restore();
  const file = new File([bytes], "revenue.csv", { type: "text/csv" });
  await recovery.choose(file, () => uuid);
}

beforeEach(() => vi.clearAllMocks());

describe("durable revenue CSV import recovery", () => {
  it("stores exact bytes and a UUID before the explicit upload", async () => {
    const { storage, recovery, request, api } = setup();
    await choose(recovery, key.toUpperCase());
    expect(storage.create).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled();

    request.mockImplementation(async (path, options?: { body?: unknown }) => {
      if (path === "/auth/me") return actor;
      const form = options?.body as FormData;
      const file = form.get("file") as File;
      expect(file.name).toBe("revenue.csv");
      expect(await file.text()).toBe(bytes);
      return response();
    });
    await recovery.upload(api, actor);
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      "/auth/me",
      "/admin/revenue/import",
      "/auth/me",
    ]);
    const post = request.mock.calls[1]!;
    expect(post[1]).toMatchObject({
      method: "POST",
      headers: { "Idempotency-Key": key },
      cache: "no-store",
    });
    expect(recovery.snapshot()).toMatchObject({ requestId: key, jobId, job });
    expect(storage.value?.jobId).toBe(jobId);
  });

  it("does not auto-replay after reload and requires an explicit same-key retry", async () => {
    const first = setup();
    await choose(first.recovery);
    first.request
      .mockResolvedValueOnce(actor)
      .mockRejectedValueOnce(new TypeError("network"));
    await expect(first.recovery.upload(first.api, actor)).rejects.toThrow(
      "network",
    );

    const restored = new RevenueImportRecovery(actor.userId, first.storage);
    const request = vi.fn(
      async (path: string, options?: { body?: unknown }) => {
        if (path === "/auth/me") return actor;
        const file = (options?.body as FormData).get("file") as File;
        expect(await file.text()).toBe(bytes);
        return response({ jobId });
      },
    );
    await restored.restore();
    expect(restored.snapshot()).toMatchObject({ requestId: key });
    expect(request).not.toHaveBeenCalled();
    await restored.upload(request as unknown as typeof apiRequest, actor);
    expect(
      request.mock.calls.filter(([path]) => path === "/admin/revenue/import"),
    ).toHaveLength(1);
    expect(request.mock.calls[1]?.[1]).toMatchObject({
      headers: { "Idempotency-Key": key },
    });
  });

  it("queries a known job only and stores the verified progress", async () => {
    const { recovery, request, api } = setup();
    await choose(recovery);
    await recovery.upload(api, actor);
    request.mockClear();
    request.mockImplementation(async (path: string) =>
      path === "/auth/me"
        ? actor
        : response({ processedRows: 1, succeededRows: 1 }),
    );
    const current = await recovery.query(api, actor);
    expect(current.processedRows).toBe(1);
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      "/auth/me",
      "/admin/revenue/imports/" + jobId,
      "/auth/me",
    ]);
    expect(recovery.snapshot()?.job?.processedRows).toBe(1);
  });

  it("retains the original attempt after an unavailable result and does not accept a different actor", async () => {
    const { recovery, request, api } = setup();
    await choose(recovery);
    await expect(
      recovery.upload(api, { ...actor, userId: actor.userId + 1 }),
    ).rejects.toThrow("权限");
    expect(request).not.toHaveBeenCalled();
    request.mockResolvedValueOnce(actor).mockRejectedValueOnce(failure(503));
    await expect(recovery.upload(api, actor)).rejects.toThrow();
    expect(recovery.snapshot()).toMatchObject({ requestId: key });
    expect(recovery.snapshot()?.jobId).toBeUndefined();
  });

  it("keeps the accepted task pointer when the post-upload identity check fails", async () => {
    const { recovery, request, api, storage } = setup();
    await choose(recovery);
    request
      .mockResolvedValueOnce(actor)
      .mockResolvedValueOnce(response())
      .mockRejectedValueOnce(failure(403));

    await expect(recovery.upload(api, actor)).rejects.toThrow();

    expect(storage.value).toMatchObject({ requestId: key, jobId, job });
    expect(recovery.snapshot()).toMatchObject({ requestId: key, jobId, job });
    expect(recovery.snapshot()?.rejected).toBeUndefined();
  });

  it("does not treat authorization errors as proof that upload was rejected", async () => {
    const { recovery, request, api, storage } = setup();
    await choose(recovery);
    request.mockResolvedValueOnce(actor).mockRejectedValueOnce(failure(403));

    await expect(recovery.upload(api, actor)).rejects.toThrow();

    expect(storage.value?.rejected).toBeUndefined();
    expect(storage.value?.requestId).toBe(key);
  });

  it("does not overwrite the known job when the query response names another job", async () => {
    const { recovery, request, api } = setup();
    await choose(recovery);
    await recovery.upload(api, actor);
    request.mockClear();
    request.mockImplementation(async (path: string) =>
      path === "/auth/me"
        ? actor
        : response({ jobId: "acdb9de4-5b2d-45fc-9b80-4357a9bca836" }),
    );
    await expect(recovery.query(api, actor)).rejects.toThrow("响应无效");
    expect(recovery.snapshot()?.jobId).toBe(jobId);
  });

  it("blocks a mismatched idempotency key, retains the file, and requires explicit clearing", async () => {
    const { recovery, request, api, storage } = setup();
    await choose(recovery);
    request
      .mockResolvedValueOnce(actor)
      .mockRejectedValueOnce(failure(409, "REVENUE_IMPORT_MISMATCH"));
    await expect(recovery.upload(api, actor)).rejects.toThrow();
    expect(recovery.snapshot()?.blocked).toBe(true);
    expect(storage.value?.file.size).toBeGreaterThan(0);
    await recovery.clear();
    expect(storage.value).toBeUndefined();
  });

  it("clears only a verified terminal result", async () => {
    const { recovery, storage, request, api } = setup();
    await choose(recovery);
    await expect(recovery.clear()).rejects.toThrow();
    await recovery.upload(api, actor);
    const done = response({
      status: "completed",
      processedRows: 2,
      succeededRows: 1,
      failedRows: 1,
      result: {
        totalRows: 2,
        succeededRows: 1,
        failedRows: 1,
        results: [
          { rowNumber: 2, success: true, revenueId: 1, error: null },
          {
            rowNumber: 3,
            success: false,
            revenueId: null,
            error: "雪场不存在或已停用",
          },
        ],
      },
    });
    request.mockImplementation(async (path: string) =>
      path === "/auth/me" ? actor : done,
    );
    await recovery.query(api, actor);
    await recovery.clear();
    expect(storage.remove).toHaveBeenCalledWith(actor.userId, key);
    expect(recovery.snapshot()).toBeUndefined();
  });

  it("rejects invalid CSV metadata or oversized files before storage or network access", async () => {
    const { recovery, storage } = setup();
    await recovery.restore();
    await expect(
      recovery.choose(new File(["bad"], "revenue.txt", { type: "text/csv" })),
    ).rejects.toThrow();
    await expect(
      recovery.choose(
        new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.csv", {
          type: "text/csv",
        }),
      ),
    ).rejects.toThrow("10 MiB");
    expect(storage.create).not.toHaveBeenCalled();
  });
});
