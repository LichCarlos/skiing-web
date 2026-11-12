import { expect, it } from "vitest";
import { customFieldHint } from "@/features/custom-fields/custom-field-hint";

it("describes the configured numeric and string constraints without inventing bounds", () => {
  expect(
    customFieldHint({
      dataType: "integer",
      required: true,
      validation: { min: 0, max: 5 },
    }),
  ).toBe("必填；填写整数；最小值0；最大值5。");
  expect(
    customFieldHint({
      dataType: "text",
      validation: { minLength: 2, maxLength: 50, pattern: "^[A-Z]+$" },
    }),
  ).toBe("选填；填写文本；至少2字；最多50字；格式需符合配置：^[A-Z]+$。");
  expect(customFieldHint({ dataType: "date", validation: null })).toBe(
    "选填；选择有效日期。",
  );
});
it("explains actual field access and only-write preservation", () => {
  expect(
    customFieldHint({ dataType: "text", canWrite: false, required: true }),
  ).toBe("只读字段，当前账号不能修改。");
  expect(
    customFieldHint({
      dataType: "multi_select",
      canRead: false,
      canWrite: true,
    }),
  ).toContain("仅可写，未修改时保留原值");
});
