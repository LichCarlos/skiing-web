import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { components } from "@common/api-contracts/openapi";
import {
  PermissionTreeView,
  type PermissionTreeViewState,
} from "@/features/permissions/permission-tree-view";

type PermissionNode = components["schemas"]["PermissionNodeVO"];

const render = (state: PermissionTreeViewState) =>
  renderToStaticMarkup(
    createElement(PermissionTreeView, { state, onRetry: () => undefined }),
  );

const permissionTree: PermissionNode[] = [
  {
    permissionId: 1,
    parentId: null,
    permissionKey: "system:role:manage",
    permissionName: "角色管理",
    permissionType: "directory",
    route: null,
    icon: null,
    children: [
      {
        permissionId: 2,
        parentId: 1,
        permissionKey: "system:role:list",
        permissionName: "查看角色",
        permissionType: "api",
        route: "/api/v1/admin/roles",
        icon: null,
        children: [],
      },
    ],
  },
];

describe("PermissionTreeView", () => {
  it("announces the loading state", () => {
    expect(render({ status: "loading" })).toContain('role="status"');
    expect(render({ status: "loading" })).toContain("正在加载权限目录");
  });

  it("shows an explicit empty state", () => {
    expect(render({ status: "ready", nodes: [] })).toContain(
      "当前没有启用的权限。",
    );
  });

  it.each([
    ["请先登录", "登录"],
    ["无权限查看", "授权"],
    ["权限目录暂时不可用", "服务"],
  ])("renders the %s error with a retry action", (title) => {
    const html = render({
      status: "error",
      title,
      message: "Request rejected",
      traceId: "trace-123",
    });

    expect(html).toContain('role="alert"');
    expect(html).toContain(title);
    expect(html).toContain("traceId: trace-123");
    expect(html).toContain(">重试</button>");
  });

  it("renders nested permission nodes and routes", () => {
    const html = render({ status: "ready", nodes: permissionTree });

    expect(html).toContain('aria-label="权限树"');
    expect(html).toContain("角色管理");
    expect(html).toContain("查看角色");
    expect(html).toContain("system:role:list");
    expect(html).toContain("/api/v1/admin/roles");
  });
});
