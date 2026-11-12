import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionState } from "@/platform/auth/session-model";
const view = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  setters: [] as ReturnType<typeof vi.fn>[],
  clicks: [] as Array<() => void>,
  finish: undefined as
    undefined | ((input: { account: string; password: string }) => void),
  replace: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: (effect: () => void | (() => void)) => view.effects.push(effect),
  useState: (value: unknown) => {
    const setter = vi.fn();
    view.setters.push(setter);
    return [value, setter];
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: view.replace }),
  usePathname: () => "/admin",
}));
vi.mock("antd", () => {
  const form = Object.assign(
    ({
      children,
      onFinish,
    }: {
      children: ReactNode;
      onFinish: typeof view.finish;
    }) => {
      view.finish = onFinish;
      return createElement("form", null, children);
    },
    { Item: ({ children }: { children: ReactNode }) => children },
  );
  const input = Object.assign(() => createElement("input"), {
    Password: () => createElement("input", { type: "password" }),
  });
  return {
    Typography: {
      Text: ({ children }: { children?: import("react").ReactNode }) =>
        createElement("span", null, children),
    },
    App: { useApp: () => ({ message: { error: view.toast } }) },
    Form: form,
    Input: input,
    Button: ({
      children,
      onClick,
    }: {
      children: ReactNode;
      onClick?: () => void;
    }) => {
      if (onClick) view.clicks.push(onClick);
      return createElement("button", null, children);
    },
    Alert: ({ message }: { message: string }) =>
      createElement("p", null, message),
  };
});
vi.mock("@/platform/auth/session-provider", () => ({ useSession: vi.fn() }));
import LoginPage from "@/app/login/page";
import { ManagementGuard } from "@/features/auth/management-guard";
import { useSession } from "@/platform/auth/session-provider";
import { SessionInputError } from "@/platform/auth/session-model";
import { user, deferred } from "@/platform/auth/session-fixtures.test-helper";
import { routes } from "@/config/routes";
function session(
  state: SessionState = {
    status: "anonymous",
    currentUser: null,
    errorMessage: null,
  },
) {
  const actions = {
    signIn: vi.fn(async () => user),
    signOut: vi.fn(async () => {}),
    retryRestore: vi.fn(async () => {}),
  };
  vi.mocked(useSession).mockReturnValue({ session: state, ...actions });
  return actions;
}
function render(mount = false) {
  const html = renderToStaticMarkup(createElement(LoginPage));
  const cleanups = mount ? view.effects.map((effect) => effect()) : [];
  return { html, unmount: () => cleanups.forEach((cleanup) => cleanup?.()) };
}
const input = { account: " Operator ", password: " password " };
beforeEach(() => {
  vi.clearAllMocks();
  view.effects = [];
  view.setters = [];
  view.clicks = [];
  view.finish = undefined;
  session();
});
describe("admin login rendering and event handlers", () => {
  it.each([
    ["login", () => createElement(LoginPage)],
    [
      "guard",
      () => createElement(ManagementGuard, { children: "private content" }),
    ],
  ] as const)(
    "%s offers logout on failed reads but blocks unknown credential writes",
    (_name, element) => {
      for (const canSignOut of [true, false]) {
        view.clicks = [];
        const actions = session({
          status: "unavailable",
          currentUser: null,
          errorMessage: "检查当前会话",
          canSignOut,
        });
        const html = renderToStaticMarkup(element());
        expect(html).not.toContain("private content");
        expect(html.includes("退出")).toBe(canSignOut);
        expect(view.clicks).toHaveLength(canSignOut ? 2 : 1);
        if (canSignOut) {
          view.clicks[1]!();
          expect(actions.signOut).toHaveBeenCalledTimes(1);
        } else expect(actions.signOut).not.toHaveBeenCalled();
      }
    },
  );
  it("does not dispatch credentials or redirects during server rendering", () => {
    const actions = session();
    expect(render().html).toContain('type="password"');
    expect(actions.signIn).not.toHaveBeenCalled();
    expect(view.replace).not.toHaveBeenCalled();
  });
  it.each(["loading", "unavailable"] as const)(
    "hides the credential form while %s",
    (status) => {
      session(
        status === "loading"
          ? { status, currentUser: null, errorMessage: null }
          : { status, currentUser: null, errorMessage: "请检查当前会话" },
      );
      const { html } = render();
      expect(html).not.toContain("<form");
      expect(html).not.toContain('type="password"');
      expect(view.finish).toBeUndefined();
    },
  );
  it("synchronously blocks duplicate submissions before a React rerender", async () => {
    const pending = deferred<typeof user>(),
      actions = session();
    actions.signIn.mockReturnValue(pending.promise);
    render(true);
    view.finish!(input);
    view.finish!(input);
    expect(actions.signIn).toHaveBeenCalledExactlyOnceWith(input);
    pending.resolve(user);
    await vi.waitFor(() =>
      expect(view.setters[0]).toHaveBeenLastCalledWith(false),
    );
    expect(view.replace).not.toHaveBeenCalled();
  });
  it("suppresses late errors and state updates after unmount", async () => {
    const pending = deferred<typeof user>(),
      actions = session();
    actions.signIn.mockReturnValue(pending.promise);
    const page = render(true);
    view.finish!(input);
    page.unmount();
    pending.reject(new SessionInputError("账号或密码错误。"));
    await Promise.resolve();
    await Promise.resolve();
    expect(view.setters[0]).toHaveBeenCalledTimes(1);
    expect(view.setters[1]).toHaveBeenCalledExactlyOnceWith(null);
    view.finish!(input);
    expect(actions.signIn).toHaveBeenCalledTimes(1);
  });
  it.each([
    [new Error("private backend stack"), "登录失败，请检查当前会话后再试。"],
    [new SessionInputError("账号或密码错误。"), "账号或密码错误。"],
  ])("only displays safe login failures", async (error, message) => {
    const actions = session();
    actions.signIn.mockRejectedValue(error);
    render(true);
    view.finish!(input);
    await vi.waitFor(() =>
      expect(view.setters[1]).toHaveBeenLastCalledWith(message),
    );
  });
  it("redirects configured portal permissions without requiring a merchant role", () => {
    session({ status: "authenticated", currentUser: user, errorMessage: null });
    render(true);
    expect(view.replace).toHaveBeenCalledExactlyOnceWith(routes.admin);
    expect(view.finish).toBeUndefined();
  });
  it("does not redirect a role or merchant profile without the portal permission", () => {
    session({
      status: "authenticated",
      currentUser: {
        ...user,
        roles: [{ roleKey: "merchant", roleName: "商家" }],
        merchant: { merchantId: 2, businessName: "雪场" },
        permissionKeys: [],
      },
      errorMessage: null,
    });
    expect(render(true).html).toContain("当前账号未获管理端授权");
    expect(view.replace).not.toHaveBeenCalled();
  });
});
