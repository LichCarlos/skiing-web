import { randomUUID } from "node:crypto";
import { readFile, writeFile, access } from "node:fs/promises";
import { join, isAbsolute } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { components } from "@common/api-contracts/openapi";
import { ApiError } from "@common/api-contracts/client";
import { apiRequest } from "@/platform/api";
import { getApiBaseUrl } from "@/platform/config";
import { login, logout, getCurrentUser } from "@/platform/auth/session";
import {
  RevenueRecovery,
  readAdminRevenue,
  adminRevenueQuery,
} from "@/features/revenue/admin-revenue-workflow";
import {
  RevenueImportRecovery,
  type RevenueImportAttempt,
  type RevenueImportStorage,
} from "@/features/revenue/admin-revenue-import-workflow";
type User = components["schemas"]["CurrentUserVO"];
type Job = components["schemas"]["RevenueImportJobVO"];
const api = new URL(getApiBaseUrl()),
  runtime = process.env.REVENUE_HTTP_RUNTIME,
  password = process.env.ADMIN_AUTH_HTTP_PASSWORD,
  resultPath = process.env.REVENUE_HTTP_RESULT_PATH;
const fixture = JSON.parse(process.env.REVENUE_HTTP_FIXTURE_JSON ?? "null") as {
  databaseName: string;
  adminAccount: string;
  writerRoleId: number;
  actors: Array<{
    userId: number;
    account: string;
    merchantId: number;
    resortId: number;
  }>;
};
if (
  api.protocol !== "http:" ||
  api.hostname !== "127.0.0.1" ||
  api.pathname !== "/api/v1" ||
  fixture?.databaseName !== "linji_revenue_recovery_validation" ||
  fixture.adminAccount !== "revenue_http_root" ||
  !runtime ||
  !isAbsolute(runtime) ||
  !password ||
  !resultPath
)
  throw new Error("Explicit disposable revenue HTTP environment required");
const jars = {
  admin: new Map<string, { value: string; path: string }>(),
  a: new Map<string, { value: string; path: string }>(),
  b: new Map<string, { value: string; path: string }>(),
};
let active: keyof typeof jars = "admin",
  admin: User,
  a: User,
  b: User,
  passed = 0;
const originalFetch = globalThis.fetch,
  requestIds: string[] = [],
  importIds: string[] = [],
  rejectedTraceIds: string[] = [];
const checks: Record<string, boolean> = {};
const signal = () => AbortSignal.timeout(20000);
const call = <T>(
  path: string,
  options: Parameters<typeof apiRequest>[1] = {},
) => apiRequest<T>(path, { ...options, cache: "no-store", signal: signal() });
const store = () => {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
};
function importStore(): RevenueImportStorage {
  let value: RevenueImportAttempt | undefined;
  return {
    get: async () => (value ? structuredClone(value) : undefined),
    create: async (v) => {
      if (value) throw new Error("Occupied");
      value = structuredClone(v);
    },
    set: async (v) => {
      if (value?.requestId !== v.requestId) throw new Error("Wrong key");
      value = structuredClone(v);
      return structuredClone(value);
    },
    remove: async (_actor, id) => {
      if (value?.requestId !== id) throw new Error("Wrong key");
      value = undefined;
    },
  };
}
async function denied(promise: Promise<unknown>, status: number) {
  try {
    await promise;
    throw new Error("Expected denial");
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    const error = e as ApiError;
    expect(error.status).toBe(status);
    expect(error.traceId).toBeTruthy();
    rejectedTraceIds.push(error.traceId!);
  }
}
async function recover() {
  const id = randomUUID();
  await writeFile(join(runtime!, "revenue-tick.request"), id);
  for (let i = 0; i < 200; i++) {
    try {
      await access(join(runtime!, `revenue-tick.${id}.done`));
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("Recovery control timed out");
}
async function writerPermission(enabled: boolean) {
  active = "admin";
  const snapshot = await call<{
    permissionIds: number[];
    dataScopes: unknown[];
    fieldPolicies: unknown[];
  }>(`/admin/roles/${fixture.writerRoleId}/permissions`);
  const tree = await call<
    Array<{ permissionId: number; permissionKey: string; children: unknown[] }>
  >("/admin/permissions/tree");
  const flat = (nodes: typeof tree): typeof tree =>
    nodes.flatMap((n) => [n, ...flat(n.children as typeof tree)]);
  const grant = flat(tree).find(
    (p) => p.permissionKey === "revenue:system:upsert",
  )!;
  expect(grant).toBeDefined();
  await call(`/admin/roles/${fixture.writerRoleId}/permissions`, {
    method: "PUT",
    body: {
      permissionIds: enabled
        ? [...new Set([...snapshot.permissionIds, grant.permissionId])]
        : snapshot.permissionIds.filter((id) => id !== grant.permissionId),
      dataScopes: snapshot.dataScopes,
      fieldPolicies: snapshot.fieldPolicies,
    },
  });
  active = "a";
}
function check(name: string, run: () => Promise<void>) {
  it(name, async () => {
    await run();
    checks[name] = true;
    passed++;
  });
}
beforeAll(async () => {
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== api.origin || !url.pathname.startsWith("/api/v1/"))
      throw new Error("Foreign API");
    const jar = jars[active],
      headers = new Headers(init.headers);
    headers.set("Origin", "http://127.0.0.1:3001");
    expect(init.credentials).toBe("include");
    const cookies = [...jar].filter(
      ([, c]) =>
        url.pathname === c.path ||
        url.pathname.startsWith(c.path.endsWith("/") ? c.path : c.path + "/"),
    );
    if (cookies.length)
      headers.set(
        "Cookie",
        cookies.map(([k, c]) => `${k}=${c.value}`).join("; "),
      );
    const response = await originalFetch(url, {
      ...init,
      headers,
      redirect: "error",
      signal: init.signal ?? signal(),
    });
    for (const raw of response.headers.getSetCookie()) {
      const [pair, ...attrs] = raw.split(";"),
        index = pair!.indexOf("="),
        name = pair!.slice(0, index),
        value = pair!.slice(index + 1),
        path =
          attrs
            .find((a) => a.trim().toLowerCase().startsWith("path="))
            ?.trim()
            .slice(5) ?? "/";
      if (!value || attrs.some((a) => /^\s*max-age=0\s*$/i.test(a)))
        jar.delete(name);
      else jar.set(name, { value, path });
    }
    return response;
  };
  admin = await login({ account: fixture.adminAccount, password: password! });
  active = "a";
  a = await login({ account: fixture.actors[0]!.account, password: password! });
  active = "b";
  b = await login({ account: fixture.actors[1]!.account, password: password! });
});
afterAll(async () => {
  try {
    for (const name of ["admin", "a", "b"] as const) {
      active = name;
      if (jars[name].has("linji_access") || jars[name].has("linji_refresh"))
        await logout();
      expect(jars[name].has("linji_access")).toBe(false);
      expect(jars[name].has("linji_refresh")).toBe(false);
    }
    await writeFile(
      resultPath!,
      JSON.stringify(
        {
          completed: passed === 10,
          requestIds,
          importIds,
          checks,
          rejectedTraceIds,
        },
        null,
        2,
      ),
      { flag: "wx" },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
const body = {
  resortId: fixture.actors[0]!.resortId,
  reportDate: "2026-11-01",
  revenueAmount: "1.23",
  note: "original",
};
let firstId = "",
  partial: RevenueImportRecovery,
  partialStorage: RevenueImportStorage,
  partialFile: File,
  batch: RevenueImportRecovery;
describe.sequential(
  "Revenue production recovery / compiled Nest / PostgreSQL",
  () => {
    check(
      "single write response loss retains original key and reload recovers committed result",
      async () => {
        active = "admin";
        const storage = store(),
          recovery = new RevenueRecovery(admin.userId, storage);
        firstId = randomUUID();
        requestIds.push(firstId);
        const dropped: typeof apiRequest = async <T>(
          path: string,
          options?: Parameters<typeof apiRequest>[1],
        ) => {
          const value = await apiRequest<T>(path, options);
          if (path === "/admin/revenue" && options?.method === "PUT")
            throw new TypeError("injected response loss after commit");
          return value;
        };
        await expect(
          recovery.send(dropped, admin, body, () => firstId),
        ).rejects.toThrow("response loss");
        expect(recovery.snapshot()?.requestId).toBe(firstId);
        expect(recovery.snapshot()?.result).toBeUndefined();
        const restored = new RevenueRecovery(admin.userId, storage);
        await restored.review(apiRequest, admin);
        expect(restored.snapshot()?.result?.result.revenueAmount).toBe("1.23");
        restored.acknowledge();
        expect(restored.snapshot()).toBeUndefined();
      },
    );
    check(
      "old key replay does not overwrite a later amount or add another write",
      async () => {
        active = "admin";
        const secondId = randomUUID();
        requestIds.push(secondId);
        const recovery = new RevenueRecovery(admin.userId, store());
        await recovery.send(
          apiRequest,
          admin,
          { ...body, revenueAmount: "2.34", note: "later" },
          () => secondId,
        );
        const replay = await call<{ revenueAmount: string }>("/admin/revenue", {
          method: "PUT",
          body,
          headers: { "Idempotency-Key": firstId },
        });
        expect(replay.revenueAmount).toBe("1.23");
        const page = await readAdminRevenue(
          apiRequest,
          admin,
          adminRevenueQuery(
            {
              resortId: String(body.resortId),
              fromDate: body.reportDate,
              toDate: body.reportDate,
            },
            1,
            20,
          ),
          signal(),
        );
        expect(page.items[0]?.revenueAmount).toBe("2.34");
        await denied(
          call("/admin/revenue", {
            method: "PUT",
            body: { ...body, revenueAmount: "9.99" },
            headers: { "Idempotency-Key": firstId },
          }),
          409,
        );
      },
    );
    check(
      "request receipts remain actor-owned even for another granted account",
      async () => {
        active = "a";
        expect(a.permissionKeys).toContain("revenue:system:upsert");
        await denied(call(`/admin/revenue/requests/${firstId}`), 404);
      },
    );
    check(
      "CSV response loss and identical file replay recover the same pending job",
      async () => {
        active = "a";
        partialStorage = importStore();
        partial = new RevenueImportRecovery(a.userId, partialStorage);
        await partial.restore();
        partialFile = new File(
          [
            `\ufeffresortId,reportDate,revenueAmount,note\n${body.resortId},2026-11-02,3.45,"中文,备注"\n${body.resortId},2026-11-02,9.99,duplicate\n2147483647,2026-11-02,8.88,missing\n${fixture.actors[1]!.resortId},2026-11-02,4.56,other`,
          ],
          "revenue.csv",
          { type: "text/csv" },
        );
        await partial.choose(partialFile, randomUUID);
        const id = partial.snapshot()!.requestId;
        const dropped: typeof apiRequest = async <T>(
          path: string,
          options?: Parameters<typeof apiRequest>[1],
        ) => {
          const value = await apiRequest<T>(path, options);
          if (path === "/admin/revenue/import")
            throw new TypeError("injected CSV response loss");
          return value;
        };
        await expect(partial.upload(dropped, a)).rejects.toThrow(
          "response loss",
        );
        expect(partial.snapshot()?.jobId).toBeUndefined();
        partial = new RevenueImportRecovery(a.userId, partialStorage);
        await partial.restore();
        const job = await partial.upload(apiRequest, a);
        importIds.push(job.jobId);
        expect(partial.snapshot()?.requestId).toBe(id);
        expect(job.status).toBe("pending");
        expect(job.failedRows).toBe(1);
        const form = new FormData();
        form.append("file", partialFile);
        expect(
          (
            await call<Job>("/admin/revenue/import", {
              method: "POST",
              headers: { "Idempotency-Key": id },
              body: form,
            })
          ).jobId,
        ).toBe(job.jobId);
        const changed = new FormData();
        changed.append(
          "file",
          new File(
            [
              "resortId,reportDate,revenueAmount,note\n1,2026-01-01,1.00,changed",
            ],
            "changed.csv",
            { type: "text/csv" },
          ),
        );
        await denied(
          call("/admin/revenue/import", {
            method: "POST",
            headers: { "Idempotency-Key": id },
            body: changed,
          }),
          409,
        );
      },
    );
    check(
      "real recovery processes partial success and replays terminal job without duplicating rows",
      async () => {
        await recover();
        active = "a";
        const job = await partial.query(apiRequest, a);
        expect(job).toMatchObject({
          status: "completed",
          totalRows: 4,
          processedRows: 4,
          succeededRows: 2,
          failedRows: 2,
        });
        expect(job.result?.results.map((r) => r.success)).toEqual([
          true,
          false,
          false,
          true,
        ]);
        expect(JSON.stringify(job)).not.toMatch(
          /中文|duplicate|missing|FileHash|LockToken/,
        );
        const form = new FormData();
        form.append("file", partialFile);
        const replay = await call<Job>("/admin/revenue/import", {
          method: "POST",
          headers: { "Idempotency-Key": partial.snapshot()!.requestId },
          body: form,
        });
        expect(replay).toEqual(job);
        await partial.clear();
        expect(partial.snapshot()).toBeUndefined();
      },
    );
    check(
      "import progress is actor-owned and merchant reads remain confined to own resorts",
      async () => {
        active = "b";
        await denied(call(`/admin/revenue/imports/${importIds[0]}`), 404);
        const page = await call<{
          items: Array<{ resortId: number; revenueAmount: string }>;
        }>(
          "/merchant/revenue?page=1&pageSize=20&fromDate=2026-11-02&toDate=2026-11-02",
        );
        expect(page.items.map((r) => r.resortId)).toEqual([
          fixture.actors[1]!.resortId,
        ]);
        expect(page.items[0]?.revenueAmount).toBe("4.56");
        expect(b.merchant?.merchantId).toBe(fixture.actors[1]!.merchantId);
      },
    );
    check(
      "revoking write grant after 25 committed CSV rows preserves them and refuses the remaining row",
      async () => {
        active = "a";
        batch = new RevenueImportRecovery(a.userId, importStore());
        await batch.restore();
        const rows = Array.from(
          { length: 26 },
          (_, i) =>
            `${body.resortId},2026-10-${String(i + 1).padStart(2, "0")},1.00,batch`,
        );
        await batch.choose(
          new File(
            ["resortId,reportDate,revenueAmount,note\n" + rows.join("\n")],
            "batch.csv",
            { type: "text/csv" },
          ),
          randomUUID,
        );
        const first = await batch.upload(apiRequest, a);
        importIds.push(first.jobId);
        await recover();
        const progress = await batch.query(apiRequest, a);
        expect(progress).toMatchObject({
          status: "pending",
          processedRows: 25,
          succeededRows: 25,
          failedRows: 0,
          result: null,
        });
        try {
          await writerPermission(false);
          await denied(call(`/admin/revenue/imports/${first.jobId}`), 403);
          await recover();
        } finally {
          await writerPermission(true);
          a = await getCurrentUser();
        }
        const final = await batch.query(apiRequest, a);
        expect(final).toMatchObject({
          status: "completed",
          totalRows: 26,
          processedRows: 26,
          succeededRows: 25,
          failedRows: 1,
        });
        expect(final.result?.results[25]).toMatchObject({
          rowNumber: 27,
          success: false,
          revenueId: null,
        });
        await batch.clear();
      },
    );
    check(
      "another recovery pass does not rerun committed rows or change final revenue",
      async () => {
        await recover();
        active = "admin";
        const page = await readAdminRevenue(
          apiRequest,
          admin,
          adminRevenueQuery({ resortId: "", fromDate: "", toDate: "" }, 1, 100),
          signal(),
        );
        expect(page.total).toBe(28);
        expect(page.items.filter((r) => r.source === "manual")).toHaveLength(1);
        expect(
          page.items.filter((r) => r.reportDate === "2026-10-26"),
        ).toHaveLength(0);
        await readFile(join(runtime!, "ready.json"), "utf8");
      },
    );
    check(
      "complete admin revenue projection, date/resort filters and later empty page",
      async () => {
        active = "admin";
        const read = (
          resortId: string,
          fromDate: string,
          toDate: string,
          page = 1,
        ) =>
          readAdminRevenue(
            apiRequest,
            admin,
            adminRevenueQuery({ resortId, fromDate, toDate }, page, 20),
            signal(),
          );
        const first = await read("", "", "");
        expect(first.total).toBe(28);
        expect(first.items).toHaveLength(20);
        expect(first.hasNext).toBe(true);
        const row = first.items[0]!;
        expect(Object.keys(row).sort()).toEqual(
          [
            "revenueId",
            "resortId",
            "resortName",
            "reportDate",
            "revenueAmount",
            "source",
            "note",
            "createdBy",
            "createdAt",
            "updatedAt",
          ].sort(),
        );
        expect(Object.keys(row.createdBy).sort()).toEqual(
          ["userId", "nickname"].sort(),
        );
        const exact = await read(
          String(body.resortId),
          body.reportDate,
          body.reportDate,
        );
        expect(exact.total).toBe(1);
        expect(exact.items[0]?.revenueAmount).toBe("2.34");
        expect(exact.items[0]?.note).toBe("later");
        const later = await read(
          String(body.resortId),
          body.reportDate,
          body.reportDate,
          2,
        );
        expect(later).toMatchObject({
          page: 2,
          pageSize: 20,
          total: 1,
          hasNext: false,
          items: [],
        });
        expect(
          (
            await read(
              String(fixture.actors[1]!.resortId),
              "2026-10-01",
              "2026-10-31",
            )
          ).total,
        ).toBe(0);
      },
    );
    check(
      "actual logout during admin revenue read rejects old content and explicit login restores it",
      async () => {
        active = "admin";
        let revoked = false;
        const request: typeof apiRequest = async <T>(
          path: string,
          options?: Parameters<typeof apiRequest>[1],
        ) => {
          const result = await apiRequest<T>(path, options);
          if (path.startsWith("/admin/revenue?") && !revoked) {
            revoked = true;
            await logout();
          }
          return result;
        };
        try {
          await denied(
            readAdminRevenue(
              request,
              admin,
              adminRevenueQuery(
                { resortId: "", fromDate: "", toDate: "" },
                1,
                20,
              ),
              signal(),
            ),
            401,
          );
          expect(revoked).toBe(true);
        } finally {
          admin = await login({
            account: fixture.adminAccount,
            password: password!,
          });
        }
        const restored = await readAdminRevenue(
          apiRequest,
          admin,
          adminRevenueQuery({ resortId: "", fromDate: "", toDate: "" }, 1, 100),
          signal(),
        );
        expect(restored.total).toBe(28);
      },
    );
  },
);
