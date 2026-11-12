import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { AccountControl } from "@/features/auth/account-control";
import { user } from "@/platform/auth/public-session-fixtures.test-helper";
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/me" }));
const state = vi.hoisted(() => ({
  ready: true,
  user: null as unknown,
  error: null,
}));
vi.mock("@/platform/auth/public-session", () => ({
  usePublicSession: () => state,
}));
it("places only the personal center entry in authenticated navigation", () => {
  state.user = user;
  const html = renderToStaticMarkup(<AccountControl />);
  expect(html).toContain("个人中心");
  expect(html).toContain('href="/me"');
  expect(html).not.toContain(user.nickname);
  expect(html).not.toContain("退出登录");
  state.user = null;
  expect(renderToStaticMarkup(<AccountControl />)).toContain("登录 / 注册");
});
