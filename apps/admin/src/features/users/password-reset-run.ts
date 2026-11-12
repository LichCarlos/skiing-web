import { ApiError } from "@common/api-contracts/client";
import type { components } from "@common/api-contracts/openapi";
import {
  accountError,
  isAccountAdministrator,
  verifyAccountReader,
  type Operator,
  type ManagedAccount,
} from "@/features/users/user-model";

export type PasswordResetBody =
  components["schemas"]["ResetManagedPasswordDto"];
export interface PasswordResetState {
  busy: boolean;
  unknown: boolean;
  saved: boolean;
  message: string | null;
}
export function canResetPasswords(operator: Operator) {
  return (
    isAccountAdministrator(operator) &&
    [
      "management:portal:enter",
      "system:user:list",
      "system:user:reset-password",
    ].every((key) => operator.permissionKeys.includes(key))
  );
}
export function passwordResetBody(
  password: string,
  reason: string,
): PasswordResetBody {
  const length = new TextEncoder().encode(password).length,
    trimmed = reason.trim();
  if (length < 8 || length > 72) throw new Error("新密码需为8–72个UTF-8字节。");
  if (!trimmed || trimmed.length > 500)
    throw new Error("请填写1–500字的重置原因。");
  return { newPassword: password, reason: trimmed };
}
interface Ports {
  verify(signal: AbortSignal): Promise<Operator>;
  readTarget(signal: AbortSignal): Promise<ManagedAccount>;
  write(body: PasswordResetBody, signal: AbortSignal): Promise<void>;
  saved(): Promise<void>;
  changed(state: PasswordResetState): void;
}
/** A focused account workspace. Secrets are never retained in controller state. */
export class PasswordResetRun {
  private controller: AbortController | null = null;
  private busy = false;
  private writing = false;
  private state: PasswordResetState = {
    busy: false,
    unknown: false,
    saved: false,
    message: null,
  };
  constructor(
    private readonly operator: Operator,
    private readonly target: Pick<ManagedAccount, "userId" | "account">,
    private readonly ports: Ports,
  ) {}
  activate() {
    if (!this.controller) {
      this.controller = new AbortController();
      this.update({ busy: false });
    }
  }
  dispose() {
    this.controller?.abort();
    this.controller = null;
    this.busy = false;
    if (this.writing)
      this.state = {
        ...this.state,
        unknown: true,
        message: "重置结果尚未确认，请人工核对后再发起新的命令。",
      };
    this.writing = false;
    this.state = { ...this.state, busy: false };
  }
  snapshot() {
    return this.state;
  }
  private update(patch: Partial<PasswordResetState>) {
    this.state = { ...this.state, ...patch };
    if (this.controller) this.ports.changed(this.state);
  }
  acknowledge() {
    if (this.controller && !this.busy)
      this.update({
        unknown: false,
        message: "已人工核对；如需再次重置，请重新输入密码和原因并确认。",
      });
  }
  async submit(password: string, reason: string) {
    const controller = this.controller;
    if (
      !controller ||
      this.busy ||
      this.state.unknown ||
      !canResetPasswords(this.operator)
    )
      return false;
    this.busy = true;
    this.update({ busy: true, saved: false, message: null });
    let attempted = false,
      committed = false;
    const current = () =>
      this.controller === controller && !controller.signal.aborted;
    const check = () => {
      if (!current()) throw new DOMException("Workspace closed", "AbortError");
    };
    try {
      const body = passwordResetBody(password, reason);
      const before = await this.ports.verify(controller.signal);
      check();
      verifyAccountReader(before, this.operator);
      if (!canResetPasswords(before)) throw new Error("当前账号无权重置密码。");
      const target = await this.ports.readTarget(controller.signal);
      check();
      if (
        target.userId !== this.target.userId ||
        target.account !== this.target.account
      )
        throw new Error("目标账号已变化，请重新打开详情。");
      const operator = await this.ports.verify(controller.signal);
      check();
      verifyAccountReader(operator, this.operator);
      if (!canResetPasswords(operator))
        throw new Error("当前账号无权重置密码。");
      attempted = true;
      this.writing = true;
      await this.ports.write(body, controller.signal);
      committed = true;
      check();
      this.writing = false;
      this.update({
        saved: true,
        unknown: false,
        message: "密码已重置，目标全部登录会话已撤销。",
      });
      await this.ports.saved();
      return true;
    } catch (error) {
      if (!current()) return false;
      if (committed) {
        this.update({
          saved: true,
          message: "密码已重置，会话界面刷新失败，请重新登录。",
        });
        return true;
      }
      const definitive =
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408;
      const unknown = attempted && !definitive;
      this.update({
        unknown,
        message: unknown
          ? "重置结果尚未确认。请人工核对，勿直接重复提交；账号详情不能证明密码已重置。"
          : error instanceof ApiError && error.status === 409
            ? "并发修改冲突，请刷新账号后重新确认重置。"
            : error instanceof ApiError
              ? accountError(error)
              : error instanceof Error
                ? error.message
                : "无法重置密码。",
      });
      return false;
    } finally {
      if (current()) {
        this.busy = false;
        this.writing = false;
        this.update({ busy: false });
      }
    }
  }
}
