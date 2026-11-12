import { expect, it } from "vitest";
import {
  parseRagCommand,
  parseRagPage,
  parseRagSource,
} from "@/features/ai-operations/rag-model";
import {
  commandResult,
  ragPage,
  ragSource,
} from "@/features/ai-operations/rag-fixtures.test-helper";
it("projects every approved field without retaining content, metadata or provider failures", () => {
  expect(
    parseRagSource({
      ...ragSource,
      content: "secret",
      metadata: {},
      vector: [],
      lastError: "private",
    }),
  ).toEqual(ragSource);
  const value = parseRagSource(ragSource);
  value.embeddingModels.push("new");
  expect(ragSource.embeddingModels).toEqual(["embedding-v1"]);
  expect(parseRagPage({ ...ragPage, secret: 1 }, 1, 20)).toEqual(ragPage);
});
it.each([
  { ragDocumentId: 0 },
  { ragDocumentId: 2147483648 },
  { sourceType: "url" },
  { sourceId: 0 },
  { title: null },
  { sourceKey: 1 },
  { accessScope: "private" },
  { status: "complete" },
  { controlVersion: 0 },
  { controlVersion: 1.5 },
  { manualDisabled: "false" },
  { sourceEligible: 1 },
  { chunkCount: -1 },
  { embeddingDimension: 768 },
  { embeddingModels: ["z", "a"] },
  { embeddingModels: ["a", "a"] },
  { embeddingModels: [1] },
  { sourceUpdatedAt: "invalid" },
  { indexedAt: undefined },
  { createdAt: "yesterday" },
  { failureCode: "provider-key" },
  { status: "failed" },
  { manualDisabled: true },
  { failureCode: "indexing_failed" },
])("rejects malformed source metadata %j", (value) =>
  expect(() => parseRagSource({ ...ragSource, ...value })).toThrow(),
);
it("accepts nullable and failed/disabled metadata, code-point order and exact target", () => {
  expect(
    parseRagSource({
      ...ragSource,
      sourceId: null,
      indexedAt: null,
      status: "failed",
      failureCode: "indexing_failed",
      embeddingModels: ["\uE000", "😀"],
    }).sourceId,
  ).toBeNull();
  expect(
    parseRagSource({ ...ragSource, status: "disabled", manualDisabled: true })
      .manualDisabled,
  ).toBe(true);
  expect(() => parseRagSource(ragSource, 9)).toThrow();
});
it.each([
  { total: -1 },
  { total: 2 },
  { page: 2 },
  { pageSize: 10 },
  { items: [ragSource, ragSource], total: 2 },
  { items: null },
])("rejects inconsistent pages %j", (change) =>
  expect(() => parseRagPage({ ...ragPage, ...change }, 1, 20)).toThrow(),
);
it("validates reindex, disable, enable and matching-version no-op command results", () => {
  for (const action of ["reindex", "disable", "enable"] as const) {
    const before =
      action === "enable"
        ? { ...ragSource, manualDisabled: true, status: "disabled" as const }
        : ragSource;
    const result = commandResult(action, before);
    expect(parseRagCommand(result, before, action)).toEqual(result);
  }
  expect(
    parseRagCommand({ source: ragSource, eventId: null }, ragSource, "enable")
      .source,
  ).toEqual(ragSource);
});
it.each([
  { eventId: null },
  { eventId: "not-a-uuid" },
  { source: { ...commandResult().source, ragDocumentId: 9 } },
  { source: { ...commandResult().source, controlVersion: 9 } },
  { source: { ...commandResult().source, sourceKey: "article:99" } },
  { source: { ...commandResult().source, sourceId: 99 } },
  { source: { ...commandResult().source, status: "indexed" } },
])("rejects mismatched command acknowledgements %j", (change) =>
  expect(() =>
    parseRagCommand({ ...commandResult(), ...change }, ragSource, "reindex"),
  ).toThrow(),
);
it("rejects disable acknowledgements retaining chunks or returning an event", () => {
  expect(() =>
    parseRagCommand(
      { ...commandResult("disable"), eventId: commandResult().eventId },
      ragSource,
      "disable",
    ),
  ).toThrow();
  expect(() =>
    parseRagCommand(
      {
        ...commandResult("disable"),
        source: { ...commandResult("disable").source, chunkCount: 1 },
      },
      ragSource,
      "disable",
    ),
  ).toThrow();
});
