import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PolicyBody,
  type SiteConfig,
} from "@/features/site-config/site-config";
const data: SiteConfig = {
  siteName: "雪客",
  tagline: "滑雪平台",
  about: null,
  contactEmail: null,
  privacyPolicy: null,
  termsOfService: null,
  revision: "a".repeat(64),
};
describe("Public policy content", () => {
  it("shows explicit unpublished policy instead of fabricated legal content", () => {
    expect(
      renderToStaticMarkup(
        createElement(PolicyBody, { data, kind: "privacyPolicy" }),
      ),
    ).toContain("尚未发布正式内容");
  });
  it("shows missing introduction and contact data explicitly", () => {
    const html = renderToStaticMarkup(
      createElement(PolicyBody, { data, kind: "about" }),
    );
    expect(html).toContain("平台介绍尚未配置");
    expect(html).toContain("联系邮箱");
  });
  it("renders policy markup as escaped text and preserves line breaks", () => {
    const html = renderToStaticMarkup(
      createElement(PolicyBody, {
        data: { ...data, privacyPolicy: "<script>alert(1)</script>\n第二段" },
        kind: "privacyPolicy",
      }),
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("\n第二段");
  });
  it("links only the configured contact email using mailto", () => {
    const html = renderToStaticMarkup(
      createElement(PolicyBody, {
        data: { ...data, contactEmail: "ski@example.com" },
        kind: "about",
      }),
    );
    expect(html).toContain("mailto:ski%40example.com");
  });
});
