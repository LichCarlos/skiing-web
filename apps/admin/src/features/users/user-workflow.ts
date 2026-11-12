import { ApiError } from "@common/api-contracts/client";
import {
  UserInputError,
  verifyAccountReader,
  type Operator,
} from "@/features/users/user-model";
import type { AccountMutation } from "@/features/users/user-recovery";
export class AccountWriteGate {
  private controller = new AbortController();
  private active = false;
  private busy = false;
  private blocked: boolean;
  constructor(
    private user: Operator,
    private verify: (signal: AbortSignal) => Promise<Operator>,
    private onBusy: (busy: boolean) => void,
    private begin: (mutation: AccountMutation) => () => void,
    pending = false,
  ) {
    this.blocked = pending;
  }
  activate() {
    this.active = true;
    if (this.controller.signal.aborted) {
      this.controller = new AbortController();
      this.busy = false;
    }
  }
  dispose() {
    this.active = false;
    this.controller.abort();
  }
  isActive() {
    return this.active && !this.controller.signal.aborted;
  }
  isLocked() {
    return this.busy || this.blocked;
  }
  isRunning() {
    return this.busy;
  }
  acknowledge() {
    if (this.isActive() && !this.busy) this.blocked = false;
  }
  async run<T>(
    action: AccountMutation["action"],
    prepare: (
      signal: AbortSignal,
    ) => Promise<{ body: T; mutation: AccountMutation } | null>,
    write: (body: T, signal: AbortSignal) => Promise<unknown>,
    committed: () => void,
  ) {
    if (!this.isActive() || this.isLocked())
      return { status: "ignored" as const };
    this.busy = true;
    this.onBusy(true);
    const controller = this.controller;
    const current = () =>
      this.active &&
      this.controller === controller &&
      !controller.signal.aborted;
    let attempted = false,
      finish: (() => void) | undefined;
    try {
      const prepared = await prepare(controller.signal);
      if (!current() || !prepared) return { status: "ignored" as const };
      if (prepared.mutation.action !== action)
        throw new UserInputError("账号操作不匹配，请重新打开操作");
      const operator = await this.verify(controller.signal);
      if (!current()) return { status: "ignored" as const };
      verifyAccountReader(operator, this.user);
      const permission =
        action === "roles"
          ? "system:user:assign-role"
          : action === "status"
            ? "system:user:update"
            : "system:user:create";
      if (!operator.permissionKeys.includes(permission))
        throw new UserInputError("当前身份无权执行此操作，请重新读取身份");
      finish = this.begin(prepared.mutation);
      attempted = true;
      await write(prepared.body, controller.signal);
      attempted = false;
      finish();
      if (!current()) return { status: "ignored" as const };
      committed();
      return { status: "success" as const };
    } catch (cause) {
      const definitive =
        cause instanceof ApiError &&
        cause.status >= 400 &&
        cause.status < 500 &&
        cause.status !== 408;
      if (attempted && definitive) finish?.();
      if (!current()) return { status: "ignored" as const };
      const uncertain = attempted && !definitive;
      if (uncertain) this.blocked = true;
      return {
        status: "error" as const,
        uncertain,
        traceId: cause instanceof ApiError ? cause.traceId : null,
        message: uncertain
          ? "操作结果未确认，请刷新并核对目标账号后继续"
          : cause instanceof UserInputError
            ? cause.message
            : definitive
              ? "操作被拒绝，请核对账号、角色、权限范围和最后管理员保护规则"
              : "操作未完成，请稍后重试",
      };
    } finally {
      if (this.controller === controller) {
        this.busy = false;
        if (current()) this.onBusy(false);
      }
    }
  }
}
