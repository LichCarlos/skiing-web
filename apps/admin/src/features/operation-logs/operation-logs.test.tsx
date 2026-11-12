import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import { apiRequest } from "@/platform/api";
import {
  getOperationLogs,
  operationLogError,
  operationLogQuery,
  type OperationLogPage,
} from "@/features/operation-logs/operation-log-api";
import {
  OperationLogResults,
  type OperationLogState,
} from "@/features/operation-logs/operation-log-results";
import { canAccessManagementRoute } from "@/platform/auth/access";

vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
afterEach(() => vi.clearAllMocks());
const data: OperationLogPage = {
  page: 1,
  pageSize: 20,
  total: 1,
  hasNext: false,
  items: [
    {
      operationLogId: "9007199254740993",
      actorUserId: null,
      actorAccountSnapshot: "<script>operator</script>",
      actionKey: "test:read",
      resourceKey: "test",
      targetType: "test",
      targetId: "9",
      result: "failure",
      traceId: "trace-logs",
      createdAt: "2026-10-29T00:00:00.000Z",
    },
  ],
};
const render = (state: OperationLogState) =>
  renderToStaticMarkup(
    createElement(OperationLogResults, {
      state,
      onRetry: () => undefined,
      onPage: () => undefined,
    }),
  );

describe("operation log read UI", () => {
  it("encodes supported filters, stable paging and inclusive UTC time boundaries", () => {
    const query = new URLSearchParams(
      operationLogQuery(
        {
          actorUserId: " 12 ",
          actionKey: " test:read ",
          resourceKey: "test&other",
          result: "failure",
          traceId: "trace?=中文",
          fromTime: "2026-10-29T08:00:00+08:00",
          toTime: "2026-10-29T00:00:00Z",
        },
        2,
        50,
      ),
    );
    expect(Object.fromEntries(query)).toEqual({
      page: "2",
      pageSize: "50",
      actorUserId: "12",
      actionKey: "test:read",
      resourceKey: "test&other",
      result: "failure",
      traceId: "trace?=中文",
      fromTime: "2026-10-29T00:00:00.000Z",
      toTime: "2026-10-29T00:00:00.000Z",
    });
    expect(operationLogQuery({ actorUserId: "", traceId: " " }, 1, 20)).toBe(
      "page=1&pageSize=20",
    );
  });
  it.each([
    { actorUserId: "9007199254740993" },
    { actorUserId: "2147483648" },
    { actorUserId: "1.5" },
    { fromTime: "invalid" },
    { fromTime: "2026-10-29T00:00:01Z", toTime: "2026-10-29T00:00:00Z" },
  ])("rejects invalid form values %j", (filters) => {
    expect(() => operationLogQuery(filters, 1, 20)).toThrow();
  });
  it("reads the query once and forwards cancellation through the existing credential-aware transport", async () => {
    const signal = new AbortController().signal;
    vi.mocked(apiRequest).mockResolvedValue(data);
    expect(await getOperationLogs("page=1&pageSize=20", signal)).toEqual(data);
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith(
      "/admin/operation-logs?page=1&pageSize=20",
      { signal, cache: "no-store" },
    );
  });
  it("renders a precise string ID and safe columns without serializing arbitrary payloads", () => {
    const extra = {
      ...data,
      items: data.items.map((item) => ({
        ...item,
        reason: "hidden-reason",
        metadata: { password: "hidden-password" },
        clientIp: "192.0.2.9",
        userAgent: "hidden-agent",
      })),
    };
    const html = render({ status: "ready", data: extra });
    for (const value of [
      "9007199254740993",
      "&lt;script&gt;",
      "账号已移除",
      "test:read",
      "trace-logs",
      "失败",
    ])
      expect(html).toContain(value);
    for (const value of [
      "hidden-",
      "192.0.2.9",
      "<script>",
      "导出",
      "编辑",
      "删除",
    ])
      expect(html).not.toContain(value);
  });
  it("renders distinct loading and empty states", () => {
    expect(render({ status: "loading" })).toContain('role="status"');
    expect(
      render({ status: "ready", data: { ...data, total: 0, items: [] } }),
    ).toContain("没有符合条件的操作日志");
  });
  it.each([
    [401, "登录状态已失效"],
    [403, "当前账号无权读取操作日志"],
    [500, "操作日志暂时不可用"],
  ])("maps %s without rendering server exception text", (status, title) => {
    const html = render({
      status: "error",
      ...operationLogError(
        new ApiError("private-exception", {
          status: Number(status),
          code: null,
          traceId: "trace-retry",
        }),
      ),
    });
    expect(html).toContain(title);
    expect(html).toContain("trace-retry");
    expect(html).toMatch(/重\s*试/);
    expect(html).not.toContain("private-exception");
    expect(html).not.toContain("test:read");
  });
  it("requires system_admin, portal and list grant and rejects unsupported detail routes", () => {
    const user = {
      roles: [{ roleKey: "system_admin", roleName: "系统管理员" }],
      permissionKeys: ["management:portal:enter", "system:operation-log:list"],
    };
    expect(canAccessManagementRoute(user, "/admin/system/operation-logs")).toBe(
      true,
    );
    expect(
      canAccessManagementRoute(
        { ...user, roles: [{ roleKey: "custom_operator", roleName: "运营" }] },
        "/admin/system/operation-logs",
      ),
    ).toBe(false);
    expect(
      canAccessManagementRoute(
        { ...user, permissionKeys: ["management:portal:enter"] },
        "/admin/system/operation-logs",
      ),
    ).toBe(false);
    expect(
      canAccessManagementRoute(
        { ...user, permissionKeys: ["system:operation-log:list"] },
        "/admin/system/operation-logs",
      ),
    ).toBe(false);
    expect(
      canAccessManagementRoute(user, "/admin/system/operation-logs/7"),
    ).toBe(false);
  });
});
