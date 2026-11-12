import type { components } from "@common/api-contracts/openapi";
import type { RagSource, RagSourcePage } from "@/features/ai-operations/api";
export type RagAction = "reindex" | "enable" | "disable";
export type RagCommand = components["schemas"]["RagSourceCommandVO"];
export class RagResponseError extends Error {
  constructor() {
    super("RAG来源响应异常，请重新读取并核对");
  }
}
function invalid(): never {
  throw new RagResponseError();
}
function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string") invalid();
  return value;
}
function integer(value: unknown, min = 1): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > 2147483647
  )
    invalid();
  return value;
}
function bool(value: unknown): boolean {
  if (typeof value !== "boolean") invalid();
  return value;
}
function time(value: unknown): string {
  const result = text(value);
  if (
    !Number.isFinite(Date.parse(result)) ||
    new Date(result).toISOString() !== result
  )
    invalid();
  return result;
}
function member<T extends string>(value: unknown, values: readonly T[]): T {
  if (typeof value !== "string" || !values.includes(value as T)) invalid();
  return value as T;
}
export const ragTypes = [
  "resort",
  "article",
  "project_doc",
  "dynamic",
  "dictionary",
] as const;
export const ragStatuses = [
  "pending",
  "indexed",
  "failed",
  "disabled",
] as const;
export function parseRagSource(value: unknown, expectedId?: number): RagSource {
  const item = row(value),
    ragDocumentId = integer(item.ragDocumentId);
  if (expectedId !== undefined && ragDocumentId !== expectedId) invalid();
  if (!Array.isArray(item.embeddingModels)) invalid();
  const embeddingModels = item.embeddingModels.map(text);
  // PostgreSQL COLLATE C orders UTF-8 strings by code point, not UTF-16 units.
  const compare = (a: string, b: string) => {
    const left = Array.from(a, (c) => c.codePointAt(0)!),
      right = Array.from(b, (c) => c.codePointAt(0)!);
    for (let i = 0; i < Math.min(left.length, right.length); i++)
      if (left[i] !== right[i]) return left[i]! - right[i]!;
    return left.length - right.length;
  };
  if (
    embeddingModels.some(
      (model, i) => i > 0 && compare(embeddingModels[i - 1]!, model) >= 0,
    ) ||
    item.embeddingDimension !== 1024
  )
    invalid();
  const status = member(item.status, ragStatuses),
    manualDisabled = bool(item.manualDisabled);
  const failureCode =
    item.failureCode === null
      ? null
      : member(item.failureCode, ["indexing_failed"]);
  if (
    (status === "failed") !== (failureCode !== null) ||
    (manualDisabled && status !== "disabled")
  )
    invalid();
  return {
    ragDocumentId,
    sourceKey: text(item.sourceKey),
    sourceType: member(item.sourceType, ragTypes),
    sourceId: item.sourceId === null ? null : integer(item.sourceId),
    title: text(item.title),
    accessScope: member(item.accessScope, ["public", "merchant", "admin"]),
    status,
    manualDisabled,
    controlVersion: integer(item.controlVersion),
    sourceEligible: bool(item.sourceEligible),
    chunkCount: integer(item.chunkCount, 0),
    embeddingModels,
    embeddingDimension: 1024,
    sourceUpdatedAt: time(item.sourceUpdatedAt),
    indexedAt: item.indexedAt === null ? null : time(item.indexedAt),
    createdAt: time(item.createdAt),
    failureCode,
    ...(item.failureReason === undefined
      ? {}
      : {
          failureReason:
            item.failureReason === null
              ? null
              : member(item.failureReason, [
                  "embedding_failed",
                  "index_commit_failed",
                  "source_unavailable",
                  "stale_index_cleaned",
                  "index_lease_expired",
                ]),
        }),
    ...(item.failureAt === undefined
      ? {}
      : { failureAt: item.failureAt === null ? null : time(item.failureAt) }),
  };
}
export function parseRagPage(
  value: unknown,
  page: number,
  pageSize: number,
): RagSourcePage {
  const item = row(value),
    total = item.total;
  if (
    item.page !== page ||
    item.pageSize !== pageSize ||
    typeof total !== "number" ||
    !Number.isSafeInteger(total) ||
    total < 0 ||
    !Array.isArray(item.items) ||
    item.items.length !==
      Math.min(pageSize, Math.max(0, total - (page - 1) * pageSize))
  )
    invalid();
  const items = item.items.map((value) => parseRagSource(value));
  if (new Set(items.map((item) => item.ragDocumentId)).size !== items.length)
    invalid();
  return { items, total, page, pageSize };
}
export function sameRagTarget(a: RagSource, b: RagSource) {
  return (
    a.ragDocumentId === b.ragDocumentId &&
    a.sourceKey === b.sourceKey &&
    a.sourceType === b.sourceType &&
    a.sourceId === b.sourceId &&
    a.controlVersion === b.controlVersion &&
    a.manualDisabled === b.manualDisabled
  );
}
export function parseRagCommand(
  value: unknown,
  before: RagSource,
  action: RagAction,
): RagCommand {
  const item = row(value),
    source = parseRagSource(item.source, before.ragDocumentId);
  const eventId = item.eventId === null ? null : text(item.eventId);
  if (
    eventId !== null &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      eventId,
    )
  )
    invalid();
  if (
    source.sourceKey !== before.sourceKey ||
    source.sourceType !== before.sourceType ||
    source.sourceId !== before.sourceId
  )
    invalid();
  const noop =
    action !== "reindex" && before.manualDisabled === (action === "disable");
  if (
    source.controlVersion !== before.controlVersion + (noop ? 0 : 1) ||
    source.manualDisabled !== (action === "disable")
  )
    invalid();
  if (
    noop
      ? eventId !== null
      : action === "disable"
        ? eventId !== null ||
          source.status !== "disabled" ||
          source.chunkCount !== 0 ||
          source.embeddingModels.length !== 0 ||
          source.indexedAt !== null
        : eventId === null ||
          source.status !== "pending" ||
          source.indexedAt !== null
  )
    invalid();
  return { source, eventId };
}
