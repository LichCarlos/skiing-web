import { ApiError } from "@common/api-contracts/client";
import {
  verifyKnowledgeOperator,
  knowledgeError,
  type KnowledgeMutation,
  type KnowledgeOperator,
} from "@/features/project-knowledge/knowledge-model";

export class KnowledgeRecoveryLedger {
  private records = new Map<
    symbol,
    {
      userId: number;
      mutation: KnowledgeMutation;
      inFlight: boolean;
    }
  >();
  private listeners = new Set<() => void>();
  version = 0;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private changed() {
    this.version++;
    this.listeners.forEach((listener) => listener());
  }
  entries(userId: number) {
    return [...this.records.values()]
      .filter((record) => record.userId === userId)
      .map((record) => ({ ...record, mutation: { ...record.mutation } }));
  }
  begin(userId: number, mutation: KnowledgeMutation) {
    const token = Symbol();
    this.records.set(token, {
      userId,
      mutation: { ...mutation },
      inFlight: true,
    });
    this.changed();
    let settled = false;
    return (definitive: boolean) => {
      if (settled) return;
      settled = true;
      if (definitive) this.records.delete(token);
      else {
        const record = this.records.get(token);
        if (record) record.inFlight = false;
      }
      this.changed();
    };
  }
  acknowledge(userId: number, expectedVersion: number) {
    const entries = this.entries(userId);
    if (
      this.version !== expectedVersion ||
      entries.some((item) => item.inFlight)
    )
      return false;
    for (const [key, record] of this.records)
      if (record.userId === userId) this.records.delete(key);
    this.changed();
    return true;
  }
}

export class KnowledgeWriteGate {
  private controller = new AbortController();
  private active = false;
  private busy = false;
  constructor(
    private user: KnowledgeOperator,
    private verify: (signal: AbortSignal) => Promise<KnowledgeOperator>,
    private ledger: KnowledgeRecoveryLedger,
    private onBusy: (busy: boolean) => void,
  ) {}
  activate() {
    this.active = true;
    if (this.controller.signal.aborted) {
      this.controller = new AbortController();
      this.busy = false;
    }
  }
  dispose() {
    this.active = false;
    this.controller.abort();
    this.busy = false;
  }
  isActive() {
    return this.active && !this.controller.signal.aborted;
  }
  isLocked() {
    return this.busy || this.ledger.entries(this.user.userId).length > 0;
  }
  async run<T, R>(
    mutation: KnowledgeMutation,
    prepare: (signal: AbortSignal) => Promise<T>,
    write: (body: T, signal: AbortSignal) => Promise<R>,
    committed: (result: R) => void,
  ) {
    if (!this.isActive() || this.isLocked())
      return { status: "ignored" as const };
    this.busy = true;
    this.onBusy(true);
    const controller = this.controller;
    const current = () =>
      this.active &&
      this.controller === controller &&
      !controller.signal.aborted;
    let settle: ((definitive: boolean) => void) | undefined;
    try {
      verifyKnowledgeOperator(this.user, this.user, mutation.action);
      const body = await prepare(controller.signal);
      if (!current()) return { status: "ignored" as const };
      const operator = await this.verify(controller.signal);
      if (!current()) return { status: "ignored" as const };
      verifyKnowledgeOperator(operator, this.user, mutation.action);
      if (this.ledger.entries(this.user.userId).length)
        return { status: "ignored" as const };
      settle = this.ledger.begin(this.user.userId, mutation);
      const result = await write(body, controller.signal);
      settle(true);
      settle = undefined;
      if (!current()) return { status: "ignored" as const };
      committed(result);
      return { status: "success" as const };
    } catch (cause) {
      const definitive =
        cause instanceof ApiError &&
        cause.status >= 400 &&
        cause.status < 500 &&
        cause.status !== 408;
      settle?.(definitive);
      if (!current()) return { status: "ignored" as const };
      const uncertain = Boolean(settle) && !definitive;
      return {
        status: "error" as const,
        uncertain,
        message: uncertain
          ? `操作结果未确认，请读取并核对后继续${cause instanceof ApiError && cause.traceId ? `（traceId: ${cause.traceId}）` : ""}`
          : knowledgeError(cause),
      };
    } finally {
      if (this.controller === controller) {
        this.busy = false;
        if (current()) this.onBusy(false);
      }
    }
  }
}

let browserLedger: KnowledgeRecoveryLedger | undefined;
export function knowledgeRecoveryLedger() {
  return typeof window === "undefined"
    ? new KnowledgeRecoveryLedger()
    : (browserLedger ??= new KnowledgeRecoveryLedger());
}
