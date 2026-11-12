import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Form } from "antd";
import { describe, expect, it } from "vitest";
import { ArticleCustomFields } from "@/features/articles/article-custom-fields";
import {
  testArticleField,
  testArticleSchema,
} from "@/features/articles/__tests__/fixtures";

describe("article dynamic field controls", () => {
  it("renders empty metadata explicitly", () => {
    const html = renderToStaticMarkup(
      createElement(ArticleCustomFields, {
        schema: { entityType: "article", groups: [] },
        options: {},
        editing: false,
      }),
    );
    expect(html).toContain("当前没有可用的扩展字段");
  });
  it("renders field types, readonly controls, and a write-only preservation hint", () => {
    const schema = testArticleSchema([
      testArticleField("readOnly", { canWrite: false }),
      testArticleField("writeOnly", { canRead: false, required: true }),
      testArticleField("date", { dataType: "date" }),
      testArticleField("count", { dataType: "integer" }),
      testArticleField("detail", { dataType: "textarea" }),
      testArticleField("choice", {
        dataType: "single_select",
        optionsDictType: "level",
      }),
      testArticleField("choices", {
        dataType: "multi_select",
        optionsDictType: "level",
      }),
      testArticleField("enabled", { dataType: "boolean" }),
      testArticleField("link", { dataType: "url" }),
    ]);
    const html = renderToStaticMarkup(
      createElement(
        Form,
        { initialValues: { customFields: { readOnly: "Visible value" } } },
        createElement(ArticleCustomFields, {
          schema,
          options: { level: [{ value: "beginner", label: "初学者" }] },
          editing: true,
        }),
      ),
    );
    expect(html).toContain("Visible value");
    expect(html).toMatch(/disabled=""/);
    expect(html).toContain("只读字段");
    expect(html).toContain("仅可写；未编辑则保留原值");
    expect(html).toContain('type="date"');
    expect(html).toContain('type="url"');
    expect(html).toContain("<textarea");
    expect(html).toContain('role="spinbutton"');
    expect(html).toContain('role="combobox"');
  });
});
