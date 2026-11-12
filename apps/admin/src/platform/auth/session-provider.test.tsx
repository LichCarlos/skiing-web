import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("@/platform/auth/session", () => ({
  login: vi.fn(),
  logout: vi.fn(),
  restoreSession: vi.fn(),
}));
import { SessionProvider, useSession } from "@/platform/auth/session-provider";
import { login, logout, restoreSession } from "@/platform/auth/session";
function Child() {
  const { session } = useSession();
  return createElement(
    "p",
    null,
    session.status,
    session.currentUser?.account ?? "",
  );
}
it("renders a private-free loading state without making authentication requests during SSR", () => {
  expect(
    renderToStaticMarkup(
      createElement(SessionProvider, null, createElement(Child)),
    ),
  ).toBe("<p>loading</p>");
  for (const request of [login, logout, restoreSession])
    expect(request).not.toHaveBeenCalled();
});
