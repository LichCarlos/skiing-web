/** Browser memory only. Shared by role metadata and authorization screens. */
export class RoleRecoveryLedger {
  private accounts = new Map<number, Set<symbol>>();
  has(userId: number) {
    return this.accounts.has(userId);
  }
  begin(userId: number) {
    const token = Symbol();
    const pending = this.accounts.get(userId) ?? new Set<symbol>();
    pending.add(token);
    this.accounts.set(userId, pending);
    return () => {
      const current = this.accounts.get(userId);
      current?.delete(token);
      if (current?.size === 0) this.accounts.delete(userId);
    };
  }
  review(userId: number) {
    this.accounts.delete(userId);
  }
}
let browserLedger: RoleRecoveryLedger | undefined;
function ledger() {
  if (typeof window === "undefined") return null;
  return (browserLedger ??= new RoleRecoveryLedger());
}
export const hasPendingRoleWrite = (userId: number) =>
  ledger()?.has(userId) ?? false;
export const beginRoleWrite = (userId: number) =>
  ledger()?.begin(userId) ?? (() => {});
export const reviewRoleWrite = (userId: number) => ledger()?.review(userId);
