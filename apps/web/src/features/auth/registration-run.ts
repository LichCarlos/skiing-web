import { ApiError, type ApiClient } from "@common/api-contracts/client";
import { PublicSessionError } from "@/platform/auth/public-session-model";
import {
  registrationInput,
  validateRegisteredUser,
} from "@/features/auth/auth-model";

export type RegistrationState = { busy: boolean; error: string | null };
export const initialRegistration: RegistrationState = {
  busy: false,
  error: null,
};
interface Ports {
  request: ApiClient["request"];
  changed(state: RegistrationState): void;
  registered(account: string): void;
}

/** Registration never creates a session, retries a POST, or retains a password. */
export class RegistrationRun {
  private active = false;
  private generation = 0;
  private flight: AbortController | null = null;
  private state = initialRegistration;
  constructor(private readonly ports: Ports) {}
  activate() {
    this.active = true;
    this.generation++;
  }
  deactivate() {
    this.active = false;
    this.generation++;
    this.flight?.abort();
  }
  clear() {
    if (!this.flight) this.publish({ busy: false, error: null });
  }
  private publish(state: RegistrationState) {
    this.state = state;
    if (this.active) this.ports.changed(state);
  }
  async submit(account: unknown, password: unknown, nickname: unknown) {
    if (!this.active || this.flight) return;
    let input;
    try {
      input = registrationInput(account, password, nickname);
    } catch (error) {
      this.publish({
        busy: false,
        error:
          error instanceof PublicSessionError
            ? error.message
            : "请检查注册信息。",
      });
      return;
    }
    const controller = new AbortController();
    const generation = this.generation;
    this.flight = controller;
    this.publish({ busy: true, error: null });
    const current = () =>
      this.active &&
      this.generation === generation &&
      this.flight === controller;
    try {
      const result = await this.ports.request("/auth/register", {
        method: "POST",
        body: input,
        signal: controller.signal,
      });
      if (!current()) return;
      validateRegisteredUser(result, input.account);
      this.ports.registered(input.account);
    } catch (error) {
      if (!current()) return;
      const definitive =
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408;
      this.publish({
        busy: true,
        error: definitive
          ? error.status === 409
            ? "这个账号已注册，请切换登录。"
            : error.status === 429
              ? "注册过于频繁，请稍后手动重试。"
              : "注册未成功，请检查填写内容后重试。"
          : "注册结果尚未确认。请检查网络后尝试登录该账号，不要重复注册；不会自动重试。",
      });
    } finally {
      if (this.flight === controller) {
        this.flight = null;
        this.publish({ ...this.state, busy: false });
      }
    }
  }
}
