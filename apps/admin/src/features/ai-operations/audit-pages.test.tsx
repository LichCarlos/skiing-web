import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { useSession } from "@/platform/auth/session-provider";
import { apiRequest } from "@/platform/api";
import { AuditConsole } from "@/features/ai-operations/audit-console";
import { AiOperationSession } from "@/features/ai-operations/session";
import {
  auditor,
  summary,
} from "@/features/ai-operations/audit-fixtures.test-helper";
import {
  loadingSession,
  type SessionState,
} from "@/platform/auth/session-model";
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
vi.mock("@/platform/auth/session-provider", () => ({ useSession: vi.fn() }));
afterEach(() => vi.resetAllMocks());
function session(value: SessionState) {
  vi.mocked(useSession).mockReturnValue({
    session: value,
    retryRestore: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  });
}
it.each<SessionState>([
  loadingSession,
  { status: "anonymous", currentUser: null, errorMessage: null },
  { status: "unavailable", currentUser: null, errorMessage: "private-error" },
  {
    status: "authenticated",
    currentUser: { ...auditor, permissionKeys: [] },
    errorMessage: null,
  },
])(
  "SSR keeps unauthorized/unavailable audit data out of the page %j",
  (value) => {
    session(value);
    const html = renderToStaticMarkup(
      createElement(AuditConsole, { id: summary.conversationId }),
    );
    expect(html).not.toContain("<form");
    expect(html).not.toContain("private-");
    expect(html).not.toContain("读取正文原因");
    expect(apiRequest).not.toHaveBeenCalled();
  },
);
it("SSR renders the real list/detail loading shell without issuing audited reads", () => {
  session({
    status: "authenticated",
    currentUser: auditor,
    errorMessage: null,
  });
  expect(renderToStaticMarkup(createElement(AuditConsole))).toContain(
    "AI 会话审计",
  );
  const html = renderToStaticMarkup(
    createElement(AuditConsole, { id: summary.conversationId }),
  );
  expect(html).toContain("AI 会话审计详情");
  expect(html).toContain("重新读取身份");
  expect(html).not.toContain("读取正文原因");
  expect(apiRequest).not.toHaveBeenCalled();
});
it("normalizes page identity, strips extra properties and remounts when account/grants change", () => {
  session({
    status: "authenticated",
    currentUser: auditor,
    errorMessage: null,
  });
  const props = {
    kind: "audit" as const,
    target: "list",
    children: vi.fn(() => null),
  };
  const first = AiOperationSession(props);
  session({
    status: "authenticated",
    currentUser: {
      ...auditor,
      permissionKeys: auditor.permissionKeys.concat("other"),
    },
    errorMessage: null,
  });
  expect(AiOperationSession(props).key).not.toBe(first.key);
  session({
    status: "authenticated",
    currentUser: {
      ...auditor,
      privateValue: "private-extra",
    } as typeof auditor,
    errorMessage: null,
  });
  AiOperationSession(props);
  expect(props.children).toHaveBeenLastCalledWith(auditor);
});
