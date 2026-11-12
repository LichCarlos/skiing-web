/** Browser memory only: no account, password, cookie or token is retained. */
export class PublicSessionFence {
  private entry: { token: symbol; inFlight: boolean } | null = null;
  private listeners = new Set<() => void>();
  version = 0;
  get pending() {
    return this.entry !== null;
  }
  get inFlight() {
    return this.entry?.inFlight ?? false;
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private changed() {
    this.version++;
    this.listeners.forEach((listener) => listener());
  }
  begin() {
    if (this.entry) return null;
    const token = Symbol();
    this.entry = { token, inFlight: true };
    this.changed();
    return (definitive: boolean) => {
      if (this.entry?.token !== token || !this.entry.inFlight) return;
      this.entry = definitive ? null : { token, inFlight: false };
      this.changed();
    };
  }
  acknowledge(version: number) {
    if (version !== this.version || !this.entry || this.entry.inFlight)
      return false;
    this.entry = null;
    this.changed();
    return true;
  }
}
let browserFence: PublicSessionFence | undefined;
export function publicSessionFence() {
  return typeof window === "undefined"
    ? new PublicSessionFence()
    : (browserFence ??= new PublicSessionFence());
}
