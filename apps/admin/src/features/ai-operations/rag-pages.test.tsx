import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { RagConsole } from "@/features/ai-operations/rag-console";
import { useSession } from "@/platform/auth/session-provider";
import { apiRequest } from "@/platform/api";
import {
  loadingSession,
  type SessionState,
} from "@/platform/auth/session-model";
import { ragOperator } from "@/features/ai-operations/rag-fixtures.test-helper";
import { ragSource } from "@/features/ai-operations/rag-fixtures.test-helper";
import { ragRecoveryLedger } from "@/features/ai-operations/rag-workflow";
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
vi.mock("@/platform/auth/session-provider", () => ({ useSession: vi.fn() }));
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
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
    currentUser: {
      ...ragOperator,
      roles: [{ roleKey: "custom", roleName: "自定义" }],
    },
    errorMessage: null,
  },
])("keeps RAG forms and data out of unauthorized SSR %j", (value) => {
  session(value);
  const html = renderToStaticMarkup(createElement(RagConsole, { id: 8 }));
  expect(html).not.toContain("操作原因");
  expect(html).not.toContain("private-");
  expect(apiRequest).not.toHaveBeenCalled();
});
it("renders real authorized list/detail loading shells without SSR reads or writes", () => {
  session({
    status: "authenticated",
    currentUser: ragOperator,
    errorMessage: null,
  });
  expect(renderToStaticMarkup(createElement(RagConsole))).toContain(
    "RAG 来源运维",
  );
  const detail = renderToStaticMarkup(createElement(RagConsole, { id: 8 }));
  expect(detail).toContain("来源索引详情 #8");
  expect(detail).not.toContain("操作原因");
  expect(apiRequest).not.toHaveBeenCalled();
});
it("uses the server snapshot before exposing browser-only recovery on hydration", () => {
  session({
    status: "authenticated",
    currentUser: ragOperator,
    errorMessage: null,
  });
  vi.stubGlobal("window", {});
  const ledger = ragRecoveryLedger();
  ledger.begin(ragOperator.userId, ragSource, "reindex")(false);
  expect(ledger.version).toBeGreaterThan(0);
  const html = renderToStaticMarkup(createElement(RagConsole, { id: 8 }));
  expect(html).not.toContain("原操作");
  expect(html).not.toContain("已停止提交");
  expect(apiRequest).not.toHaveBeenCalled();
});
