import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ManagedUserDetail } from "@/features/users/managed-user-detail";
import { apiRequest } from "@/platform/api";
import {
  operator,
  account,
  deferred,
} from "@/features/users/user-fixtures.test-helper";
const hooks = vi.hoisted(() => ({
  effects: [] as (() => void | (() => void))[],
  published: [] as unknown[],
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void)) =>
      hooks.effects.push(effect),
    useState: (initial: unknown) => [
      typeof initial === "function" ? (initial as () => unknown)() : initial,
      (value: unknown) => hooks.published.push(value),
    ],
  };
});
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
vi.mock("@/features/users/user-session", () => ({
  AccountSession: ({
    children,
  }: {
    children: (user: typeof operator) => unknown;
  }) => children(operator),
}));
vi.mock("@/features/users/password-reset-panel", () => ({
  PasswordResetPanel: () => null,
}));
let doc: EventTarget & { visibilityState: string }, win: EventTarget;
beforeEach(() => {
  hooks.effects.length = 0;
  hooks.published.length = 0;
  doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  win = new EventTarget();
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", win);
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
it.each(["visibilitychange", "pagehide"])(
  "clears and cancels detail on %s; late transport cannot publish",
  async (event) => {
    const late = deferred<unknown>();
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(operator)
      .mockReturnValueOnce(late.promise);
    const html = renderToStaticMarkup(
      createElement(ManagedUserDetail, { userId: 7 }),
    );
    expect(html).toContain("刷新账号详情");
    expect(apiRequest).not.toHaveBeenCalled();
    expect(hooks.effects).toHaveLength(1);
    const cleanup = hooks.effects[0]!();
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    const requestSignal = vi.mocked(apiRequest).mock.calls[1]?.[1]?.signal;
    doc.visibilityState = "hidden";
    (event === "pagehide" ? win : doc).dispatchEvent(new Event(event));
    expect(requestSignal?.aborted).toBe(true);
    late.resolve(account);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(hooks.published).toEqual([
      { status: "loading" },
      { status: "loading" },
    ]);
    expect(apiRequest).toHaveBeenCalledTimes(2);
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(apiRequest).toHaveBeenCalledTimes(2);
    if (typeof cleanup === "function") cleanup();
    const count = hooks.published.length;
    win.dispatchEvent(new Event("pagehide"));
    expect(hooks.published).toHaveLength(count);
  },
);
it("does not read private details while mounted in a hidden document", () => {
  doc.visibilityState = "hidden";
  renderToStaticMarkup(createElement(ManagedUserDetail, { userId: 7 }));
  const cleanup = hooks.effects[0]!();
  expect(apiRequest).not.toHaveBeenCalled();
  if (typeof cleanup === "function") cleanup();
});
