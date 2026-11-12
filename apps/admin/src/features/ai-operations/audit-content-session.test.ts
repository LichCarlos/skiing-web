import { describe, expect, it, vi } from "vitest";
import {
  AuditContentSession,
  type AuditContentState,
} from "@/features/ai-operations/audit-content-session";
import { auditContent } from "@/features/ai-operations/audit-fixtures.test-helper";
import { deferred } from "@/platform/auth/session-fixtures.test-helper";
describe("AI audit content page lifecycle", () => {
  it("does not read before activation or while hidden; invalid reasons never dispatch", async () => {
    const request = vi.fn().mockResolvedValue(auditContent),
      changed = vi.fn();
    const session = new AuditContentSession(request, changed);
    expect(await session.read("review")).toBe(false);
    session.activate(false);
    expect(await session.read("review")).toBe(false);
    session.setVisible(true);
    expect(await session.read(" ")).toBe(false);
    expect(request).not.toHaveBeenCalled();
    expect(changed).toHaveBeenLastCalledWith({
      busy: false,
      error: "操作原因须为 1–500 字",
    });
  });
  it("takes the synchronous lock, publishes only one result and clears on explicit action", async () => {
    const pending = deferred<typeof auditContent>(),
      request = vi.fn(() => pending.promise),
      changed = vi.fn();
    const session = new AuditContentSession(request, changed);
    session.activate(true);
    const first = session.read(" review ");
    expect(await session.read("second")).toBe(false);
    expect(request).toHaveBeenCalledExactlyOnceWith(
      "review",
      expect.any(AbortSignal),
    );
    pending.resolve(auditContent);
    expect(await first).toBe(true);
    expect(changed).toHaveBeenLastCalledWith({
      busy: false,
      content: auditContent,
    });
    session.clear();
    expect(changed).toHaveBeenLastCalledWith({ busy: false });
  });
  it.each(["hide", "clear", "dispose"] as const)(
    "discards late success after %s and releases only the original operation",
    async (action) => {
      const pending = deferred<typeof auditContent>(),
        request = vi.fn(() => pending.promise),
        states: AuditContentState[] = [];
      const session = new AuditContentSession(request, (state) =>
        states.push(state),
      );
      const dispose = session.activate(true);
      const task = session.read("review");
      if (action === "hide") session.setVisible(false);
      else if (action === "clear") session.clear();
      else dispose();
      expect(request.mock.calls).toHaveLength(1);
      if (action === "dispose") session.activate(true);
      else session.setVisible(true);
      expect(await session.read("other")).toBe(false);
      pending.resolve(auditContent);
      expect(await task).toBe(false);
      expect(states.every((state) => !state.content)).toBe(true);
      expect(states.at(-1)).toEqual({ busy: false });
    },
  );
  it("suppresses old errors/finalizers and cleanup cannot dispose a newer activation", async () => {
    const pending = deferred<typeof auditContent>(),
      changed = vi.fn<(state: AuditContentState) => void>(),
      request = vi.fn(() => pending.promise);
    const session = new AuditContentSession(request, changed),
      oldDispose = session.activate(true);
    const task = session.read("review");
    oldDispose();
    session.activate(true);
    oldDispose();
    pending.reject(new Error("private-old-error"));
    expect(await task).toBe(false);
    expect(
      changed.mock.calls.every(([state]) => !state.error && !state.content),
    ).toBe(true);
    request.mockResolvedValue(auditContent);
    expect(await session.read("new review")).toBe(true);
  });
  it("clears previously visible content on page hide without automatic read on return", async () => {
    const request = vi.fn().mockResolvedValue(auditContent),
      changed = vi.fn();
    const session = new AuditContentSession(request, changed);
    session.activate(true);
    await session.read("review");
    session.setVisible(false);
    expect(changed).toHaveBeenLastCalledWith({ busy: false });
    session.setVisible(true);
    expect(request).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenLastCalledWith({ busy: false });
  });
  it("shows a fixed error and releases the gate after unknown outcomes without replay", async () => {
    const request = vi
        .fn()
        .mockRejectedValue(new Error("private-provider-key")),
      changed = vi.fn();
    const session = new AuditContentSession(request, changed);
    session.activate(true);
    expect(await session.read("review")).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenLastCalledWith({
      busy: false,
      error: "请求暂时不可用；如已提交命令，请先核对结果，不会自动重试",
    });
  });
});
