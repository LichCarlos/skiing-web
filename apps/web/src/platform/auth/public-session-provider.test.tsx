import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const model = vi.hoisted(() => ({
  pathname: "/knowledge",
  state: {} as Record<string, unknown>,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => [
    typeof initial === "object"
      ? model.state
      : typeof initial === "function"
        ? initial()
        : initial,
    vi.fn(),
  ],
}));
vi.mock("next/navigation", () => ({ usePathname: () => model.pathname }));
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
import {
  PublicSessionProvider,
  usePublicSession,
} from "@/platform/auth/public-session";
import { initialPublicSession } from "@/platform/auth/public-session-model";
import { apiRequest } from "@/platform/api";
import { AccountControl } from "@/features/auth/account-control";
function Child() {
  const session = usePublicSession();
  return createElement(
    "p",
    null,
    session.ready ? (session.user?.nickname ?? "guest") : "hidden",
    " 公共内容",
  );
}
function render(children: ReactNode = createElement(Child)) {
  return renderToStaticMarkup(
    createElement(PublicSessionProvider, null, children),
  );
}
beforeEach(() => {
  model.pathname = "/knowledge";
  model.state = {
    ...initialPublicSession,
    pathname: "/knowledge",
    reading: false,
  };
  vi.clearAllMocks();
});
describe("public session provider render boundaries", () => {
  it("hides the previous route identity before effect cleanup", () => {
    model.state = {
      ...model.state,
      pathname: "/privacy",
      ready: true,
      user: { userId: 7, nickname: "旧账号" },
    };
    const html = render();
    expect(html).not.toContain("旧账号");
    expect(html).toContain("hidden 公共内容");
  });
  it("does not expose an identity while a recheck is in progress", () => {
    model.state = { ...model.state, reading: true, ready: false, user: null };
    const html = render(createElement(AccountControl));
    expect(html).not.toContain("正在确认登录状态");
    expect(html).toContain("登录 / 注册");
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain('name="password"');
  });
  it("disables credential writes while an unknown result can still be checked", () => {
    model.state = { ...model.state, uncertain: true, error: "结果未确认" };
    const html = render(createElement(AccountControl));
    expect(html).not.toContain("<form");
    expect(html).toContain("/login?returnTo=");
    expect(html).toContain(">检查当前会话</button>");
    expect(html).toContain("结果未确认");
  });
  it("renders public children and never starts authentication during SSR", () => {
    model.state = { ...initialPublicSession };
    expect(render()).toContain("公共内容");
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
