import {
  KnowledgeInputError,
  type Knowledge,
  type KnowledgePage,
} from "@/features/project-knowledge/knowledge-model";
function invalid(): never {
  throw new KnowledgeInputError("项目知识资料或分页不匹配，请刷新核对");
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string") invalid();
  return value;
}
function id(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 2147483647
  )
    invalid();
  return value;
}
function time(value: unknown): string {
  const result = text(value);
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(
      result,
    ) ||
    !Number.isFinite(Date.parse(result))
  )
    invalid();
  return result;
}
export function parseKnowledge(value: unknown, expected?: number): Knowledge {
  const source = record(value),
    projectKnowledgeId = id(source.projectKnowledgeId);
  if (
    (expected !== undefined && projectKnowledgeId !== expected) ||
    typeof source.status !== "string" ||
    !["draft", "published", "withdrawn"].includes(source.status)
  )
    invalid();
  const sourceUrl = source.sourceUrl === null ? null : text(source.sourceUrl);
  if (sourceUrl !== null) {
    try {
      const url = new URL(sourceUrl);
      if (
        !["https:", "http:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        invalid();
    } catch {
      invalid();
    }
  }
  return {
    projectKnowledgeId,
    title: text(source.title),
    content: text(source.content),
    category: text(source.category),
    sourceUrl,
    status: source.status as Knowledge["status"],
    version: id(source.version),
    publishTime: source.publishTime === null ? null : time(source.publishTime),
    createTime: time(source.createTime),
    updateTime: time(source.updateTime),
  };
}
export function parseKnowledgePage(
  value: unknown,
  expectedPage: number,
  status?: Knowledge["status"],
): KnowledgePage {
  const source = record(value);
  if (
    source.page !== expectedPage ||
    source.pageSize !== 20 ||
    typeof source.total !== "number" ||
    !Number.isSafeInteger(source.total) ||
    source.total < 0 ||
    !Array.isArray(source.items) ||
    source.items.length !==
      Math.min(20, Math.max(0, source.total - (expectedPage - 1) * 20)) ||
    source.hasNext !== expectedPage * 20 < source.total
  )
    invalid();
  const items = source.items.map((value) => parseKnowledge(value));
  if (
    new Set(items.map((item) => item.projectKnowledgeId)).size !==
      items.length ||
    (status !== undefined && items.some((item) => item.status !== status))
  )
    invalid();
  return {
    items,
    page: expectedPage,
    pageSize: 20,
    total: source.total,
    hasNext: source.hasNext as boolean,
  };
}
