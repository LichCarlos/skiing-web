import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import RoleConsole from "@/features/roles/role-console";
import RoleAuthorizationConsole from "@/features/roles/role-authorization-console";
import { apiRequest } from "@/platform/api";
const hooks = vi.hoisted(() => ({
  effects: [] as (() => void | (() => void))[],
  published: [] as unknown[],
  reset: vi.fn(),
  user: {
    userId: 1,
    account: "admin",
    nickname: "管理员",
    avatarUrl: null,
    merchant: null,
    roles: [{ roleKey: "system_admin", roleName: "管理员" }],
    menuTree: [],
    permissionKeys: [
      "management:portal:enter",
      "system:role:list",
      "system:permission:assign",
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
    App: { useApp: () => ({ message: { error: vi.fn(), success: vi.fn() } }) },
    Button: component,
    Descriptions: component,
    Modal: component,
    Popconfirm: component,
    Select: component,
    Space: component,
    Table: component,
    Tag: component,
    Checkbox: component,
    Spin: component,
    Tree: component,
    Typography: { Text: component },
    Input: Object.assign(component, { Search: component, TextArea: component }),
    Form: Object.assign(component, {
      Item: component,
      useForm: () => [{ resetFields: hooks.reset }],
    }),
  };
});
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
vi.mock("@/platform/auth/session-provider", () => ({
  useSession: () => ({ retryRestore: vi.fn() }),
}));
vi.mock("@/features/roles/role-session", () => ({
  RoleSession: ({
    children,
  }: {
    children: (user: typeof hooks.user) => unknown;
  }) => children(hooks.user),
  RoleRecovery: () => null,
  useRoleWrite: () => ({
    saving: false,
    pending: false,
    gate: { isLocked: () => false, isRunning: () => false },
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
const render = (page: string) =>
  renderToStaticMarkup(
    page === "authorization"
      ? createElement(RoleAuthorizationConsole, { roleId: 7 })
      : createElement(RoleConsole, page === "detail" ? { roleId: 7 } : {}),
  );
it.each(["list", "detail", "authorization"])(
  "cancels %s and clears private state on hide, suppressing late responses",
  async (page) => {
    let resolve!: (value: unknown) => void;
    const late = new Promise((resolve_) => {
      resolve = resolve_;
    });
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(hooks.user)
      .mockReturnValue(late);
    render(page);
    expect(apiRequest).not.toHaveBeenCalled();
    const cleanup = hooks.effects[0]!();
    await vi.waitFor(() =>
      expect(apiRequest).toHaveBeenCalledTimes(
        page === "authorization" ? 4 : 2,
      ),
    );
    const readSignal = vi.mocked(apiRequest).mock.calls[1]?.[1]?.signal;
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(readSignal?.aborted).toBe(true);
    const published = hooks.published.length;
    resolve({ private: "late" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(hooks.published).toHaveLength(published);
    expect(JSON.stringify(hooks.published)).not.toContain("late");
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(apiRequest).toHaveBeenCalledTimes(page === "authorization" ? 4 : 2);
    if (typeof cleanup === "function") cleanup();
    win.dispatchEvent(new Event("pagehide"));
    expect(hooks.published).toHaveLength(published);
  },
);
it.each(["list", "detail", "authorization"])(
  "refuses hidden %s mount and clears on pagehide",
  (page) => {
    doc.visibilityState = "hidden";
    render(page);
    const cleanup = hooks.effects[0]!();
    expect(apiRequest).not.toHaveBeenCalled();
    win.dispatchEvent(new Event("pagehide"));
    expect(hooks.published.length).toBeGreaterThan(0);
    if (typeof cleanup === "function") cleanup();
  },
);
