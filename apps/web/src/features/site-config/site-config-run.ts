import type { SiteConfig } from "@/features/site-config/site-config-api";

export type ConfigState = {
  pathname: string | null;
  data: SiteConfig | null;
  loading: boolean;
  error: boolean;
};
export const initialConfigState: ConfigState = {
  pathname: null,
  data: null,
  loading: true,
  error: false,
};
export function visibleConfig(
  state: ConfigState,
  pathname: string | null,
): ConfigState {
  return state.pathname === pathname
    ? state
    : { ...initialConfigState, pathname };
}
interface Ports {
  pathname(): string | null;
  read(signal: AbortSignal): Promise<SiteConfig>;
  changed(state: ConfigState): void;
}
export class SiteConfigRun {
  private active: { pathname: string | null } | null = null;
  private read: AbortController | null = null;
  private state = initialConfigState;
  constructor(private readonly ports: Ports) {}
  activate(pathname: string | null) {
    this.stop();
    const lifetime = { pathname };
    this.active = lifetime;
    void this.reload(pathname);
    return () => {
      if (this.active === lifetime) this.stop();
    };
  }
  private stop() {
    this.active = null;
    this.read?.abort();
    this.read = null;
  }
  retry(pathname: string | null) {
    const lifetime = this.active;
    return () => {
      if (lifetime && this.active === lifetime) void this.reload(pathname);
    };
  }
  async reload(expected: string | null) {
    const lifetime = this.active;
    if (
      !lifetime ||
      lifetime.pathname !== expected ||
      this.ports.pathname() !== expected ||
      this.read
    )
      return;
    const controller = new AbortController();
    this.read = controller;
    const current = () =>
      this.active === lifetime &&
      this.read === controller &&
      this.ports.pathname() === expected &&
      !controller.signal.aborted;
    const publish = (patch: Omit<ConfigState, "pathname">) => {
      if (!current()) return;
      this.state = { pathname: expected, ...patch };
      this.ports.changed(this.state);
    };
    publish({ data: null, loading: true, error: false });
    try {
      const data = await this.ports.read(controller.signal);
      publish({ data, loading: false, error: false });
    } catch {
      publish({ data: null, loading: false, error: true });
    } finally {
      if (this.read === controller) this.read = null;
    }
  }
}
