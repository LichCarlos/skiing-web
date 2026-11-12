import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PermissionCatalogConsole from "@/features/permissions/catalog-console";
import { apiRequest } from "@/platform/api";
const hooks = vi.hoisted(() => ({
  effects: [] as (() => void | (() => void))[],
  published: [] as unknown[],
  reset: vi.fn(),
  user: {
    userId: 7,
    account: "operator",
    nickname: "运营",
    avatarUrl: null,
    merchant: null,
    menuTree: [],
    roles: [{ roleKey: "custom_operator", roleName: "运营" }],
    permissionKeys: ["management:portal:enter", "system:permission:list"],
  },
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
  const component = ({ children }: { children?: import("react").ReactNode }) =>
    createElement("div", null, children);
  return {
    Typography: {
      Text: ({ children }: { children?: import("react").ReactNode }) =>
        createElement("span", null, children),
    },
    App: { useApp: () => ({ message: { error: vi.fn(), success: vi.fn() } }) },
    Button: component,
    Modal: component,
    Popconfirm: component,
    Select: component,
    Space: component,
    Table: component,
    Tag: component,
    Input: component,
    InputNumber: component,
    Switch: component,
    Form: Object.assign(component, {
      Item: component,
      useForm: () => [{ resetFields: hooks.reset }],
    }),
  };
});
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
vi.mock("@/platform/auth/session-provider", () => ({
  useSession: () => ({
    session: { status: "authenticated", currentUser: hooks.user },
    retryRestore: vi.fn(),
  }),
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
  "cancels private catalog read on %s and suppresses late callbacks",
  async (event) => {
    let resolve!: (value: unknown) => void;
    const late = new Promise((resolve_) => {
      resolve = resolve_;
    });
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(hooks.user)
      .mockReturnValueOnce(late);
    renderToStaticMarkup(createElement(PermissionCatalogConsole));
    expect(apiRequest).not.toHaveBeenCalled();
    const cleanup = hooks.effects.map((effect) => effect());
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    const requestSignal = vi.mocked(apiRequest).mock.calls[1]?.[1]?.signal;
    doc.visibilityState = "hidden";
    (event === "pagehide" ? win : doc).dispatchEvent(new Event(event));
    expect(requestSignal?.aborted).toBe(true);
    expect(hooks.reset).toHaveBeenCalled();
    const published = hooks.published.length;
    resolve([{ secret: "late" }]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(hooks.published).toHaveLength(published);
    expect(JSON.stringify(hooks.published)).not.toContain("late");
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(apiRequest).toHaveBeenCalledTimes(2);
    for (const clean of cleanup) if (typeof clean === "function") clean();
    win.dispatchEvent(new Event("pagehide"));
    expect(hooks.published).toHaveLength(published);
  },
);
it("does not read while initially hidden", () => {
  doc.visibilityState = "hidden";
  renderToStaticMarkup(createElement(PermissionCatalogConsole));
  const cleanup = hooks.effects.map((effect) => effect());
  expect(apiRequest).not.toHaveBeenCalled();
  for (const clean of cleanup) if (typeof clean === "function") clean();
});
