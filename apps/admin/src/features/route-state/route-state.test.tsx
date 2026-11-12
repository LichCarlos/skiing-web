import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// These fallbacks must remain usable if authentication, API or UI providers fail.
vi.mock("@/platform/api", () => {
  throw new Error("API must not be imported");
});
vi.mock("@/platform/auth/session-provider", () => {
  throw new Error("Session must not be imported");
});
vi.mock("@/components/providers", () => {
  throw new Error("Providers must not be imported");
});
import PageError from "@/app/error";
import GlobalError from "@/app/global-error";
import NotFound from "@/app/not-found";
import ManagementError from "@/app/admin/error";
import Loading from "@/app/admin/loading";

function findButton(
  node: ReactNode,
): ReactElement<{ onClick: () => void }> | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode }>(child)) continue;
    if (child.type === "button")
      return child as ReactElement<{ onClick: () => void }>;
    const nested =
      typeof child.type === "function"
        ? (child.type as (props: unknown) => ReactNode)(child.props)
        : child.props.children;
    const button = findButton(nested);
    if (button) return button;
  }
}

describe("admin route recovery", () => {
  it.each([
    new Error("private-password-and-token"),
    "private-password-and-token",
    {
      get message() {
        throw new Error("must not inspect thrown values");
      },
      get digest() {
        throw new Error("must not inspect digests");
      },
    },
  ])(
    "renders safe route and root recovery for any thrown value %#",
    (error) => {
      const retry = vi.fn();
      for (const Component of [PageError, GlobalError, ManagementError]) {
        const html = renderToStaticMarkup(
          <Component error={error} retry={retry} />,
        );
        expect(html).toContain("管理页面暂时无法显示");
        expect(html).toContain('name="robots" content="noindex, nofollow"');
        expect(html).not.toContain("private-password-and-token");
        expect(html).not.toContain("<form");
        expect(html).not.toContain("data-testid");
      }
      expect(retry).not.toHaveBeenCalled();
    },
  );

  it("calls only the framework retry callback on explicit activation", () => {
    const retry = vi.fn(),
      reset = vi.fn();
    const props = { error: new Error("private"), retry, reset };
    const button = findButton(PageError(props));
    expect(button).toBeDefined();
    expect(retry).not.toHaveBeenCalled();
    button!.props.onClick();
    expect(retry).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });

  it("renders a complete root error document without layout or providers", () => {
    const element = GlobalError({ error: null, retry: vi.fn() });
    expect(element.type).toBe("html");
    const html = renderToStaticMarkup(element);
    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain("<head>");
    expect(html).toMatch(/charset="utf-8"/i);
    expect(html).toContain(
      'name="viewport" content="width=device-width, initial-scale=1"',
    );
    expect(html).toContain("<title>");
    expect(html).toContain("<body");
    expect(html).toContain('href="/admin"');
    expect(html).not.toContain("__next_error__");
  });

  it("uses a document navigation to a known safe recovery destination", () => {
    const html = renderToStaticMarkup(
      <PageError error={null} retry={vi.fn()} />,
    );
    expect(html).toContain("<a ");
    expect(html).toContain('href="/admin"');
    expect(html).toContain("返回工作台");
    expect(html).not.toContain("returnTo");
    expect(html).not.toContain("/api/");
    expect(html).toContain("请先返回对应列表核对结果");
  });

  it("provides a noindex missing-page recovery without making entity or permission claims", () => {
    const html = renderToStaticMarkup(<NotFound />);
    expect(html).toContain("未找到此页面");
    expect(html).toContain('href="/admin"');
    expect(html).toContain('name="robots" content="noindex, nofollow"');
    expect(html).not.toContain("<button");
    expect(html).not.toContain("private");
    expect(html).toContain("当前账号可用的功能");
  });

  it("keeps the management segment boundary independent of session and UI contexts", () => {
    const retry = vi.fn();
    const html = renderToStaticMarkup(
      <ManagementError error={undefined} retry={retry} />,
    );
    expect(html).toContain("管理页面暂时无法显示");
    expect(html).not.toContain("<nav");
    expect(html).not.toContain("退出");
    findButton(ManagementError({ error: undefined, retry }))!.props.onClick();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("exposes an accessible neutral loading status without private account data", () => {
    const html = renderToStaticMarkup(<Loading />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("正在加载管理页面");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<a");
    expect(html).not.toContain("system_admin");
    expect(html).not.toContain("商家");
  });
});
