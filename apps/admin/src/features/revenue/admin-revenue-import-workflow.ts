import { ApiError } from "@common/api-contracts/client";
import type { components } from "@common/api-contracts/openapi";
import { apiRequest } from "@/platform/api";
import {
  canUseAdminRevenue,
  checkRevenueActor,
} from "@/features/revenue/admin-revenue-workflow";
import type { RevenueOperator } from "@/features/revenue/merchant-revenue-model";
import { parseRevenueImportJob } from "@/features/revenue/admin-revenue-response";

type Job = components["schemas"]["RevenueImportJobVO"];
type Request = typeof apiRequest;

export type RevenueImportAttempt = {
  actorId: number;
  requestId: string;
  fileName: string;
  mimeType: string;
  file: Blob;
  jobId?: string;
  job?: Job;
  rejected?: boolean;
  blocked?: boolean;
};

export interface RevenueImportStorage {
  get(actorId: number): Promise<RevenueImportAttempt | undefined>;
  create(value: RevenueImportAttempt): Promise<void>;
  set(value: RevenueImportAttempt): Promise<RevenueImportAttempt>;
  remove(actorId: number, requestId: string): Promise<void>;
}

const UUID =
  /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const MIME_TYPES = new Set([
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
]);
const MAX_BYTES = 10 * 1024 * 1024;

export class RevenueImportRecovery {
  private entry?: RevenueImportAttempt;
  private error?: Error;
  private listeners = new Set<() => void>();
  busy = false;
  ready = false;

  constructor(
    readonly actorId: number,
    private readonly storage: RevenueImportStorage,
  ) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.entry;
  errorSnapshot = () => this.error;
  private emit() {
    this.listeners.forEach((listener) => listener());
  }
  private async save(value: RevenueImportAttempt) {
    this.entry = await this.storage.set(value);
    this.emit();
  }

  async restore() {
    if (this.ready) return;
    try {
      const value = await this.storage.get(this.actorId);
      if (value) validateStored(value, this.actorId);
      this.entry = value;
    } catch (cause) {
      this.error =
        cause instanceof Error ? cause : new Error("收益导入存储不可用");
    } finally {
      this.ready = true;
      this.emit();
    }
  }

  async choose(
    file: Blob & { name?: string; type?: string },
    uuid = () => crypto.randomUUID(),
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();
    if (this.busy) throw new Error("收益导入仍在处理中");
    if (!this.ready) throw new Error("正在读取本机收益导入记录");
    if (this.error) throw new Error("本机收益导入记录不可用，请恢复存储后刷新");
    if (this.entry) throw new Error("请先结束当前收益导入");
    const name = file.name ?? "revenue.csv";
    const type = file.type === "" ? "text/csv" : (file.type ?? "");
    if (!name.toLowerCase().endsWith(".csv") || !MIME_TYPES.has(type))
      throw new Error("请上传 UTF-8 CSV 文件");
    if (file.size > MAX_BYTES) throw new Error("CSV 文件不能超过 10 MiB");
    const requestId = uuid();
    if (!UUID.test(requestId)) throw new Error("无法生成有效的幂等键");
    this.busy = true;
    try {
      const fileBytes = await file.arrayBuffer();
      signal?.throwIfAborted();
      const attempt: RevenueImportAttempt = {
        actorId: this.actorId,
        requestId: requestId.toLowerCase(),
        fileName: name,
        mimeType: type,
        file: new Blob([fileBytes], { type }),
      };
      await this.storage.create(attempt);
      this.entry = attempt;
      this.emit();
      signal?.throwIfAborted();
    } finally {
      this.busy = false;
      this.emit();
    }
  }

  async upload(request: Request, actor: RevenueOperator, signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (this.busy) throw new Error("收益导入仍在处理中");
    const attempt = this.entry;
    if (!attempt) throw new Error("请先选择 CSV 文件");
    if (
      attempt.actorId !== actor.userId ||
      !canUseAdminRevenue(actor, "upsert")
    )
      throw new Error("没有收益导入权限");
    if (attempt.jobId) throw new Error("该文件已有任务，请查询任务进度");
    if (attempt.rejected || attempt.blocked)
      throw new Error("原导入请求已被锁定，请先确认结果或清理记录");
    this.busy = true;
    try {
      await checkRevenueActor(request, actor, "upsert", signal);
      const form = new FormData();
      form.append("file", attempt.file, attempt.fileName);
      let job: Job;
      try {
        job = await request<Job>("/admin/revenue/import", {
          method: "POST",
          headers: { "Idempotency-Key": attempt.requestId },
          body: form,
          cache: "no-store",
          signal,
        });
      } catch (cause) {
        if (cause instanceof ApiError) {
          const blocked =
            cause.status === 410 ||
            cause.details.some((detail) =>
              ["REVENUE_IMPORT_EXPIRED", "REVENUE_IMPORT_MISMATCH"].includes(
                detail.code,
              ),
            );
          const rejected = [400, 413, 422].includes(cause.status);
          if (blocked || rejected)
            await this.save({
              ...attempt,
              blocked: blocked || undefined,
              rejected: rejected || undefined,
            });
        }
        throw cause;
      }
      job = parseRevenueImportJob(job);
      await this.save({ ...attempt, jobId: job.jobId, job });
      await checkRevenueActor(request, actor, "upsert", signal);
      return job;
    } finally {
      this.busy = false;
      this.emit();
    }
  }

  async query(request: Request, actor: RevenueOperator, signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (this.busy) throw new Error("收益导入仍在处理中");
    const attempt = this.entry;
    if (!attempt?.jobId) throw new Error("尚未提交任务，需手动提交原文件");
    if (
      attempt.actorId !== actor.userId ||
      !canUseAdminRevenue(actor, "upsert")
    )
      throw new Error("没有收益导入权限");
    this.busy = true;
    try {
      await checkRevenueActor(request, actor, "upsert", signal);
      let job: Job;
      try {
        job = await request<Job>(`/admin/revenue/imports/${attempt.jobId}`, {
          cache: "no-store",
          signal,
        });
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 410)
          await this.save({ ...attempt, blocked: true });
        throw cause;
      }
      job = parseRevenueImportJob(job, attempt.jobId);
      await this.save({ ...attempt, job });
      await checkRevenueActor(request, actor, "upsert", signal);
      return job;
    } finally {
      this.busy = false;
      this.emit();
    }
  }

  async clear() {
    if (this.busy) throw new Error("收益导入仍在处理中");
    if (
      !this.entry ||
      (!this.entry.job?.result && !this.entry.rejected && !this.entry.blocked)
    )
      throw new Error("请先查询终态或明确拒绝结果");
    await this.storage.remove(this.actorId, this.entry.requestId);
    this.entry = undefined;
    this.emit();
  }
}

function validateStored(value: RevenueImportAttempt, actorId: number) {
  if (
    value.actorId !== actorId ||
    !UUID.test(value.requestId) ||
    !(value.file instanceof Blob) ||
    value.file.size > MAX_BYTES ||
    !value.fileName.toLowerCase().endsWith(".csv")
  )
    throw new Error("收益导入恢复记录无效");
  if (value.jobId && !UUID.test(value.jobId))
    throw new Error("收益导入任务编号无效");
  if (value.job) value.job = parseRevenueImportJob(value.job, value.jobId);
}

class IndexedDbRevenueImportStorage implements RevenueImportStorage {
  private database?: Promise<IDBDatabase>;
  private open() {
    return (this.database ??= new Promise((resolve, reject) => {
      const request = indexedDB.open("linji-admin-revenue-v1", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("imports", { keyPath: "actorId" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error("IndexedDB 打开失败"));
    }));
  }
  async get(actorId: number) {
    return this.transaction<RevenueImportAttempt | undefined>(
      "readonly",
      (store) => store.get(actorId),
    );
  }
  async create(value: RevenueImportAttempt) {
    await this.transaction("readwrite", (store) => store.add(value));
  }
  async set(value: RevenueImportAttempt) {
    const db = await this.open();
    return new Promise<RevenueImportAttempt>((resolve, reject) => {
      const tx = db.transaction("imports", "readwrite");
      const store = tx.objectStore("imports");
      const lookup = store.get(value.actorId);
      let saved: RevenueImportAttempt;
      lookup.onsuccess = () => {
        const current = lookup.result as RevenueImportAttempt | undefined;
        if (!current || current.requestId !== value.requestId) {
          reject(new Error("本机收益导入记录已变化，请重新读取"));
          tx.abort();
          return;
        }
        saved = mergeAttempt(current, value);
        store.put(saved);
      };
      tx.oncomplete = () => resolve(saved!);
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB 事务失败"));
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB 写入已取消"));
    });
  }
  async remove(actorId: number, requestId: string) {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("imports", "readwrite");
      const store = tx.objectStore("imports");
      const lookup = store.get(actorId);
      lookup.onsuccess = () => {
        const current = lookup.result as RevenueImportAttempt | undefined;
        if (!current || current.requestId !== requestId) {
          reject(new Error("本机收益导入记录已变化，请重新读取"));
          tx.abort();
          return;
        }
        store.delete(actorId);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB 事务失败"));
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB 删除已取消"));
    });
  }
  private async transaction<T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest,
  ) {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction("imports", mode);
      const request = action(tx.objectStore("imports"));
      let result: T;
      request.onsuccess = () => {
        result = request.result as T;
      };
      request.onerror = () =>
        reject(request.error ?? new Error("IndexedDB 读写失败"));
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB 事务失败"));
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB 事务已取消"));
      tx.oncomplete = () => resolve(result!);
    });
  }
}

function mergeAttempt(
  current: RevenueImportAttempt,
  next: RevenueImportAttempt,
): RevenueImportAttempt {
  if (current.jobId && next.jobId && current.jobId !== next.jobId)
    throw new Error("本机收益导入任务编号已变化，请重新读取");
  const currentJob = current.job;
  const nextJob = next.job;
  const job = !currentJob
    ? nextJob
    : !nextJob || isNewerJob(currentJob, nextJob)
      ? currentJob
      : nextJob;
  return {
    ...current,
    jobId: current.jobId ?? next.jobId,
    job,
    rejected: current.rejected || next.rejected || undefined,
    blocked: current.blocked || next.blocked || undefined,
  };
}

function isNewerJob(current: Job, next: Job): boolean {
  const rank = (status: Job["status"]) =>
    status === "pending" ? 0 : status === "processing" ? 1 : 2;
  if (rank(current.status) !== rank(next.status))
    return rank(current.status) > rank(next.status);
  if (current.status === "completed" || current.status === "failed")
    return true;
  if (current.processedRows !== next.processedRows)
    return current.processedRows > next.processedRows;
  return current.updatedAt >= next.updatedAt;
}

const recoveries = new Map<number, RevenueImportRecovery>();
export function browserRevenueImportRecovery(actorId: number) {
  let recovery = recoveries.get(actorId);
  if (!recovery) {
    if (typeof indexedDB === "undefined")
      throw new Error("当前浏览器不支持 IndexedDB");
    recovery = new RevenueImportRecovery(
      actorId,
      new IndexedDbRevenueImportStorage(),
    );
    recoveries.set(actorId, recovery);
  }
  return recovery;
}
