import type { EntityType } from "@/features/custom-fields/field-model";

export interface FieldWriteReceipt {
  confirm(): void;
  uncertain(): void;
}
type Entry = { group: boolean; inFlight: boolean };

/** Memory in this browser tab only. Never stores credentials or form payloads. */
export class FieldRecoveryLedger {
  private entries = new Map<string, Map<symbol, Entry>>();
  private revision = 0;
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.revision;
  private changed() {
    this.revision++;
    for (const listener of this.listeners) listener();
  }
  private key(userId: number, entityType: EntityType) {
    return `${userId}:${entityType}`;
  }
  state(userId: number, entityType: EntityType) {
    const entries = [
      ...(this.entries.get(this.key(userId, entityType))?.values() ?? []),
    ];
    return {
      pending: entries.length > 0,
      inFlight: entries.some((entry) => entry.inFlight),
      needsGroup: entries.some((entry) => entry.group),
    };
  }
  begin(
    userId: number,
    entityType: EntityType,
    permission: string,
  ): FieldWriteReceipt | null {
    const key = this.key(userId, entityType);
    if (this.entries.has(key)) return null;
    const token = Symbol();
    const entry: Entry = {
      group: permission.startsWith("system:field-group:"),
      inFlight: true,
    };
    this.entries.set(key, new Map([[token, entry]]));
    this.changed();
    return {
      confirm: () => {
        const pending = this.entries.get(key);
        if (!pending?.delete(token)) return;
        if (!pending.size) this.entries.delete(key);
        this.changed();
      },
      uncertain: () => {
        const pending = this.entries.get(key)?.get(token);
        if (!pending?.inFlight) return;
        pending.inFlight = false;
        this.changed();
      },
    };
  }
  review(userId: number, entityType: EntityType, expectedRevision?: number) {
    if (expectedRevision !== undefined && expectedRevision !== this.revision)
      return false;
    const state = this.state(userId, entityType);
    if (state.inFlight) return false;
    if (this.entries.delete(this.key(userId, entityType))) this.changed();
    return true;
  }
}
let browserLedger: FieldRecoveryLedger | undefined;
function ledger() {
  if (typeof window === "undefined") return null;
  return (browserLedger ??= new FieldRecoveryLedger());
}
export const subscribeFieldRecovery = (listener: () => void) =>
  ledger()?.subscribe(listener) ?? (() => {});
export const fieldRecoverySnapshot = () => ledger()?.snapshot() ?? 0;
export const fieldRecoveryServerSnapshot = () => 0;
export const fieldRecoveryState = (userId: number, entityType: EntityType) =>
  ledger()?.state(userId, entityType) ?? {
    pending: false,
    inFlight: false,
    needsGroup: false,
  };
export const beginFieldWrite = (
  userId: number,
  entityType: EntityType,
  permission: string,
) => ledger()?.begin(userId, entityType, permission) ?? null;
export const reviewFieldWrite = (
  userId: number,
  entityType: EntityType,
  expectedRevision: number,
) => ledger()?.review(userId, entityType, expectedRevision) ?? false;
