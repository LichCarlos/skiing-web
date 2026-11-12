import { ApiError } from "@common/api-contracts/client";
import type { components } from "@common/api-contracts/openapi";
import { apiRequest } from "@/platform/api";
import {
  revenueOperatorKey,
  type RevenueOperator,
} from "@/features/revenue/merchant-revenue-model";
import { buildRevenueInput } from "@/features/revenue/revenue-model";
import { parseCurrentUser } from "@/platform/auth/session-model";
import { parseRevenueRequest } from "@/features/revenue/admin-revenue-response";
import { parseAdminRevenuePage } from "@/features/revenue/admin-revenue-read-response";

type Body = components["schemas"]["UpsertRevenueDto"];
type Result = components["schemas"]["RevenueRequestVO"];
type RecordVO = components["schemas"]["RevenueRecordVO"];
type Request = typeof apiRequest;
type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
export type RevenueAttempt = {
  actorId: number;
  requestId: string;
  body: Body;
  result?: Result;
  checked?: boolean;
  blocked?: boolean;
  rejected?: boolean;
};

export function canUseAdminRevenue(value: unknown, action: "list" | "upsert") {
  try {
    const user = parseCurrentUser(value);
    return (
      Number.isInteger(user.userId) &&
      user.userId > 0 &&
      user.userId <= 2147483647 &&
      ["management:portal:enter", `revenue:system:${action}`].every((key) =>
        user.permissionKeys.includes(key),
      )
    );
  } catch {
    return false;
  }
}
export async function checkRevenueActor(
  request: Request,
  expected: RevenueOperator,
  action: "list" | "upsert",
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (!canUseAdminRevenue(expected, action))
    throw new Error("没有收益管理权限");
  const raw = await request<unknown>("/auth/me", {
    cache: "no-store",
    signal,
  });
  signal?.throwIfAborted();
  if (!canUseAdminRevenue(raw, action))
    throw new Error("身份或收益权限已变化，请重新读取身份");
  const current = parseCurrentUser(raw);
  if (
    !canUseAdminRevenue(current, action) ||
    revenueOperatorKey(current) !== revenueOperatorKey(expected)
  )
    throw new Error("身份或收益权限已变化，请重新读取身份");
}
export function adminRevenueQuery(
  filters: { resortId: string; fromDate: string; toDate: string },
  page: number,
  pageSize: number,
) {
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 2147483647 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100 ||
    (page - 1) * pageSize > 2147483647
  )
    throw new Error("页码无效");
  if (Object.values(filters).some((value) => typeof value !== "string"))
    throw new Error("收益筛选无效");
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  const id = filters.resortId.trim();
  if (id && (!/^[1-9]\d*$/.test(id) || Number(id) > 2147483647))
    throw new Error("雪场编号无效");
  if (id) query.set("resortId", id);
  for (const field of ["fromDate", "toDate"] as const) {
    const value = filters[field];
    if (!value) continue;
    const date = new Date(`${value}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    )
      throw new Error("日期无效");
    query.set(field, value);
  }
  if (filters.fromDate && filters.toDate) {
    const span = Date.parse(filters.toDate) - Date.parse(filters.fromDate);
    if (span < 0 || span > 366 * 86400000)
      throw new Error("日期区间须为1至367天");
  }
  return query;
}
export async function readAdminRevenue(
  request: Request,
  actor: RevenueOperator,
  query: URLSearchParams,
  signal: AbortSignal,
) {
  const frozenQuery = new URLSearchParams(query);
  if (
    [...frozenQuery.keys()].some(
      (key) =>
        !["page", "pageSize", "resortId", "fromDate", "toDate"].includes(key) ||
        frozenQuery.getAll(key).length !== 1,
    )
  )
    throw new Error("收益筛选无效");
  const canonical = adminRevenueQuery(
    {
      resortId: frozenQuery.get("resortId") ?? "",
      fromDate: frozenQuery.get("fromDate") ?? "",
      toDate: frozenQuery.get("toDate") ?? "",
    },
    Number(frozenQuery.get("page")),
    Number(frozenQuery.get("pageSize")),
  );
  await checkRevenueActor(request, actor, "list", signal);
  const result = await request<unknown>(`/admin/revenue?${canonical}`, {
    signal,
    cache: "no-store",
  });
  await checkRevenueActor(request, actor, "list", signal);
  return parseAdminRevenuePage(result, canonical);
}

// Store the original UUID and DTO before any write. Storage failure blocks sending.
// Account-isolated sessionStorage survives reloads; in-flight state also survives remounts.
export class RevenueRecovery {
  private entry?: RevenueAttempt;
  private storageError = false;
  busy = false;
  private listeners = new Set<() => void>();
  private readonly key: string;
  constructor(
    readonly actorId: number,
    private readonly storage: Storage,
  ) {
    this.key = `linji.revenue.request.v1.${actorId}`;
    try {
      const raw = storage.getItem(this.key);
      if (raw) {
        const value = JSON.parse(raw) as RevenueAttempt;
        if (
          value.actorId !== actorId ||
          !/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(
            value.requestId,
          )
        )
          throw new Error("Invalid recovery record");
        buildRevenueInput({ ...value.body, note: value.body.note ?? "" });
        // Always query again after reload; local result is not authoritative.
        this.entry = freezeAttempt({
          actorId,
          requestId: value.requestId,
          body: { ...value.body },
        });
      }
    } catch {
      this.storageError = true;
    }
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  snapshot = () => this.entry;
  private emit() {
    this.listeners.forEach((listener) => listener());
  }
  private save(entry: RevenueAttempt | undefined) {
    if (this.storageError)
      throw new Error(
        "无法读取原收益请求，已暂停写入；请恢复浏览器会话存储后刷新",
      );
    if (entry) this.storage.setItem(this.key, JSON.stringify(entry));
    else this.storage.removeItem(this.key);
    this.entry = entry ? freezeAttempt(structuredClone(entry)) : undefined;
    this.emit();
  }
  async send(
    request: Request,
    actor: RevenueOperator,
    body?: Body,
    uuid: () => string = () => crypto.randomUUID(),
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();
    if (this.busy) throw new Error("收益请求仍在处理中");
    if (actor.userId !== this.actorId || !canUseAdminRevenue(actor, "upsert"))
      throw new Error("没有收益写入权限");
    if (
      this.entry &&
      (!this.entry.checked ||
        this.entry.result ||
        this.entry.rejected ||
        this.entry.blocked)
    )
      throw new Error("请先核对原请求结果");
    this.busy = true;
    try {
      if (!this.entry) {
        if (!body) throw new Error("缺少收益输入");
        const normalized = buildRevenueInput({
          ...body,
          note: body.note ?? "",
        });
        this.save({
          actorId: this.actorId,
          requestId: uuid(),
          body: normalized,
        });
      }
      const attempt = structuredClone(this.entry!);
      await checkRevenueActor(request, actor, "upsert", signal);
      // Query before every explicit replay, including after a previous 404.
      if (attempt.checked) {
        await this.lookup(request, actor, signal);
        if (this.entry?.result || this.entry?.blocked) return;
      }
      this.save({ ...attempt, checked: false });
      signal?.throwIfAborted();
      let result: RecordVO;
      try {
        result = await request<RecordVO>("/admin/revenue", {
          method: "PUT",
          headers: { "Idempotency-Key": attempt.requestId },
          body: attempt.body,
          cache: "no-store",
          signal,
        });
      } catch (error) {
        if (
          !attempt.checked &&
          error instanceof ApiError &&
          [400, 401, 403, 404, 422].includes(error.status)
        )
          this.save({ ...attempt, rejected: true, checked: true });
        if (
          error instanceof ApiError &&
          error.details.some((item) =>
            ["REVENUE_REQUEST_EXPIRED", "REVENUE_REQUEST_MISMATCH"].includes(
              item.code,
            ),
          )
        )
          this.save({ ...attempt, blocked: true });
        throw error;
      }
      if (!matches(result, attempt.body))
        throw new Error("写入响应不匹配，请核对原请求");
      // Query the committed server record, not an inferred success.
      await this.lookup(request, actor, signal);
    } finally {
      this.busy = false;
      this.emit();
    }
  }
  async review(request: Request, actor: RevenueOperator, signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (this.busy) throw new Error("收益请求仍在处理中");
    this.busy = true;
    try {
      await this.lookup(request, actor, signal);
    } finally {
      this.busy = false;
      this.emit();
    }
  }
  private async lookup(
    request: Request,
    actor: RevenueOperator,
    signal?: AbortSignal,
  ) {
    if (!this.entry || actor.userId !== this.actorId)
      throw new Error("没有当前账号的原请求");
    const attempt = structuredClone(this.entry);
    await checkRevenueActor(request, actor, "upsert", signal);
    let result: Result;
    try {
      result = parseRevenueRequest(
        await request<unknown>(`/admin/revenue/requests/${attempt.requestId}`, {
          cache: "no-store",
          signal,
        }),
      );
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof ApiError && error.status === 410) {
        this.save({ ...attempt, blocked: true, checked: true });
        return;
      }
      if (error instanceof ApiError && error.status === 404) {
        await checkRevenueActor(request, actor, "upsert", signal);
        this.save({ ...attempt, checked: true, result: undefined });
        return;
      }
      throw error;
    }
    await checkRevenueActor(request, actor, "upsert", signal);
    if (
      result.requestId !== attempt.requestId ||
      result.status !== "completed" ||
      !matches(result.result, attempt.body)
    )
      throw new Error("请求核对响应不匹配");
    this.save({ ...attempt, result, checked: true });
  }
  acknowledge() {
    if (this.busy || !(this.entry?.result || this.entry?.rejected))
      throw new Error("须先读取已提交结果或明确拒绝再确认");
    this.save(undefined);
  }
}
function matches(
  result: Pick<RecordVO, "resortId" | "reportDate" | "revenueAmount">,
  body: Body,
) {
  const decimal = (v: string) => {
    const [integer, fraction = ""] = v.split(".");
    return `${BigInt(integer!)}.${fraction.padEnd(2, "0")}`;
  };
  return (
    result.resortId === body.resortId &&
    result.reportDate === body.reportDate &&
    /^\d{1,10}\.\d{2}$/.test(result.revenueAmount) &&
    decimal(result.revenueAmount) === decimal(body.revenueAmount)
  );
}
const recoveries = new Map<number, RevenueRecovery>();
function freezeAttempt(entry: RevenueAttempt) {
  Object.freeze(entry.body);
  if (entry.result) {
    Object.freeze(entry.result.result);
    Object.freeze(entry.result);
  }
  return Object.freeze(entry);
}
export function browserRevenueRecovery(actorId: number) {
  let recovery = recoveries.get(actorId);
  if (!recovery) {
    recovery = new RevenueRecovery(actorId, window.sessionStorage);
    recoveries.set(actorId, recovery);
  }
  return recovery;
}
