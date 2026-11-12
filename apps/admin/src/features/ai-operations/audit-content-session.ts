import { auditReason, operationError } from "@/features/ai-operations/api";
import type { AuditContent } from "@/features/ai-operations/api";
export type AuditContentState = {
  busy: boolean;
  content?: AuditContent;
  error?: string;
};
/** One page instance; never stores reasons or content outside page memory. */
export class AuditContentSession {
  private lifetime: symbol | null = null;
  private visible = false;
  private epoch = 0;
  private operation: { token: symbol; controller: AbortController } | null =
    null;
  private state: AuditContentState = { busy: false };
  constructor(
    private readonly request: (
      reason: string,
      signal: AbortSignal,
    ) => Promise<AuditContent>,
    private readonly changed: (state: AuditContentState) => void,
  ) {}
  private publish(next: AuditContentState) {
    this.state = next;
    if (this.lifetime) this.changed(next);
  }
  activate(visible: boolean) {
    this.dispose();
    const lifetime = Symbol();
    this.lifetime = lifetime;
    this.visible = visible;
    this.publish({ busy: this.operation !== null });
    return () => {
      if (this.lifetime === lifetime) this.dispose();
    };
  }
  private dispose() {
    this.lifetime = null;
    this.visible = false;
    this.clear();
  }
  setVisible(visible: boolean) {
    this.visible = visible;
    if (!visible) this.clear();
  }
  clear() {
    this.epoch++;
    this.operation?.controller.abort();
    this.publish({ busy: this.operation !== null });
  }
  async read(reason: string): Promise<boolean> {
    if (!this.lifetime || !this.visible || this.operation) return false;
    let explanation: string;
    try {
      explanation = auditReason(reason);
    } catch (error) {
      this.publish({ busy: false, error: operationError(error) });
      return false;
    }
    const lifetime = this.lifetime,
      epoch = this.epoch,
      token = Symbol(),
      controller = new AbortController();
    this.operation = { token, controller };
    this.publish({ busy: true });
    const current = () =>
      this.lifetime === lifetime &&
      this.visible &&
      this.epoch === epoch &&
      !controller.signal.aborted;
    try {
      const content = await this.request(explanation, controller.signal);
      if (!current()) return false;
      this.publish({ busy: true, content });
      return true;
    } catch (error) {
      if (current()) this.publish({ busy: true, error: operationError(error) });
      return false;
    } finally {
      if (this.operation?.token === token) {
        this.operation = null;
        this.publish({ ...this.state, busy: false });
      }
    }
  }
}
