import { isDictionaryType } from "@/features/dictionaries/routes";

export interface DictionaryWriteReceipt {
  confirm(): void;
  uncertain(): void;
}
type Entry = { dictType: string; inFlight: boolean; token: symbol };

/** Per-tab memory only; stores a target key, never credentials or form data. */
export class DictionaryRecoveryLedger {
  private entries = new Map<number, Entry>();
  private revision = 0;
  private listeners = new Set<() => void>();
  snapshot = () => this.revision;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private changed() {
    this.revision++;
    for (const listener of this.listeners) listener();
  }
  state(userId: number) {
    const entry = this.entries.get(userId);
    return entry
      ? { dictType: entry.dictType, inFlight: entry.inFlight }
      : null;
  }
  begin(userId: number, dictType: string): DictionaryWriteReceipt | null {
    if (
      this.entries.has(userId) ||
      typeof dictType !== "string" ||
      !isDictionaryType(dictType)
    )
      return null;
    const entry: Entry = { dictType, inFlight: true, token: Symbol() };
    this.entries.set(userId, entry);
    this.changed();
    return {
      confirm: () => {
        if (this.entries.get(userId)?.token !== entry.token) return;
        this.entries.delete(userId);
        this.changed();
      },
      uncertain: () => {
        if (this.entries.get(userId)?.token !== entry.token || !entry.inFlight)
          return;
        entry.inFlight = false;
        this.changed();
      },
    };
  }
  review(userId: number, dictType: string, revision: number) {
    const entry = this.entries.get(userId);
    if (
      revision !== this.revision ||
      !entry ||
      entry.inFlight ||
      entry.dictType !== dictType
    )
      return false;
    this.entries.delete(userId);
    this.changed();
    return true;
  }
}
let browserLedger: DictionaryRecoveryLedger | undefined;
function ledger() {
  return typeof window === "undefined"
    ? null
    : (browserLedger ??= new DictionaryRecoveryLedger());
}
export const dictionaryRecoverySnapshot = () => ledger()?.snapshot() ?? 0;
export const dictionaryRecoveryServerSnapshot = () => 0;
export const subscribeDictionaryRecovery = (listener: () => void) =>
  ledger()?.subscribe(listener) ?? (() => {});
export const dictionaryRecoveryState = (userId: number) =>
  ledger()?.state(userId) ?? null;
export const beginDictionaryWrite = (userId: number, dictType: string) =>
  ledger()?.begin(userId, dictType) ?? null;
export const reviewDictionaryWrite = (
  userId: number,
  dictType: string,
  revision: number,
) => ledger()?.review(userId, dictType, revision) ?? false;
