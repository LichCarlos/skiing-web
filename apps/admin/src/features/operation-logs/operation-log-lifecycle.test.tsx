import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import { apiRequest } from "@/platform/api";
import { useSession } from "@/platform/auth/session-provider";
import { user, deferred } from "@/platform/auth/session-fixtures.test-helper";
import {
  loadingSession,
  type SessionState,
} from "@/platform/auth/session-model";
import {
  operationLogError,
  operationLogQuery,
  readOperationLogPage,
  type OperationLogPage,
} from "@/features/operation-logs/operation-log-api";
import {
  operationLogOperatorKey,
  parseOperationLogPage,
} from "@/features/operation-logs/operation-log-model";
import { OperationLogList } from "@/features/operation-logs/operation-log-list";

vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
vi.mock("@/platform/auth/session-provider", () => ({ useSession: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const operator = {
  ...user,
  roles: [{ roleKey: "system_admin", roleName: "系统管理员" }],
  permissionKeys: ["management:portal:enter", "system:operation-log:list"],
};
const entry = {
  operationLogId: "9007199254740993",
  actorUserId: null,
  actorAccountSnapshot: "operator",
  actionKey: "system:role:create",
  resourceKey: "role",
  targetType: "Role",
  targetId: "12",
  result: "success" as const,
  traceId: "trace-logs",
  createdAt: "2026-11-03T00:00:00.000Z",
};
const data: OperationLogPage = {
  page: 1,
  pageSize: 20,
  total: 1,
  hasNext: false,
  items: [entry],
};
const read = (signal = new AbortController().signal) =>
  readOperationLogPage(apiRequest, operator, "page=1&pageSize=20", signal);
function session(value: ReturnType<typeof useSession>["session"]) {
  vi.mocked(useSession).mockReturnValue({
    session: value,
    retryRestore: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  });
}

describe("operation log response projection", () => {
  it("preserves bigint strings and strips extra fields from the page and every row", () => {
    const result = parseOperationLogPage(
      {
        ...data,
        metadata: "private",
        items: [{ ...entry, reason: "private", ip: "private", metadata: {} }],
      },
      { page: 1, pageSize: 20 },
    );
    expect(result).toEqual(data);
    expect(result).not.toBe(data);
    expect(result.items[0]).not.toBe(entry);
  });
  it.each([
    null,
    [],
    { ...data, page: 2 },
    { ...data, pageSize: 10 },
    { ...data, total: -1 },
    { ...data, total: 1.5 },
    { ...data, total: Number.MAX_SAFE_INTEGER + 1 },
    { ...data, hasNext: true },
    { ...data, hasNext: "false" },
    { ...data, items: [] },
    { ...data, items: null },
    { ...data, total: 2, items: [entry, entry] },
  ])("rejects an inconsistent page %j", (value) => {
    expect(() =>
      parseOperationLogPage(value, { page: 1, pageSize: 20 }),
    ).toThrow();
  });
  it.each([
    { operationLogId: 9007199254740992 },
    { operationLogId: "01" },
    { operationLogId: "0" },
    { operationLogId: "-1" },
    { operationLogId: "9223372036854775808" },
    { actorUserId: 0 },
    { actorUserId: "7" },
    { actorUserId: 2147483648 },
    { result: "pending" },
    { traceId: null },
    { actorAccountSnapshot: {} },
    { actionKey: undefined },
    { resourceKey: [] },
    { targetType: null },
    { targetId: 1 },
    { createdAt: "invalid" },
    { createdAt: "2026-11-03" },
    { createdAt: "2026-02-30T00:00:00.000Z" },
  ])("rejects an invalid row %j", (patch) => {
    expect(() =>
      parseOperationLogPage(
        { ...data, items: [{ ...entry, ...patch }] },
        { page: 1, pageSize: 20 },
      ),
    ).toThrow();
  });
  it("accepts an empty out-of-range page and full last page", () => {
    expect(
      parseOperationLogPage(
        { ...data, page: 2, items: [] },
        { page: 2, pageSize: 20 },
      ).items,
    ).toEqual([]);
    expect(
      parseOperationLogPage({ ...data, pageSize: 1 }, { page: 1, pageSize: 1 })
        .items,
    ).toHaveLength(1);
  });
  it("rejects a runtime result outside the approved filter values", () => {
    expect(() =>
      operationLogQuery({ result: "hidden" as "success" }, 1, 20),
    ).toThrow("结果筛选无效");
  });
});

describe("operation log read identity and cancellation", () => {
  it("checks current identity before and after the read with no-store and one signal", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce(data)
      .mockResolvedValueOnce(operator);
    const signal = new AbortController().signal;
    expect(await read(signal)).toEqual(data);
    expect(vi.mocked(apiRequest).mock.calls).toEqual([
      ["/auth/me", { signal, cache: "no-store" }],
      [
        "/admin/operation-logs?page=1&pageSize=20",
        { signal, cache: "no-store" },
      ],
      ["/auth/me", { signal, cache: "no-store" }],
    ]);
  });
  it.each([
    { ...operator, userId: 8 },
    { ...operator, account: "other" },
    { ...operator, roles: [{ roleKey: "custom", roleName: "运营" }] },
    { ...operator, permissionKeys: ["management:portal:enter"] },
    { ...operator, permissionKeys: ["system:operation-log:list"] },
    { ...operator, permissionKeys: [...operator.permissionKeys, "extra"] },
    { ...operator, merchant: undefined },
    null,
  ])(
    "never starts the log request after a different or malformed identity %j",
    async (current) => {
      vi.mocked(apiRequest).mockResolvedValue(current);
      await expect(read()).rejects.toThrow();
      expect(apiRequest).toHaveBeenCalledTimes(1);
    },
  );
  it("does not return loaded rows when permissions change during the request", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce(data)
      .mockResolvedValueOnce({ ...operator, permissionKeys: [] });
    await expect(read()).rejects.toThrow();
    expect(apiRequest).toHaveBeenCalledTimes(3);
  });
  it("does not return loaded rows when the final identity read fails", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce(data)
      .mockRejectedValueOnce(
        new ApiError("private", { status: 503, code: null, traceId: null }),
      );
    await expect(read()).rejects.toThrow();
  });
  it.each([0, 1, 2])(
    "discards a late response after cancellation at step %s",
    async (step) => {
      const pending = deferred<unknown>();
      const controller = new AbortController();
      const values = [operator, data, operator];
      vi.mocked(apiRequest).mockImplementation(async () => {
        const index = vi.mocked(apiRequest).mock.calls.length - 1;
        return index === step ? pending.promise : values[index];
      });
      const task = read(controller.signal);
      const assertion = expect(task).rejects.toThrow();
      await vi.waitFor(() =>
        expect(apiRequest).toHaveBeenCalledTimes(step + 1),
      );
      controller.abort();
      pending.resolve(values[step]);
      await assertion;
      expect(apiRequest).toHaveBeenCalledTimes(step + 1);
    },
  );
  it("makes no request with an already aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(read(controller.signal)).rejects.toThrow();
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it("rejects malformed pages before the final identity check", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce({ ...data, items: [] });
    await expect(read()).rejects.toThrow();
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });
  it("redacts errors while preserving the identity recovery guidance", async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      ...operator,
      permissionKeys: [],
    });
    const error = await read().catch((cause: unknown) => cause);
    expect(operationLogError(error).title).toBe(
      "身份或权限已变化，请重新读取身份",
    );
    expect(operationLogError(new Error("private")).title).not.toContain(
      "private",
    );
  });
});

describe("operation log session boundary (SSR only)", () => {
  it.each<SessionState>([
    loadingSession,
    { status: "anonymous", currentUser: null, errorMessage: null },
    {
      status: "unavailable",
      currentUser: null,
      errorMessage: "private",
    },
    {
      status: "authenticated",
      currentUser: { ...operator, permissionKeys: [] },
      errorMessage: null,
    },
  ])("does not render the form/rows for %j", (value) => {
    session(value);
    const html = renderToStaticMarkup(createElement(OperationLogList));
    expect(html).not.toContain("<form");
    expect(html).not.toContain("private");
    expect(html).not.toContain(entry.operationLogId);
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it("keys the form by account, roles and grants; ordering and duplicate grants are stable", () => {
    session({
      status: "authenticated",
      currentUser: operator,
      errorMessage: null,
    });
    expect(OperationLogList().key).toBe(operationLogOperatorKey(operator));
    expect(operationLogOperatorKey(operator)).toBe(
      operationLogOperatorKey({
        ...operator,
        permissionKeys: [...operator.permissionKeys]
          .reverse()
          .concat(operator.permissionKeys),
      }),
    );
    for (const changed of [
      { ...operator, userId: 8 },
      { ...operator, permissionKeys: [...operator.permissionKeys, "extra"] },
      {
        ...operator,
        roles: [...operator.roles, { roleKey: "custom", roleName: "运营" }],
      },
    ])
      expect(operationLogOperatorKey(changed)).not.toBe(
        operationLogOperatorKey(operator),
      );
  });
});
