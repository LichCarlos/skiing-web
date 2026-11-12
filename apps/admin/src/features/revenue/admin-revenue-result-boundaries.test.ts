import { describe, expect, it, vi } from "vitest";
import type { apiRequest } from "@/platform/api";
import { operator } from "@/features/revenue/merchant-revenue-fixtures.test-helper";
import {
  RevenueImportRecovery,
  type RevenueImportAttempt,
  type RevenueImportStorage,
} from "@/features/revenue/admin-revenue-import-workflow";
import {
  RevenueRecovery,
  canUseAdminRevenue,
  checkRevenueActor,
} from "@/features/revenue/admin-revenue-workflow";
const actor = {
  ...operator,
  merchant: null,
  permissionKeys: ["management:portal:enter", "revenue:system:upsert"],
};
const key = "b0bb38a0-d895-4243-afc1-eb356c7dbde1",
  jobId = "927c2386-6461-4fd4-9cbe-a1a33096841f";
const job = {
  jobId,
  status: "pending",
  createdAt: "2026-11-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
  totalRows: 1,
  processedRows: 0,
  succeededRows: 0,
  failedRows: 0,
  result: null,
};
const terminal = {
  ...job,
  status: "completed",
  processedRows: 1,
  succeededRows: 1,
  result: {
    totalRows: 1,
    succeededRows: 1,
    failedRows: 0,
    results: [{ rowNumber: 2, success: true, revenueId: 5, error: null }],
  },
};
function store(): RevenueImportStorage {
  let value: RevenueImportAttempt | undefined;
  return {
    get: async () => value,
    create: async (v) => {
      value = structuredClone(v);
    },
    set: async (v) => {
      value = structuredClone(v);
      return value;
    },
    remove: async () => {
      value = undefined;
    },
  };
}
async function setup(value: unknown) {
  const recovery = new RevenueImportRecovery(actor.userId, store());
  await recovery.restore();
  await recovery.choose(
    new File(["csv"], "revenue.csv", { type: "text/csv" }),
    () => key,
  );
  const request = vi.fn(async (path: string) =>
    path === "/auth/me" ? actor : value,
  );
  return { recovery, request: request as unknown as typeof apiRequest };
}
describe("CSV recovery result boundary", () => {
  it.each([
    { ...job, status: "unknown" },
    { ...job, createdAt: "invalid" },
    { ...job, updatedAt: null },
    { ...job, failedRows: -1, succeededRows: 1 },
    { ...job, totalRows: 5001 },
    { ...job, result: terminal.result },
    { ...terminal, result: null },
    { ...terminal, result: { ...terminal.result, totalRows: 2 } },
    { ...terminal, result: { ...terminal.result, results: [] } },
    {
      ...terminal,
      result: {
        ...terminal.result,
        results: [{ rowNumber: 2, success: "yes", revenueId: 5, error: null }],
      },
    },
    {
      ...terminal,
      result: {
        ...terminal.result,
        results: [
          { rowNumber: 2, success: true, revenueId: null, error: null },
        ],
      },
    },
    {
      ...terminal,
      result: {
        ...terminal.result,
        results: [
          { rowNumber: 2, success: true, revenueId: 5, error: "contradictory" },
        ],
      },
    },
    {
      ...terminal,
      totalRows: 2,
      processedRows: 2,
      succeededRows: 2,
      result: {
        totalRows: 2,
        succeededRows: 2,
        failedRows: 0,
        results: [terminal.result.results[0], terminal.result.results[0]],
      },
    },
  ])(
    "rejects malformed progress or terminal rows and retains original bytes/key",
    async (value) => {
      const { recovery, request } = await setup(value);
      await expect(recovery.upload(request, actor)).rejects.toThrow();
      expect(recovery.snapshot()?.requestId).toBe(key);
      expect(recovery.snapshot()?.jobId).toBeUndefined();
      await expect(recovery.clear()).rejects.toThrow();
      expect(await recovery.snapshot()!.file.text()).toBe("csv");
    },
  );
  it("projects terminal rows before persisting or publishing", async () => {
    const { recovery, request } = await setup({
      ...terminal,
      secret: "private",
      result: {
        ...terminal.result,
        secret: "private",
        results: [{ ...terminal.result.results[0], rawInput: "private" }],
      },
    });
    const result = await recovery.upload(request, actor);
    expect(JSON.stringify(result)).not.toContain("private");
    expect(result).toEqual(terminal);
    expect(recovery.snapshot()?.job).toEqual(terminal);
  });
  it.each([null, {}, { ...actor, permissionKeys: null }])(
    "rejects malformed local identities without a request",
    async (value) => {
      const request = vi.fn();
      expect(canUseAdminRevenue(value as typeof actor, "upsert")).toBe(false);
      await expect(
        checkRevenueActor(
          request as typeof apiRequest,
          value as typeof actor,
          "upsert",
        ),
      ).rejects.toThrow();
      expect(request).not.toHaveBeenCalled();
    },
  );
});
describe("committed single write receipt projection", () => {
  it("does not retain note or unexpected stored response fields", async () => {
    const storage = {
      getItem: (): string | null => null,
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const recovery = new RevenueRecovery(actor.userId, storage),
      body = {
        resortId: 9,
        reportDate: "2026-11-01",
        revenueAmount: "1.20",
        note: "original",
      };
    const result = {
      revenueId: 5,
      resortId: 9,
      reportDate: body.reportDate,
      revenueAmount: "1.20",
      source: "manual",
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
    const request = vi.fn(async (path: string) =>
      path === "/auth/me"
        ? actor
        : {
            requestId: key,
            status: "completed",
            createdAt: job.createdAt,
            completedAt: job.updatedAt,
            result: { ...result, note: "private" },
            secret: "private",
          },
    );
    storage.getItem = () =>
      JSON.stringify({ actorId: actor.userId, requestId: key, body });
    const restored = new RevenueRecovery(actor.userId, storage);
    await restored.review(request as unknown as typeof apiRequest, actor);
    expect(JSON.stringify(restored.snapshot()?.result)).not.toContain(
      "private",
    );
    expect(recovery.snapshot()).toBeUndefined();
  });
});
