/** Owns one query. Cancellation also suppresses late success, error and finally. */
export class RequestLane {
  private controller: AbortController | null = null;
  cancel() {
    this.controller?.abort();
    this.controller = null;
  }
  async run<T>(
    read: (signal: AbortSignal) => Promise<T>,
    publish: (value: T) => void,
    fail: (cause: unknown) => void,
    settled: () => void,
  ): Promise<boolean> {
    this.cancel();
    const controller = new AbortController();
    this.controller = controller;
    const current = () =>
      this.controller === controller && !controller.signal.aborted;
    try {
      const value = await read(controller.signal);
      if (!current()) return false;
      publish(value);
      return true;
    } catch (cause) {
      if (current()) fail(cause);
      return false;
    } finally {
      if (current()) settled();
    }
  }
}
