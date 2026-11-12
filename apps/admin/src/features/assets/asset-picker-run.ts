import {
  parseCurrentUser,
  type CurrentUser,
} from "@/platform/auth/session-model";
import {
  AssetPickerError,
  type AssetRequest,
} from "@/features/assets/asset-library-model";

export function pickerIdentity(user: CurrentUser): string {
  return JSON.stringify([
    user.userId,
    [...new Set(user.permissionKeys)].sort(),
    user.roles.map((role) => role.roleKey).sort(),
    user.merchant?.merchantId ?? null,
  ]);
}

/** One mounted picker. No global account state, write replay or persistent cache. */
export class AssetPickerRun {
  private active = false;
  private generation = 0;
  private readonly requests = new Set<AbortController>();
  private readonly expected: string;
  constructor(
    private readonly user: CurrentUser,
    private readonly request: AssetRequest,
  ) {
    this.expected = pickerIdentity(user);
  }
  activate() {
    this.generation++;
    this.active = true;
  }
  isActive() {
    return this.active;
  }
  cancel() {
    for (const request of this.requests) request.abort();
    this.requests.clear();
  }
  dispose() {
    this.active = false;
    this.generation++;
    this.cancel();
  }
  async execute<T>(
    grant: "content:asset:list" | "asset:upload",
    operation: (signal: AbortSignal) => Promise<T>,
    callbacks: {
      done(value: T): void;
      error(cause: unknown): void;
      settled?(): void;
    },
  ): Promise<void> {
    if (!this.active) return;
    const generation = this.generation;
    const controller = new AbortController();
    this.requests.add(controller);
    const current = () =>
      this.active &&
      generation === this.generation &&
      !controller.signal.aborted;
    const verify = async () => {
      controller.signal.throwIfAborted();
      const actual = parseCurrentUser(
        await this.request<unknown>("/auth/me", {
          signal: controller.signal,
          cache: "no-store",
        }),
      );
      controller.signal.throwIfAborted();
      if (
        !actual.permissionKeys.includes("management:portal:enter") ||
        !actual.permissionKeys.includes(grant) ||
        pickerIdentity(actual) !== this.expected ||
        !this.user.permissionKeys.includes(grant)
      )
        throw new AssetPickerError("身份或媒体权限已变化，请重新读取身份");
    };
    try {
      await verify();
      if (!current()) return;
      const value = await operation(controller.signal);
      if (!current()) return;
      await verify();
      if (current()) callbacks.done(value);
    } catch (cause) {
      if (current()) callbacks.error(cause);
    } finally {
      this.requests.delete(controller);
      if (current()) callbacks.settled?.();
    }
  }
}
