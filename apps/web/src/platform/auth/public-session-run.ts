import { ApiError, type ApiClient } from "@common/api-contracts/client";
import {
  initialPublicSession,
  loginInput,
  parsePublicUser,
  PublicSessionError,
  validateBrowserLogin,
  validateBrowserLogout,
  type PublicSessionState,
  type PublicUser,
} from "@/platform/auth/public-session-model";
import { PublicSessionFence } from "@/platform/auth/public-session-fence";
type Lifetime = { pathname: string | null };
interface Ports {
  pathname(): string | null;
  request: ApiClient["request"];
  changed(state: PublicSessionState): void;
}
export class PublicSessionRun {
  private active: Lifetime | null = null;
  private read: AbortController | null = null;
  private unsubscribe: (() => void) | null = null;
  private state = initialPublicSession;
  private suppressFence = false;
  private commandError: string | null = null;
  constructor(
    private readonly ports: Ports,
    private readonly fence: PublicSessionFence,
  ) {}
  private current(lifetime: Lifetime | null): lifetime is Lifetime {
    return (
      lifetime !== null &&
      this.active === lifetime &&
      this.ports.pathname() === lifetime.pathname
    );
  }
  private publish(patch: Partial<PublicSessionState>) {
    if (!this.current(this.active)) return;
    this.state = {
      ...this.state,
      pathname: this.active.pathname,
      ...patch,
      revision: this.state.revision + 1,
    };
    this.ports.changed(this.state);
  }
  activate(pathname: string | null) {
    this.stop();
    const lifetime = { pathname };
    this.active = lifetime;
    this.commandError = null;
    const changed = () => {
      if (!this.current(lifetime) || this.suppressFence) return;
      this.read?.abort();
      this.read = null;
      if (this.fence.pending) this.pending();
      else void this.reload(lifetime, false);
    };
    this.unsubscribe = this.fence.subscribe(changed);
    if (this.fence.pending) this.pending();
    else void this.reload(lifetime, false);
    return () => {
      if (this.active === lifetime) this.stop();
    };
  }
  private stop() {
    this.active = null;
    this.read?.abort();
    this.read = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    // Already dispatched authentication writes cannot be undone. The fence is
    // settled by their result even if this provider/route has gone away.
  }
  private pending() {
    this.publish({
      user: null,
      ready: false,
      reading: false,
      busy: this.fence.inFlight,
      uncertain: !this.fence.inFlight,
      error: this.fence.inFlight
        ? null
        : "登录或退出结果未确认，请检查当前会话；不会自动重复提交。",
    });
  }
  actions(pathname: string | null) {
    const lifetime = this.active;
    const allowed = () =>
      this.current(lifetime) && lifetime.pathname === pathname;
    return {
      restore: (manual = true) =>
        allowed() ? this.reload(lifetime!, manual) : Promise.resolve(),
      login: (account: unknown, password: unknown) =>
        allowed()
          ? this.change(lifetime!, { account, password })
          : Promise.resolve(false),
      logout: () =>
        allowed() ? this.change(lifetime!, null) : Promise.resolve(false),
    };
  }
  private async reload(lifetime: Lifetime, manual: boolean) {
    if (
      !this.current(lifetime) ||
      this.read ||
      this.fence.inFlight ||
      (this.fence.pending && !manual)
    )
      return;
    const version = this.fence.version;
    const controller = new AbortController();
    this.read = controller;
    const current = () =>
      this.current(lifetime) &&
      this.read === controller &&
      !controller.signal.aborted &&
      this.fence.version === version;
    this.publish({
      user: null,
      ready: false,
      reading: true,
      busy: false,
      uncertain: this.fence.pending,
      error: null,
    });
    try {
      let user: PublicUser | null;
      try {
        user = parsePublicUser(
          await this.ports.request<unknown>("/auth/me", {
            cache: "no-store",
            signal: controller.signal,
          }),
        );
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
        user = null;
      }
      if (!current()) return;
      if (this.fence.pending) {
        this.suppressFence = true;
        try {
          if (!this.fence.acknowledge(version)) return;
        } finally {
          this.suppressFence = false;
        }
        if (
          this.fence.pending ||
          this.fence.version !== version + 1 ||
          !this.current(lifetime) ||
          this.read !== controller
        )
          return;
      }
      this.publish({
        user,
        ready: true,
        reading: false,
        busy: false,
        uncertain: false,
        error: this.commandError,
      });
      this.commandError = null;
    } catch {
      if (current())
        this.publish({
          user: null,
          ready: false,
          reading: false,
          busy: false,
          uncertain: this.fence.pending,
          error: "会话无法确认，请检查当前会话。",
        });
    } finally {
      if (this.read === controller) this.read = null;
    }
  }
  private async change(
    lifetime: Lifetime,
    credentials: { account: unknown; password: unknown } | null,
  ) {
    if (!this.current(lifetime) || this.fence.pending || this.read)
      return false;
    let input;
    try {
      input =
        credentials === null
          ? null
          : loginInput(credentials.account, credentials.password);
      if (!input && (!this.state.ready || !this.state.user)) return false;
    } catch (error) {
      this.publish({
        error:
          error instanceof PublicSessionError
            ? error.message
            : "请填写有效的账号和密码。",
      });
      return false;
    }
    this.commandError = null;
    const settle = this.fence.begin();
    if (!settle) return false;
    try {
      if (input)
        validateBrowserLogin(
          await this.ports.request("/auth/login", {
            method: "POST",
            body: input,
          }),
          input.account,
        );
      else
        validateBrowserLogout(
          await this.ports.request("/auth/logout", {
            method: "POST",
            body: {},
          }),
        );
      settle(true);
    } catch (error) {
      const definitive =
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408;
      if (this.current(lifetime) && definitive)
        this.commandError =
          input && error.status === 429
            ? "登录过于频繁，请稍后手动重试。"
            : "登录或退出被拒绝，请检查账号、密码或权限。";
      settle(definitive);
    }
    return true;
  }
}
