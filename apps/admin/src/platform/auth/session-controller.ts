import { ApiError } from "@common/api-contracts/client";
import { SessionCommandGate } from "@/platform/auth/session-command-gate";
import {
  loadingSession,
  loginInput,
  SessionInputError,
  SessionOutcomeUnknown,
  type SessionState,
  type CurrentUser,
} from "@/platform/auth/session-model";
interface Ports {
  read(signal: AbortSignal): Promise<CurrentUser>;
  login(input: { account: string; password: string }): Promise<CurrentUser>;
  logout(): Promise<void>;
  changed(state: SessionState): void;
}
export class AdminSessionController {
  private lifetime: symbol | null = null;
  private read: {
    controller: AbortController;
    promise: Promise<CurrentUser | null>;
  } | null = null;
  private unsubscribe: (() => void) | null = null;
  private suppress = false;
  constructor(
    private readonly ports: Ports,
    private readonly gate: SessionCommandGate,
  ) {}
  private publish(state: SessionState) {
    if (this.lifetime) this.ports.changed(state);
  }
  activate() {
    this.dispose();
    const lifetime = Symbol();
    this.lifetime = lifetime;
    this.unsubscribe = this.gate.subscribe(() => {
      if (this.lifetime !== lifetime || this.suppress) return;
      this.read?.controller.abort();
      this.read = null;
      if (this.gate.pending) this.pending();
      else void this.restore(false);
    });
    if (this.gate.pending) this.pending();
    else void this.restore(false);
    return () => {
      if (this.lifetime === lifetime) this.dispose();
    };
  }
  private dispose() {
    this.lifetime = null;
    this.read?.controller.abort();
    this.read = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
  private pending() {
    this.publish(
      this.gate.inFlight
        ? loadingSession
        : {
            status: "unavailable",
            currentUser: null,
            errorMessage:
              "登录或退出结果未确认，请检查当前会话；不会自动重复提交。",
            canSignOut: false,
          },
    );
  }
  actions() {
    const lifetime = this.lifetime;
    const current = () => lifetime !== null && this.lifetime === lifetime;
    return {
      retryRestore: async () => {
        if (current()) await this.restore(true);
      },
      signIn: (input: { account: string; password: string }) =>
        current()
          ? this.signIn(input, lifetime!)
          : Promise.reject(
              new SessionInputError("页面已失效，请重新打开登录页面。"),
            ),
      signOut: async () => {
        if (current()) await this.signOut(lifetime!);
      },
    };
  }
  private async restore(manual: boolean): Promise<CurrentUser | null> {
    if (!this.lifetime) return null;
    if (this.read) return this.read.promise;
    if (this.gate.inFlight || (this.gate.pending && !manual)) {
      this.pending();
      return null;
    }
    const lifetime = this.lifetime,
      revision = this.gate.revision,
      controller = new AbortController();
    // Publish and read happen in the next microtask after the slot is acquired.
    const promise = Promise.resolve().then(async () => {
      const current = () =>
        this.lifetime === lifetime &&
        this.read?.controller === controller &&
        !controller.signal.aborted &&
        this.gate.revision === revision;
      if (!current()) return null;
      this.publish(loadingSession);
      try {
        let user: CurrentUser | null;
        try {
          user = await this.ports.read(controller.signal);
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 401) throw error;
          user = null;
        }
        if (!current()) return null;
        if (this.gate.pending) {
          this.suppress = true;
          try {
            if (!this.gate.acknowledge(revision)) return null;
          } finally {
            this.suppress = false;
          }
          if (
            this.gate.pending ||
            this.gate.revision !== revision + 1 ||
            this.lifetime !== lifetime ||
            this.read?.controller !== controller
          )
            return null;
        }
        this.publish(
          user
            ? { status: "authenticated", currentUser: user, errorMessage: null }
            : { status: "anonymous", currentUser: null, errorMessage: null },
        );
        return user;
      } catch {
        if (current())
          this.publish({
            status: "unavailable",
            currentUser: null,
            errorMessage: "无法确认当前会话，请检查网络后重试。",
            canSignOut: !this.gate.pending,
          });
        return null;
      } finally {
        if (this.read?.controller === controller) this.read = null;
      }
    });
    this.read = { controller, promise };
    this.publish(loadingSession);
    return promise;
  }
  private finish(settle: (definitive: boolean) => void, definitive: boolean) {
    this.suppress = true;
    try {
      settle(definitive);
    } finally {
      this.suppress = false;
    }
  }
  private async signIn(
    raw: { account: string; password: string },
    lifetime: symbol,
  ): Promise<CurrentUser> {
    if (this.gate.pending || this.read)
      throw new SessionInputError(
        "会话正在处理或结果未确认，请先检查当前会话。",
      );
    const input = loginInput(raw),
      settle = this.gate.begin();
    if (!settle) throw new SessionInputError("会话正在处理。");
    try {
      const user = await this.ports.login(input);
      this.finish(settle, true);
      if (this.lifetime !== lifetime)
        throw new SessionInputError("登录已返回，请在当前页面检查会话。");
      if (this.gate.pending)
        throw new SessionInputError("会话已变化，请检查当前会话。");
      this.publish({
        status: "authenticated",
        currentUser: user,
        errorMessage: null,
      });
      return user;
    } catch (error) {
      const definitive =
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408;
      // Repeated settlement is ignored by the gate.
      this.finish(settle, definitive);
      if (this.lifetime === lifetime) {
        if (this.gate.pending) this.pending();
        else await this.restore(false);
      }
      if (error instanceof SessionInputError) throw error;
      if (definitive)
        throw new SessionInputError(
          error.status === 429
            ? "登录过于频繁，请稍后手动重试。"
            : error.status === 401
              ? "账号或密码错误。"
              : "登录被拒绝，请检查账号或权限。",
        );
      throw new SessionOutcomeUnknown(
        "登录结果未确认，请检查当前会话，勿重复提交。",
      );
    }
  }
  private async signOut(lifetime: symbol): Promise<void> {
    if (this.gate.pending || this.read)
      throw new SessionInputError("会话正在处理，请先检查当前会话。");
    const settle = this.gate.begin();
    if (!settle) return;
    try {
      await this.ports.logout();
      this.finish(settle, true);
      if (this.lifetime === lifetime) await this.restore(false);
    } catch (error) {
      const definitive =
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408;
      this.finish(settle, definitive);
      if (this.lifetime === lifetime) {
        if (this.gate.pending) this.pending();
        else await this.restore(false);
      }
      throw new SessionOutcomeUnknown(
        definitive
          ? "退出被拒绝，已重新检查当前会话。"
          : "退出结果未确认，请检查当前会话，勿重复提交。",
      );
    }
  }
}
