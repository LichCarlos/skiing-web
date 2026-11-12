"use client";
import { FormHint } from "@/components/form-hint";
import { customFieldHint } from "@/features/custom-fields/custom-field-hint";
import { AdminParagraph } from "@/components/admin-paragraph";

import { Form, Input, InputNumber, Select } from "antd";
import {
  articleFieldRequired,
  type ArticleFieldSchema,
  type ArticleFieldOptions,
} from "@/features/articles/article-field-model";

export function ArticleCustomFields({
  schema,
  options,
  editing,
}: {
  schema: ArticleFieldSchema;
  options: ArticleFieldOptions;
  editing: boolean;
}) {
  if (schema.groups.length === 0)
    return <AdminParagraph>当前没有可用的扩展字段。</AdminParagraph>;
  return (
    <>
      {schema.groups.map((group) => (
        <section key={group.groupKey} aria-label={group.label}>
          <h2>{group.label}</h2>
          {group.fields.map((field) => {
            const disabled = !field.canWrite;
            const hint = disabled
              ? "只读字段"
              : !field.canRead && editing
                ? "仅可写；未编辑则保留原值"
                : undefined;
            const rules = field.validation ?? {};
            const numberRule = (key: string) =>
              typeof rules[key] === "number"
                ? (rules[key] as number)
                : undefined;
            let control;
            if (field.dataType === "textarea")
              control = (
                <Input.TextArea
                  disabled={disabled}
                  rows={3}
                  maxLength={numberRule("maxLength")}
                />
              );
            else if (
              field.dataType === "integer" ||
              field.dataType === "decimal"
            )
              control = (
                <InputNumber
                  disabled={disabled}
                  precision={field.dataType === "integer" ? 0 : undefined}
                  min={numberRule("min")}
                  max={numberRule("max")}
                  style={{ width: "100%" }}
                />
              );
            else if (field.dataType === "boolean")
              control = (
                <Select
                  disabled={disabled}
                  allowClear
                  options={[
                    { value: true, label: "是" },
                    { value: false, label: "否" },
                  ]}
                />
              );
            else if (
              field.dataType === "single_select" ||
              field.dataType === "multi_select"
            )
              control = disabled ? (
                <Input disabled />
              ) : (
                <Select
                  allowClear
                  mode={
                    field.dataType === "multi_select" ? "multiple" : undefined
                  }
                  options={
                    field.optionsDictType
                      ? (options[field.optionsDictType] ?? [])
                      : []
                  }
                />
              );
            else
              control = (
                <Input
                  disabled={disabled}
                  type={
                    field.dataType === "date"
                      ? "date"
                      : field.dataType === "url"
                        ? "url"
                        : "text"
                  }
                  maxLength={numberRule("maxLength")}
                />
              );
            return (
              <Form.Item
                key={field.fieldKey}
                name={["customFields", field.fieldKey]}
                label={field.label}
                extra={
                  <FormHint>
                    {[customFieldHint(field), hint].filter(Boolean).join(" ")}
                  </FormHint>
                }
                normalize={(value) =>
                  value === undefined ||
                  (field.dataType === "date" && value === "")
                    ? null
                    : value
                }
                rules={[
                  ...(articleFieldRequired(field, editing)
                    ? [{ required: true, message: `${field.label}为必填项` }]
                    : []),
                  ...(field.canWrite && field.dataType === "url"
                    ? [
                        {
                          type: "url" as const,
                          message: "请输入完整的 http(s) 地址",
                        },
                      ]
                    : []),
                ]}
              >
                {control}
              </Form.Item>
            );
          })}
        </section>
      ))}
    </>
  );
}
