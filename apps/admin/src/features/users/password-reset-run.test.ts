import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import {
  operator as base,
  account,
} from "@/features/users/user-fixtures.test-helper";
import {
  canResetPasswords,
  passwordResetBody,
  PasswordResetRun,
} from "@/features/users/password-reset-run";
const admin = {
  ...base,
  roles: [{ roleKey: "system_admin", roleName: "管理员" }],
  permissionKeys: [...base.permissionKeys, "system:user:reset-password"],
};
const error = (status: number) =>
  new ApiError("failed", { status, code: null, traceId: null });
function setup() {
  const ports = {
    verify: vi.fn(async () => admin),
    readTarget: vi.fn(async () => account),
    write: vi.fn(
      async (_body: unknown, _signal: AbortSignal): Promise<void> => undefined,
    ),
    saved: vi.fn(async (): Promise<void> => undefined),
    changed: vi.fn(),
  };
  const run = new PasswordResetRun(admin, account, ports);
  run.activate();
  return { run, ports };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
describe("managed password reset without secret persistence or replay", () => {
  it("requires system identity, management entry and the independent grant", () => {
    expect(canResetPasswords(base)).toBe(false);
    expect(canResetPasswords(admin)).toBe(true);
    expect(
      canResetPasswords({
        ...admin,
        permissionKeys: admin.permissionKeys.filter(
          (x) => x !== "system:user:reset-password",
        ),
      }),
    ).toBe(false);
  });
  it("preserves password whitespace and trims only the audit reason", () =>
    expect(passwordResetBody(" password ", " reason ")).toEqual({
      newPassword: " password ",
      reason: "reason",
    }));
  it.each([
    ["short", "reason"],
    ["雪".repeat(25), "reason"],
    ["password", " "],
    ["password", "x".repeat(501)],
  ])("rejects invalid password/reason", (password, reason) =>
    expect(() => passwordResetBody(password, reason)).toThrow(),
  );
  it("checks identity twice, rereads target, then writes once", async () => {
    const { run, ports } = setup();
    expect(await run.submit(" password ", " reason ")).toBe(true);
    expect(ports.verify).toHaveBeenCalledTimes(2);
    expect(ports.write).toHaveBeenCalledExactlyOnceWith(
      { newPassword: " password ", reason: "reason" },
      expect.any(AbortSignal),
    );
    expect(ports.saved).toHaveBeenCalledOnce();
    expect(run.snapshot()).toMatchObject({
      saved: true,
      unknown: false,
      busy: false,
    });
    expect(JSON.stringify(run.snapshot())).not.toContain(" password ");
  });
  it("locks synchronously before target and identity requests", async () => {
    const { run, ports } = setup(),
      gate = deferred();
    ports.verify.mockImplementationOnce(async () => {
      await gate.promise;
      return admin;
    });
    const first = run.submit("password", "reason");
    expect(await run.submit("password", "reason")).toBe(false);
    gate.resolve();
    await first;
    expect(ports.write).toHaveBeenCalledOnce();
  });
  it.each(["account", "grant", "target"])(
    "does not write after %s changes",
    async (mode) => {
      const { run, ports } = setup();
      if (mode === "account")
        ports.verify.mockResolvedValueOnce({ ...admin, userId: 99 });
      if (mode === "grant")
        ports.verify
          .mockResolvedValueOnce(admin)
          .mockResolvedValueOnce({ ...admin, permissionKeys: [] });
      if (mode === "target")
        ports.readTarget.mockResolvedValueOnce({
          ...account,
          account: "different",
        });
      expect(await run.submit("password", "reason")).toBe(false);
      expect(ports.write).not.toHaveBeenCalled();
    },
  );
  it.each([400, 401, 403, 404, 409, 422])(
    "does not mark definitive rejection %s as committed",
    async (status) => {
      const { run, ports } = setup();
      ports.write.mockRejectedValueOnce(error(status));
      expect(await run.submit("password", "reason")).toBe(false);
      expect(run.snapshot()).toMatchObject({ saved: false, unknown: false });
      expect(ports.saved).not.toHaveBeenCalled();
    },
  );
  it.each([0, 408, 500, 503])(
    "requires explicit human review after unknown %s, never retries or infers success from account details",
    async (status) => {
      const { run, ports } = setup();
      ports.write.mockRejectedValueOnce(error(status));
      expect(await run.submit("password", "reason")).toBe(false);
      expect(run.snapshot().unknown).toBe(true);
      expect(await run.submit("password", "reason")).toBe(false);
      expect(ports.write).toHaveBeenCalledOnce();
      expect(ports.readTarget).toHaveBeenCalledOnce();
      run.acknowledge();
      expect(await run.submit("password", "new reason")).toBe(true);
      expect(ports.write).toHaveBeenCalledTimes(2);
    },
  );
  it.each(["verify", "target", "write"])(
    "ignores late %s completion after leaving the workspace",
    async (stage) => {
      const { run, ports } = setup(),
        gate = deferred();
      if (stage === "verify")
        ports.verify.mockImplementationOnce(async () => {
          await gate.promise;
          return admin;
        });
      if (stage === "target")
        ports.readTarget.mockImplementationOnce(async () => {
          await gate.promise;
          return account;
        });
      if (stage === "write")
        ports.write.mockImplementationOnce(() => gate.promise);
      const pending = run.submit("password", "reason");
      await vi.waitFor(() =>
        expect(
          stage === "verify"
            ? ports.verify
            : stage === "target"
              ? ports.readTarget
              : ports.write,
        ).toHaveBeenCalledOnce(),
      );
      const published = ports.changed.mock.calls.length;
      run.dispose();
      gate.resolve();
      expect(await pending).toBe(false);
      expect(ports.saved).not.toHaveBeenCalled();
      expect(ports.changed).toHaveBeenCalledTimes(published);
      run.activate();
      expect(run.snapshot().unknown).toBe(stage === "write");
    },
  );
  it("does not downgrade an acknowledged reset when session UI cleanup fails", async () => {
    const { run, ports } = setup();
    ports.saved.mockRejectedValueOnce(new Error("cleanup"));
    expect(await run.submit("password", "reason")).toBe(true);
    expect(run.snapshot()).toMatchObject({ saved: true, unknown: false });
    expect(ports.write).toHaveBeenCalledOnce();
  });
});
