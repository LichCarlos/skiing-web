import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DictionaryConsole } from "@/features/dictionaries/dictionary-console";
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
    roles: [{ roleKey: "custom", roleName: "运营" }],
    permissionKeys: [
      "management:portal:enter",
      "system:dict:list",
      "system:dict:create",
      "system:dict:update",
      "system:dict:delete",
    ],
  },
}));
const type = {
  dictType: "test.tags",
  dictName: "标签",
  groupKey: "test",
  status: "active",
  publiclyReadable: false,
  items: [],
};
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
  const form = {
    resetFields: hooks.reset,
    setFieldsValue: vi.fn(),
    getFieldValue: vi.fn(),
  };
  return {
    App: { useApp: () => ({ message: { error: vi.fn(), success: vi.fn() } }) },
    Button: component,
    Modal: component,
    Popconfirm: component,
    Select: component,
    TreeSelect: component,
    Space: component,
    Table: component,
    Tag: component,
    Typography: { Text: component },
    Input: component,
    InputNumber: component,
    Switch: component,
    Form: Object.assign(component, { Item: component, useForm: () => [form] }),
  };
});
vi.mock("next/link", () => ({
  default: ({ children }: { children: import("react").ReactNode }) => children,
}));
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
vi.mock("@/platform/auth/session-provider", () => ({
  useSession: () => ({
    session: { status: "authenticated", currentUser: hooks.user },
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
it.each([
  { event: "visibilitychange", detail: false },
  { event: "pagehide", detail: false },
  { event: "visibilitychange", detail: true },
  { event: "pagehide", detail: true },
])(
  "cancels dictionary reads and clears forms on $event (detail=$detail)",
  async ({ event, detail }) => {
    let resolve!: (value: unknown) => void;
    const late = new Promise((resolve_) => {
      resolve = resolve_;
    });
    vi.mocked(apiRequest).mockImplementation(async (path) =>
      path === "/auth/me" ? hooks.user : late,
    );
    renderToStaticMarkup(
      createElement(
        DictionaryConsole,
        detail ? { initialDictType: type.dictType } : {},
      ),
    );
    const cleanup = hooks.effects.map((effect) => effect());
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    const signal = vi.mocked(apiRequest).mock.calls[1]?.[1]?.signal;
    doc.visibilityState = "hidden";
    (event === "pagehide" ? win : doc).dispatchEvent(new Event(event));
    expect(signal?.aborted).toBe(true);
    expect(hooks.reset).toHaveBeenCalledTimes(2);
    const count = hooks.published.length;
    resolve(
      detail
        ? type
        : { page: 1, pageSize: 20, total: 1, hasNext: false, items: [type] },
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(hooks.published).toHaveLength(count);
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(apiRequest).toHaveBeenCalledTimes(2);
    for (const clean of cleanup) if (typeof clean === "function") clean();
    win.dispatchEvent(new Event("pagehide"));
    expect(hooks.published).toHaveLength(count);
  },
);
it.each([false, true])(
  "pauses initially hidden dictionary pages (detail=%s)",
  (detail) => {
    doc.visibilityState = "hidden";
    renderToStaticMarkup(
      createElement(
        DictionaryConsole,
        detail ? { initialDictType: type.dictType } : {},
      ),
    );
    const cleanup = hooks.effects.map((effect) => effect());
    expect(apiRequest).not.toHaveBeenCalled();
    expect(hooks.reset).toHaveBeenCalledTimes(2);
    for (const clean of cleanup) if (typeof clean === "function") clean();
  },
);
