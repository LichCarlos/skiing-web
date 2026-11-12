import { ApiError } from "@common/api-contracts/client";
import {
  verifyEventOperator,
  eventLocator,
  EventConflictError,
  type EventMutation,
  type EventOperator,
} from "@/features/events/event-model";
import { eventMessage } from "@/features/events/event-api";

export class EventRecoveryLedger {
  private records = new Map<
    symbol,
    {
      userId: number;
      mutation: EventMutation;
      inFlight: boolean;
    }
  >();
  private listeners = new Set<() => void>();
  private readProofs = new Map<number, number>();
  version = 0;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private changed() {
    this.version++;
    this.readProofs.clear();
    this.listeners.forEach((listener) => listener());
  }
  entries(userId: number) {
    return [...this.records.values()]
      .filter((record) => record.userId === userId)
      .map((record) => ({
        ...record,
        mutation: { ...record.mutation, target: { ...record.mutation.target } },
      }));
  }
  begin(userId: number, mutation: EventMutation) {
    if (this.entries(userId).length) throw new Error("Recovery is required");
    const token = Symbol();
    this.records.set(token, {
      userId,
      mutation: {
        target: eventLocator(mutation.target),
        attempts: mutation.attempts,
        maxAttempts: mutation.maxAttempts,
      },
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
  confirmRead(userId: number, expectedVersion: number) {
    const entries = this.entries(userId);
    if (
      !entries.length ||
      this.version !== expectedVersion ||
      entries.some((item) => item.inFlight)
    )
      return false;
    this.readProofs.set(userId, expectedVersion);
    return true;
  }
  acknowledge(userId: number, expectedVersion: number) {
    const entries = this.entries(userId);
    if (
      this.version !== expectedVersion ||
      this.readProofs.get(userId) !== expectedVersion ||
      entries.some((item) => item.inFlight)
    )
      return false;
    for (const [key, record] of this.records)
      if (record.userId === userId) this.records.delete(key);
    this.changed();
    return true;
  }
}

export class EventWriteGate {
  private controller = new AbortController();
  private active = false;
  private busy = false;
  constructor(
    private user: EventOperator,
    private verify: (signal: AbortSignal) => Promise<EventOperator>,
    private ledger: EventRecoveryLedger,
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
  }
  isActive() {
    return this.active && !this.controller.signal.aborted;
  }
  isLocked() {
    return this.busy || this.ledger.entries(this.user.userId).length > 0;
  }
  isBusy() {
    return this.busy;
  }
  async run<T, R>(
    mutation: EventMutation,
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
    let writeReturned = false;
    try {
      const body = await prepare(controller.signal);
      if (!current()) return { status: "ignored" as const };
      const operator = await this.verify(controller.signal);
      if (!current()) return { status: "ignored" as const };
      verifyEventOperator(operator, this.user, true);
      settle = this.ledger.begin(this.user.userId, mutation);
      const result = await write(body, controller.signal);
      writeReturned = true;
      if (!current()) {
        settle(false);
        return { status: "ignored" as const };
      }
      const after = await this.verify(controller.signal);
      if (!current()) {
        settle(false);
        return { status: "ignored" as const };
      }
      verifyEventOperator(after, this.user, true);
      settle(true);
      settle = undefined;
      if (!current()) return { status: "ignored" as const };
      committed(result);
      return { status: "success" as const };
    } catch (cause) {
      const definitive =
        !writeReturned &&
        cause instanceof ApiError &&
        cause.status >= 400 &&
        cause.status < 500 &&
        cause.status !== 408;
      settle?.(definitive && current());
      if (!current()) return { status: "ignored" as const };
      const uncertain = Boolean(settle) && !definitive;
      return {
        status: "error" as const,
        uncertain,
        conflict:
          cause instanceof EventConflictError ||
          (cause instanceof ApiError && cause.status === 409),
        message: uncertain
          ? `重试结果未确认，请读取并核对后继续${cause instanceof ApiError && cause.traceId ? `（traceId: ${cause.traceId}）` : ""}`
          : eventMessage(cause),
      };
    } finally {
      if (this.controller === controller) {
        this.busy = false;
        if (current()) this.onBusy(false);
      }
    }
  }
}

let browserLedger: EventRecoveryLedger | undefined;
export function eventRecoveryLedger() {
  return typeof window === "undefined"
    ? new EventRecoveryLedger()
    : (browserLedger ??= new EventRecoveryLedger());
}
