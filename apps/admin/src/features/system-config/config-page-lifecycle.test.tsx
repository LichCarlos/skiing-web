import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { ConfigList } from "@/features/system-config/config-list";
import { ConfigEditor } from "@/features/system-config/config-editor";
import {
  ConfigRecoveryLedger,
  ConfigWriteGate,
} from "@/features/system-config/config-workflow";
import {
  operator,
  item,
} from "@/features/system-config/config-fixtures.test-helper";
import type { ConfigWrites } from "@/features/system-config/config-session";
import { apiRequest } from "@/platform/api";
const hooks = vi.hoisted(() => ({
  effects: [] as (() => void | (() => void))[],
  published: [] as unknown[],
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
    Alert: component,
    Button: component,
    Space: component,
    Modal: component,
    Table: component,
    Input: Object.assign(component, { TextArea: component }),
  };
});
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
vi.mock("@/platform/auth/session-provider", () => ({
  useSession: () => ({
    session: { status: "authenticated", currentUser: operator },
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
function render(editor: boolean) {
  const ledger = new ConfigRecoveryLedger(),
    gate = new ConfigWriteGate(operator, async () => operator, ledger, vi.fn());
  gate.activate();
  const writes: ConfigWrites = {
    saving: false,
    pending: false,
    entries: [],
    version: 0,
    ledger,
    gate,
    run: gate.run.bind(gate),
  };
  return renderToStaticMarkup(
    editor
      ? createElement(ConfigEditor, {
          operator,
          configKey: item.configKey,
          writes,
          close: vi.fn(),
          saved: vi.fn(),
        })
      : createElement(ConfigList),
  );
}
it.each([
  { event: "visibilitychange", editor: false },
  { event: "pagehide", editor: false },
  { event: "visibilitychange", editor: true },
  { event: "pagehide", editor: true },
])(
  "clears configuration reads/input on $event (editor=$editor) and ignores late results",
  async ({ event, editor }) => {
    let resolve!: (value: unknown) => void;
    const late = new Promise((resolve_) => {
      resolve = resolve_;
    });
    vi.mocked(apiRequest).mockImplementation(async (path) =>
      path === "/auth/me" ? operator : late,
    );
    render(editor);
    const cleanup = hooks.effects.map((effect) => effect());
    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    const signal = vi.mocked(apiRequest).mock.calls[1]?.[1]?.signal;
    doc.visibilityState = "hidden";
    (event === "pagehide" ? win : doc).dispatchEvent(new Event(event));
    expect(signal?.aborted).toBe(true);
    expect(JSON.stringify(hooks.published)).toContain("页面读取已暂停");
    const count = hooks.published.length;
    resolve({
      items: [item],
      total: 1,
      page: 1,
      pageSize: editor ? 100 : 20,
      hasNext: false,
    });
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
  "does not query while initially hidden (editor=%s)",
  (editor) => {
    doc.visibilityState = "hidden";
    render(editor);
    const cleanup = hooks.effects.map((effect) => effect());
    expect(apiRequest).not.toHaveBeenCalled();
    expect(JSON.stringify(hooks.published)).toContain("页面读取已暂停");
    for (const clean of cleanup) if (typeof clean === "function") clean();
  },
);
