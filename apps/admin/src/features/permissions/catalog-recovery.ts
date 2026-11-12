/** Browser-memory recovery only; no credentials, business payloads or storage. */
export class CatalogRecoveryLedger {
  private accounts = new Map<number, Set<symbol>>();
  has(userId: number) {
    return this.accounts.has(userId);
  }
  mark(userId: number, unconfirmed: boolean) {
    if (unconfirmed) {
      if (!this.accounts.has(userId)) this.begin(userId);
    } else this.accounts.delete(userId);
  }
  begin(userId: number) {
    const token = Symbol();
    const pending = this.accounts.get(userId) ?? new Set<symbol>();
    pending.add(token);
    this.accounts.set(userId, pending);
    return token;
  }
  finish(userId: number, token: symbol) {
    const pending = this.accounts.get(userId);
    pending?.delete(token);
    if (pending?.size === 0) this.accounts.delete(userId);
  }
}
let browserLedger: CatalogRecoveryLedger | undefined;
function ledger() {
  // Never share recovery state across server-rendered requests.
  if (typeof window === "undefined") return null;
  return (browserLedger ??= new CatalogRecoveryLedger());
}
export function hasUnconfirmedCatalogWrite(userId: number) {
  return ledger()?.has(userId) ?? false;
}
export function markCatalogWrite(userId: number, unconfirmed: boolean) {
  ledger()?.mark(userId, unconfirmed);
}
export function beginCatalogWrite(userId: number) {
  const current = ledger();
  const token = current?.begin(userId);
  return () => {
    if (token) current?.finish(userId, token);
  };
}
