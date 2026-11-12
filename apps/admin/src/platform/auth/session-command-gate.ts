/** Local browser execution protection, with no user details or credentials. */
export class SessionCommandGate {
  private operation: { token: symbol; inFlight: boolean } | null = null;
  private listeners = new Set<() => void>();
  revision = 0;
  get pending() {
    return this.operation !== null;
  }
  get inFlight() {
    return this.operation?.inFlight ?? false;
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private changed() {
    this.revision++;
    this.listeners.forEach((listener) => listener());
  }
  begin() {
    if (this.operation) return null;
    const token = Symbol();
    this.operation = { token, inFlight: true };
    this.changed();
    return (definitive: boolean) => {
      if (this.operation?.token !== token || !this.operation.inFlight) return;
      this.operation = definitive ? null : { token, inFlight: false };
      this.changed();
    };
  }
  acknowledge(revision: number) {
    if (revision !== this.revision || !this.operation || this.inFlight)
      return false;
    this.operation = null;
    this.changed();
    return true;
  }
}
let browserGate: SessionCommandGate | undefined;
export function sessionCommandGate() {
  return typeof window === "undefined"
    ? new SessionCommandGate()
    : (browserGate ??= new SessionCommandGate());
}
