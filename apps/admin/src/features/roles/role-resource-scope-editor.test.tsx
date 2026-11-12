import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RoleResourceScopeEditor } from "@/features/roles/role-resource-scope-editor";
import type { ScopeRow } from "@/features/roles/role-resource-scopes";

const catalog = [{ resourceKey: "resort", label: "滑雪场" }];
const row: ScopeRow = {
  localKey: "row",
  resourceKey: "resort",
  scopeType: "self",
  selectedIds: "",
};
const render = (rows: ScopeRow[], disabled = false, resources = catalog) =>
  renderToStaticMarkup(
    createElement(RoleResourceScopeEditor, {
      rows,
      disabled,
      catalog: resources,
      onChange: () => undefined,
    }),
  );

describe("role resource scope controls", () => {
  it("renders an explicit default-scope state and an add action", () => {
    const html = render([]);
    expect(html).toContain("当前使用角色默认数据范围");
    expect(html).toContain("添加资源范围");
  });
  it("renders a catalog-backed resource choice and its independent scope selector", () => {
    const html = render([row]);
    expect(html).toContain('aria-label="资源 1"');
    expect(html).toContain("滑雪场 (resort)");
    expect(html).toContain('aria-label="范围类型 1"');
  });
  it("renders unknown historical resources as readonly while retaining removal", () => {
    const html = render([
      {
        ...row,
        resourceKey: "legacy",
        scopeType: "selected",
        selectedIds: "2, 4",
      },
    ]);
    expect(html).toContain("历史未知资源，仅可保留或移除");
    expect(html).toMatch(/aria-label="历史资源 1"[^>]*readonly=""/i);
    expect(html).toMatch(/aria-label="指定 ID 1"[^>]*disabled=""/);
    expect(html).toContain("移除");
  });
  it("disables all mutation actions for a protected role or readonly caller, and prevents adding without a catalog", () => {
    expect(
      (render([row], true).match(/<button[^>]*disabled=""/g) ?? []).length,
    ).toBe(2);
    expect(render([], false, [])).toMatch(/<button[^>]*disabled=""/);
  });
});
