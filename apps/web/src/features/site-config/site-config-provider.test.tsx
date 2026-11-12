import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const model = vi.hoisted(() => ({
  pathname: "/terms",
  state: {
    pathname: "/privacy",
    data: {
      siteName: "旧品牌",
      tagline: "旧标语",
      about: null,
      contactEmail: null,
      privacyPolicy: "旧隐私正文",
      termsOfService: "旧协议正文",
      revision: "a".repeat(64),
    },
    loading: false,
    error: false,
  },
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    // The data state is seeded to reproduce a route render before effect cleanup.
    if (typeof initial === "object") return [model.state, vi.fn()];
    return [typeof initial === "function" ? initial() : initial, vi.fn()];
  },
}));
vi.mock("next/navigation", () => ({ usePathname: () => model.pathname }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children?: ReactNode; href: string }) =>
    createElement("a", { href }, children),
}));
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
import {
  PolicyPage,
  SiteConfigProvider,
} from "@/features/site-config/site-config";
beforeEach(() => {
  model.pathname = "/terms";
});
describe("policy provider route projection (effect timing simulated)", () => {
  it("does not display the previous path's policy before effects run", () => {
    const html = renderToStaticMarkup(
      createElement(
        SiteConfigProvider,
        null,
        createElement(PolicyPage, {
          kind: "termsOfService",
          title: "用户协议",
        }),
      ),
    );
    expect(html).not.toContain("旧协议正文");
    expect(html).toContain("正在加载平台信息");
  });
});
