import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import KnowledgeConsole from "@/features/project-knowledge/knowledge-console";
import { ProjectKnowledgeForm } from "@/features/project-knowledge/project-knowledge-form";
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
    merchant: { merchantId: 7, businessName: "雪场商家" },
    menuTree: [],
    roles: [{ roleKey: "system_admin", roleName: "运营" }],
    permissionKeys: [
      "management:portal:enter",
      ...["list", "create", "update", "publish", "withdraw", "delete"].map(
        (action) => `content:project-knowledge:${action}`,
      ),
    ],
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
    Input: Object.assign(component, { TextArea: component, Search: component }),
    Spin: component,
    InputNumber: component,
    Switch: component,
    Upload: component,
    Form: Object.assign(component, {
      Item: component,
      useForm: () => [{ resetFields: hooks.reset, setFieldsValue: vi.fn() }],
    }),
  };
});
vi.mock("next/link", () => ({
  default: ({ children }: { children: import("react").ReactNode }) => children,
}));
vi.mock("@/features/assets/asset-image-field", () => ({
  AssetImageField: () => null,
}));
vi.mock("@/features/assets/asset-library", () => ({
  AssetLibrary: () => null,
}));
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
it.each([
  { event: "visibilitychange", form: false },
  { event: "pagehide", form: false },
  { event: "visibilitychange", form: true },
  { event: "pagehide", form: true },
])(
  "cancels project knowledge page reads on $event (form=$form) and suppresses late callbacks",
  async ({ event, form }) => {
    let resolve!: (value: unknown) => void;
    const late = new Promise((resolve_) => {
      resolve = resolve_;
    });
    vi.mocked(apiRequest).mockImplementation(async (path) => {
      if (path === "/auth/me") return hooks.user;
      return late;
    });
    renderToStaticMarkup(
      form
        ? createElement(ProjectKnowledgeForm, { id: 7 })
        : createElement(KnowledgeConsole),
    );
    expect(apiRequest).not.toHaveBeenCalled();
    const cleanup = hooks.effects.map((effect) => effect());
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    const requestSignal = vi.mocked(apiRequest).mock.calls[1]?.[1]?.signal;
    doc.visibilityState = "hidden";
    (event === "pagehide" ? win : doc).dispatchEvent(new Event(event));
    expect(requestSignal?.aborted).toBe(true);
    if (form) expect(hooks.reset).toHaveBeenCalled();
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
it.each([false, true])(
  "does not read while initially hidden (form=%s)",
  (form) => {
    doc.visibilityState = "hidden";
    renderToStaticMarkup(
      form
        ? createElement(ProjectKnowledgeForm, { id: 7 })
        : createElement(KnowledgeConsole),
    );
    const cleanup = hooks.effects.map((effect) => effect());
    expect(apiRequest).not.toHaveBeenCalled();
    expect(JSON.stringify(hooks.published)).toContain("页面读取已暂停");
    for (const clean of cleanup) if (typeof clean === "function") clean();
  },
);

it("keeps a new knowledge form closed while initially hidden", () => {
  doc.visibilityState = "hidden";
  renderToStaticMarkup(createElement(ProjectKnowledgeForm));
  const cleanup = hooks.effects.map((effect) => effect());
  expect(apiRequest).not.toHaveBeenCalled();
  expect(hooks.reset).toHaveBeenCalled();
  expect(JSON.stringify(hooks.published)).toContain("页面读取已暂停");
  for (const clean of cleanup) if (typeof clean === "function") clean();
});
it("cancels initial create authorization and never fills a hidden form late", async () => {
  let resolve!: (value: unknown) => void;
  const late = new Promise((resolve_) => {
    resolve = resolve_;
  });
  vi.mocked(apiRequest).mockImplementation(() => late as never);
  renderToStaticMarkup(createElement(ProjectKnowledgeForm));
  const cleanup = hooks.effects.map((effect) => effect());
  expect(apiRequest).toHaveBeenCalledTimes(1);
  const signal = vi.mocked(apiRequest).mock.calls[0]?.[1]?.signal;
  doc.visibilityState = "hidden";
  win.dispatchEvent(new Event("pagehide"));
  expect(signal?.aborted).toBe(true);
  const published = hooks.published.length;
  resolve(hooks.user);
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(hooks.published).toHaveLength(published);
  for (const clean of cleanup) if (typeof clean === "function") clean();
});
