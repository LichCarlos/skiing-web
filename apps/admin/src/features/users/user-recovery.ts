export type AccountMutation =
  | { action: "create"; account: string }
  | { action: "roles" | "status"; userId: number };
export class AccountRecoveryLedger {
  private accounts = new Map<number, Map<symbol, AccountMutation>>();
  entries(userId: number) {
    return [...(this.accounts.get(userId)?.values() ?? [])];
  }
  has(userId: number) {
    return this.accounts.has(userId);
  }
  begin(userId: number, mutation: AccountMutation) {
    const token = Symbol(),
      records = this.accounts.get(userId) ?? new Map<symbol, AccountMutation>();
    records.set(
      token,
      mutation.action === "create"
        ? { action: "create", account: mutation.account }
        : { action: mutation.action, userId: mutation.userId },
    );
    this.accounts.set(userId, records);
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
let browserLedger: AccountRecoveryLedger | undefined;
const ledger = () =>
  typeof window === "undefined"
    ? null
    : (browserLedger ??= new AccountRecoveryLedger());
export const pendingAccountMutations = (userId: number) =>
  ledger()?.entries(userId) ?? [];
export const beginAccountMutation = (
  userId: number,
  mutation: AccountMutation,
) => ledger()?.begin(userId, mutation) ?? (() => {});
export const reviewAccountMutations = (userId: number) =>
  ledger()?.review(userId);
