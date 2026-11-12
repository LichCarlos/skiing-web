import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialPublicSession } from "@/platform/auth/public-session-model";

const model = vi.hoisted(() => ({ session: {} as Record<string, unknown> }));
vi.mock("@/platform/auth/public-session", () => ({
  usePublicSession: () => model.session,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/features/auth/assets/ski-chamonix.jpg", () => ({
  default: { src: "/ski.jpg", width: 1440, height: 1080 },
}));
import { AuthPage } from "@/features/auth/auth-page";
beforeEach(() => {
  model.session = {
    ...initialPublicSession,
    reading: false,
    ready: true,
    login: vi.fn(),
    logout: vi.fn(),
    restore: vi.fn(),
  };
});

describe("dedicated public account page", () => {
  it("renders one accessible login form, legal links, photo credit and Waves", () => {
    const html = renderToStaticMarkup(createElement(AuthPage));
    expect(html.match(/<form/g)).toHaveLength(1);
    expect(html).toContain('data-mode="login"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain('autoComplete="username"');
    expect(html).toContain('aria-label="显示密码"');
    expect(html).toContain("Webwizzard");
    expect(html).toContain('media="(min-width: 850px)"');
    expect(html).toContain('aria-hidden="true" data-auth-background');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain("暂停背景动效");
    expect(html).toMatch(
      /第一次来？<\/span><button type="button">立即注册<\/button><\/p><\/form>/,
    );
    expect(html).not.toContain('aria-label="切换到注册"');
    expect(html).not.toContain('viewBox="0 0 1024 1024"');
    expect(html).not.toContain('aria-label="账号操作"');
    expect(html).not.toContain("记住密码");
    expect(html).not.toContain("扫码登录");
  });
  it("renders existing register DTO inputs, not fake email/OAuth controls", () => {
    const html = renderToStaticMarkup(
      createElement(AuthPage, { initialMode: "register" }),
    );
    expect(html).toContain('data-mode="register"');
    expect(html).toContain('name="nickname"');
    expect(html).toContain('name="confirmPassword"');
    expect(html).not.toContain('viewBox="0 0 1024 1024"');
    expect(html).toContain('autoComplete="new-password"');
    expect(html).toContain("注册后需要手动登录");
    expect(html).toMatch(
      /<button type="button">老朋友去登录<\/button><\/p><\/form>/,
    );
    expect(html).not.toContain('aria-label="切换到登录"');
    expect(html).not.toContain("第一次来？");
    expect(html).not.toContain('type="email"');
  });
  it("disables the text switch while an account request is pending", () => {
    model.session = { ...model.session, busy: true };
    for (const initialMode of ["login", "register"] as const) {
      const html = renderToStaticMarkup(
        createElement(AuthPage, { initialMode }),
      );
      expect(html).toMatch(
        /<button type="button" disabled="">(?:立即注册|老朋友去登录)<\/button>/,
      );
    }
  });
  it("blocks submitting while session result is unknown and provides manual recovery", () => {
    model.session = {
      ...model.session,
      ready: false,
      uncertain: true,
      error: "结果未确认",
    };
    const html = renderToStaticMarkup(createElement(AuthPage));
    expect(html).toMatch(/type="submit" disabled=""/);
    expect(html).toContain("检查当前会话");
    expect(html).toContain('role="alert"');
  });
  it("keeps session checking text out of both forms while credential controls remain blocked", () => {
    model.session = { ...model.session, ready: false, reading: true };
    for (const initialMode of ["login", "register"] as const) {
      const html = renderToStaticMarkup(
        createElement(AuthPage, { initialMode }),
      );
      expect(html).not.toContain("正在确认登录状态");
      expect(html).toMatch(/type="submit" disabled=""/);
      expect(html).toContain('href="/terms"');
      expect(html).toContain('href="/privacy"');
    }
  });
});
