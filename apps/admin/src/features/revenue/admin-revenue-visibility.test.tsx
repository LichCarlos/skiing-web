import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { AdminRevenueVisibility } from "@/features/revenue/admin-revenue-visibility";
import {
  operator,
  deferred,
} from "@/features/revenue/merchant-revenue-fixtures.test-helper";
import { apiRequest } from "@/platform/api";
const hooks = vi.hoisted(() => ({
  effects: [] as (() => void | (() => void))[],
  published: [] as unknown[],
  resume: undefined as undefined | (() => void),
}));
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
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
vi.mock("antd", async () => {
  const { createElement } = await import("react");
  return {
    Typography: {
      Text: ({ children }: { children?: import("react").ReactNode }) =>
        createElement("span", null, children),
    },
    Button: ({
      onClick,
      children,
    }: {
      onClick: () => void;
      children: import("react").ReactNode;
    }) => {
      hooks.resume = onClick;
      return createElement("button", null, children);
    },
  };
});
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
const actor = {
  ...operator,
  merchant: null,
  permissionKeys: ["management:portal:enter", "revenue:system:list"],
};
let doc: EventTarget & { visibilityState: string }, win: EventTarget;
beforeEach(() => {
  hooks.effects = [];
  hooks.published = [];
  hooks.resume = undefined;
  doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  win = new EventTarget();
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", win);
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
function render() {
  const children = vi.fn(() => createElement("p", null, "private revenue"));
  const html = renderToStaticMarkup(
    createElement(AdminRevenueVisibility, { actor, children }),
  );
  expect(html).not.toContain("private revenue");
  return { children, cleanup: hooks.effects.map((effect) => effect()) };
}
it.each(["visibilitychange", "pagehide"])(
  "aborts lifetime and discards the content subtree on %s; focus does not resume",
  (event) => {
    const { children, cleanup } = render(),
      signal = hooks.published.find(
        (value) => value instanceof AbortSignal,
      ) as AbortSignal;
    expect(signal.aborted).toBe(false);
    doc.visibilityState = "hidden";
    (event === "pagehide" ? win : doc).dispatchEvent(new Event(event));
    expect(signal.aborted).toBe(true);
    expect(hooks.published).toContain(undefined);
    const count = hooks.published.length;
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(hooks.published).toHaveLength(count);
    expect(apiRequest).not.toHaveBeenCalled();
    expect(children).not.toHaveBeenCalled();
    for (const clean of cleanup) if (typeof clean === "function") clean();
  },
);
it("waits for explicit resume when opened in a hidden document", () => {
  doc.visibilityState = "hidden";
  const { cleanup } = render();
  expect(hooks.published.some((value) => value instanceof AbortSignal)).toBe(
    false,
  );
  expect(apiRequest).not.toHaveBeenCalled();
  for (const clean of cleanup) if (typeof clean === "function") clean();
});
it("aborts active work and removes listeners on unmount", () => {
  const { cleanup } = render(),
    signal = hooks.published.find(
      (value) => value instanceof AbortSignal,
    ) as AbortSignal;
  for (const clean of cleanup) if (typeof clean === "function") clean();
  expect(signal.aborted).toBe(true);
  const count = hooks.published.length;
  win.dispatchEvent(new Event("pagehide"));
  expect(hooks.published).toHaveLength(count);
});
it("does not restore hidden content after late identity verification", async () => {
  const wait = deferred<unknown>();
  vi.mocked(apiRequest).mockImplementation(async () => wait.promise);
  const { cleanup } = render();
  hooks.resume?.();
  await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
  doc.visibilityState = "hidden";
  win.dispatchEvent(new Event("pagehide"));
  const count = hooks.published.length;
  wait.resolve(actor);
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(hooks.published).toHaveLength(count);
  for (const clean of cleanup) if (typeof clean === "function") clean();
});
it("revalidates identity before creating a fresh page lifetime", async () => {
  vi.mocked(apiRequest).mockResolvedValue(actor);
  const { cleanup } = render();
  win.dispatchEvent(new Event("pagehide"));
  const count = hooks.published.filter(
    (value) => value instanceof AbortSignal,
  ).length;
  hooks.resume?.();
  await vi.waitFor(() =>
    expect(
      hooks.published.filter((value) => value instanceof AbortSignal),
    ).toHaveLength(count + 1),
  );
  expect(apiRequest).toHaveBeenCalledWith(
    "/auth/me",
    expect.objectContaining({
      cache: "no-store",
      signal: expect.any(AbortSignal),
    }),
  );
  for (const clean of cleanup) if (typeof clean === "function") clean();
});
