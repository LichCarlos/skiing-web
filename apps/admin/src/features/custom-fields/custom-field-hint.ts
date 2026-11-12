/** Describe only the actual effective field metadata; never infer access or constraints. */
export function customFieldHint(field: {
  dataType: string;
  required?: boolean;
  canRead?: boolean;
  canWrite?: boolean;
  validation?: unknown;
}) {
  if (field.canWrite === false) return "只读字段，当前账号不能修改。";
  const types: Record<string, string> = {
    text: "填写文本",
    textarea: "填写多行文本",
    integer: "填写整数",
    decimal: "填写数值",
    boolean: "选择是或否",
    date: "选择有效日期",
    single_select: "从已配置的字典选项中单选",
    multi_select: "从已配置的字典选项中多选",
    url: "填写完整的 http(s) 地址",
  };
  const rules =
    field.validation &&
    typeof field.validation === "object" &&
    !Array.isArray(field.validation)
      ? (field.validation as Record<string, unknown>)
      : {};
  const parts = [
    field.required ? "必填" : "选填",
    types[field.dataType] ?? "按字段配置填写",
  ];
  if (typeof rules.min === "number") parts.push(`最小值${rules.min}`);
  if (typeof rules.max === "number") parts.push(`最大值${rules.max}`);
  if (typeof rules.minLength === "number")
    parts.push(`至少${rules.minLength}字`);
  if (typeof rules.maxLength === "number")
    parts.push(`最多${rules.maxLength}字`);
  if (typeof rules.pattern === "string")
    parts.push(`格式需符合配置：${rules.pattern}`);
  if (field.canRead === false) parts.push("当前账号仅可写，未修改时保留原值");
  return parts.join("；") + "。";
}
