import { expect, it, vi } from "vitest";
import {
  readRagPage,
  readRagSource,
  ragPageQuery,
  writeRagCommand,
  type RagRequest,
} from "@/features/ai-operations/rag-queries";
import {
  commandResult,
  ragCommandRequest,
  ragOperator,
  ragPage,
  ragSource,
} from "@/features/ai-operations/rag-fixtures.test-helper";
const signal = () => new AbortController().signal;
it("normalizes only approved filters, empty keywords and bounded paging", () => {
  expect(
    Object.fromEntries(
      ragPageQuery(
        {
          keyword: "  滑雪  ",
          sourceType: "article",
          manualDisabled: "false",
          status: "indexed",
        },
        2,
        50,
      ),
    ),
  ).toEqual({
    page: "2",
    pageSize: "50",
    keyword: "滑雪",
    sourceType: "article",
    manualDisabled: "false",
    status: "indexed",
  });
  expect(ragPageQuery({ keyword: " " }, 1, 20).has("keyword")).toBe(false);
});
it.each([
  { sourceType: "url" },
  { status: "done" },
  { manualDisabled: "yes" },
  { keyword: "x".repeat(101) },
])("rejects invalid filters before any HTTP %j", async (filters) => {
  const request = vi.fn<RagRequest>();
  await expect(
    readRagPage(request, ragOperator, filters, 1, 20, signal()),
  ).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});
it.each([
  [0, 20],
  [1, 101],
  [2147483648, 1],
  [2147483647, 20],
])("rejects invalid page %i/%i", async (page, size) => {
  const request = vi.fn<RagRequest>();
  await expect(
    readRagPage(request, ragOperator, {}, page, size, signal()),
  ).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});
it("checks identity before/after page and detail reads, with one signal and no-store", async () => {
  const request = vi
    .fn<RagRequest>()
    .mockResolvedValueOnce(ragOperator)
    .mockResolvedValueOnce({ ...ragPage, private: 1 })
    .mockResolvedValueOnce(ragOperator);
  const abort = signal();
  expect(await readRagPage(request, ragOperator, {}, 1, 20, abort)).toEqual(
    ragPage,
  );
  expect(request.mock.calls.map(([path]) => path)).toEqual([
    "/auth/me",
    "/admin/ai/sources?page=1&pageSize=20",
    "/auth/me",
  ]);
  expect(
    request.mock.calls.every(
      ([, options]) =>
        options?.signal === abort && options.cache === "no-store",
    ),
  ).toBe(true);
  const detail = ragCommandRequest();
  expect(await readRagSource(detail, ragOperator, 8, abort)).toEqual(ragSource);
  expect(detail.mock.calls.map(([path]) => path)).toEqual([
    "/auth/me",
    "/admin/ai/sources/8",
    "/auth/me",
  ]);
});
it.each([
  { status: "failed" },
  { sourceType: "resort" },
  { manualDisabled: "true" },
])("rejects response outside selected filters %j", async (filters) => {
  const request = vi
    .fn<RagRequest>()
    .mockResolvedValueOnce(ragOperator)
    .mockResolvedValueOnce(ragPage);
  await expect(
    readRagPage(request, ragOperator, filters, 1, 20, signal()),
  ).rejects.toThrow();
});
it.each(["before", "after"])(
  "rejects %s-read identity change",
  async (phase) => {
    const changed = { ...ragOperator, account: "changed" };
    const request = vi
      .fn<RagRequest>()
      .mockResolvedValueOnce(phase === "before" ? changed : ragOperator)
      .mockResolvedValueOnce(ragSource)
      .mockResolvedValueOnce(changed);
    await expect(
      readRagSource(request, ragOperator, 8, signal()),
    ).rejects.toThrow("身份");
    expect(request).toHaveBeenCalledTimes(phase === "before" ? 1 : 3);
  },
);
it("submits one command after exact target/version and grant preflight, then checks identity", async () => {
  const request = ragCommandRequest(),
    dispatched = vi.fn(),
    abort = signal();
  expect(
    await writeRagCommand(
      request,
      ragOperator,
      ragSource,
      "reindex",
      "  review  ",
      abort,
      dispatched,
    ),
  ).toEqual(commandResult());
  expect(dispatched).toHaveBeenCalledTimes(1);
  expect(request.mock.calls.map(([path]) => path)).toEqual([
    "/auth/me",
    "/admin/ai/sources/8",
    "/auth/me",
    "/auth/me",
    "/admin/ai/sources/8/reindex",
    "/auth/me",
  ]);
  expect(request.mock.calls[4]).toEqual([
    "/admin/ai/sources/8/reindex",
    {
      method: "POST",
      cache: "no-store",
      signal: abort,
      body: { expectedVersion: 4, reason: "review" },
    },
  ]);
});
it.each([{ controlVersion: 5 }, { sourceKey: "article:99" }, { sourceId: 99 }])(
  "does not dispatch for stale target/version %j",
  async (change) => {
    const request = ragCommandRequest();
    request.mockImplementation(async (path) =>
      path === "/auth/me" ? ragOperator : { ...ragSource, ...change },
    );
    const dispatched = vi.fn();
    await expect(
      writeRagCommand(
        request,
        ragOperator,
        ragSource,
        "disable",
        "review",
        signal(),
        dispatched,
      ),
    ).rejects.toThrow("变化");
    expect(dispatched).not.toHaveBeenCalled();
    expect(request.mock.calls.some(([, options]) => options?.method)).toBe(
      false,
    );
  },
);
it("does not send unauthorized/invalid commands, and never replays invalid acknowledgements", async () => {
  const request = ragCommandRequest(),
    dispatched = vi.fn();
  await expect(
    writeRagCommand(
      request,
      ragOperator,
      ragSource,
      "reindex",
      " ",
      signal(),
      dispatched,
    ),
  ).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
  await expect(
    writeRagCommand(
      request,
      {
        ...ragOperator,
        permissionKeys: ["management:portal:enter", "ai:knowledge:list"],
      },
      ragSource,
      "reindex",
      "reason",
      signal(),
      dispatched,
    ),
  ).rejects.toThrow();
  expect(dispatched).not.toHaveBeenCalled();
  const malformed = ragCommandRequest({ ...commandResult(), eventId: null });
  await expect(
    writeRagCommand(
      malformed,
      ragOperator,
      ragSource,
      "reindex",
      "reason",
      signal(),
      dispatched,
    ),
  ).rejects.toThrow();
  expect(
    malformed.mock.calls.filter(([, options]) => options?.method),
  ).toHaveLength(1);
});
it("aborted reads stop before dispatch and unknown HTTP failures are not retried", async () => {
  const controller = new AbortController(),
    request = ragCommandRequest();
  controller.abort();
  await expect(
    readRagSource(request, ragOperator, 8, controller.signal),
  ).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
  request.mockImplementation(async (path, options) => {
    if (options?.method) throw new Error("private-network");
    return path === "/auth/me" ? ragOperator : ragSource;
  });
  await expect(
    writeRagCommand(
      request,
      ragOperator,
      ragSource,
      "reindex",
      "reason",
      signal(),
      vi.fn(),
    ),
  ).rejects.toThrow();
  expect(
    request.mock.calls.filter(([, options]) => options?.method),
  ).toHaveLength(1);
});
