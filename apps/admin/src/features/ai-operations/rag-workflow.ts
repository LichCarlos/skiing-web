import {
  auditReason,
  operationError,
  type Operator,
  type RagSource,
} from "@/features/ai-operations/api";
import {
  writeRagCommand,
  type RagRequest,
} from "@/features/ai-operations/rag-queries";
import type { RagAction, RagCommand } from "@/features/ai-operations/rag-model";
type RecoveryRecord = {
  token: symbol;
  userId: number;
  id: number;
  expectedVersion: number;
  action: RagAction;
  inFlight: boolean;
};
/** Metadata only. Does not store reasons, content, credentials or provider data. */
export class RagRecoveryLedger {
  private records = new Map<string, RecoveryRecord>();
  private readProofs = new Map<string, { token: symbol; version: number }>();
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
  entry(userId: number, id: number) {
    const value = this.records.get(`${userId}:${id}`);
    return value ? { ...value } : undefined;
  }
  begin(userId: number, before: RagSource, action: RagAction) {
    const key = `${userId}:${before.ragDocumentId}`;
    if (this.records.has(key)) throw new Error("Recovery is required");
    const token = Symbol();
    this.readProofs.delete(key);
    this.records.set(key, {
      token,
      userId,
      id: before.ragDocumentId,
      expectedVersion: before.controlVersion,
      action,
      inFlight: true,
    });
    this.changed();
    let settled = false;
    return (confirmed: boolean) => {
      if (settled) return;
      settled = true;
      const record = this.records.get(key);
      if (record?.token !== token) return;
      if (confirmed) this.records.delete(key);
      else record.inFlight = false;
      this.changed();
    };
  }
  confirmRead(userId: number, id: number, readVersion: number) {
    const key = `${userId}:${id}`,
      record = this.records.get(key);
    if (!record || record.inFlight || this.version !== readVersion)
      return false;
    this.readProofs.set(key, { token: record.token, version: readVersion });
    return true;
  }
  acknowledge(userId: number, id: number, readVersion: number) {
    const key = `${userId}:${id}`,
      record = this.records.get(key),
      proof = this.readProofs.get(key);
    if (
      !record ||
      record.inFlight ||
      this.version !== readVersion ||
      proof?.token !== record.token ||
      proof.version !== readVersion
    )
      return false;
    this.records.delete(key);
    this.readProofs.delete(key);
    this.changed();
    return true;
  }
}
export type RagWriteState = {
  busy: boolean;
  result?: RagCommand;
  error?: string;
  reloadRequired?: boolean;
};
export class RagCommandSession {
  private lifetime: symbol | null = null;
  private visible = false;
  private operation: { token: symbol; controller: AbortController } | null =
    null;
  private state: RagWriteState = { busy: false };
  constructor(
    private request: RagRequest,
    private operator: Operator,
    private ledger: RagRecoveryLedger,
    private changed: (value: RagWriteState) => void,
  ) {}
  private publish(value: RagWriteState) {
    this.state = value;
    if (this.lifetime) this.changed(value);
  }
  activate(visible: boolean) {
    this.lifetime = null;
    this.operation?.controller.abort();
    const lifetime = Symbol();
    this.lifetime = lifetime;
    this.visible = visible;
    this.publish({ busy: this.operation !== null });
    return () => {
      if (this.lifetime !== lifetime) return;
      this.lifetime = null;
      this.visible = false;
      this.operation?.controller.abort();
    };
  }
  setVisible(visible: boolean) {
    this.visible = visible;
    if (!visible) {
      this.operation?.controller.abort();
      this.publish({ busy: this.operation !== null });
    }
  }
  isBusy() {
    return this.operation !== null;
  }
  async run(before: RagSource, action: RagAction, reason: string) {
    if (
      !this.lifetime ||
      !this.visible ||
      this.operation ||
      this.ledger.entry(this.operator.userId, before.ragDocumentId)
    )
      return false;
    let explanation: string;
    try {
      explanation = auditReason(reason);
    } catch (error) {
      this.publish({ busy: false, error: operationError(error) });
      return false;
    }
    const lifetime = this.lifetime,
      token = Symbol(),
      controller = new AbortController();
    this.operation = { token, controller };
    this.publish({ busy: true });
    const current = () =>
      this.lifetime === lifetime && this.visible && !controller.signal.aborted;
    let settle: ((confirmed: boolean) => void) | undefined;
    try {
      const result = await writeRagCommand(
        this.request,
        this.operator,
        before,
        action,
        explanation,
        controller.signal,
        () => {
          controller.signal.throwIfAborted();
          settle = this.ledger.begin(this.operator.userId, before, action);
        },
      );
      if (!current()) {
        settle?.(false);
        return false;
      }
      settle?.(true);
      this.publish({ busy: true, result });
      return true;
    } catch (error) {
      // Even a rejected/invalid/late response requires a fresh read before another command.
      settle?.(false);
      if (current())
        this.publish({
          busy: true,
          error: operationError(error),
          reloadRequired: true,
        });
      return false;
    } finally {
      if (this.operation?.token === token) {
        this.operation = null;
        this.publish({ ...this.state, busy: false });
      }
    }
  }
}
let browserLedger: RagRecoveryLedger | undefined;
export function ragRecoveryLedger() {
  return typeof window === "undefined"
    ? new RagRecoveryLedger()
    : (browserLedger ??= new RagRecoveryLedger());
}
