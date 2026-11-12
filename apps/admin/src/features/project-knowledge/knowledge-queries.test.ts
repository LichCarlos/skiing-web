import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import {
  readKnowledge,
  readKnowledgePage,
  prepareKnowledgeSave,
  saveKnowledge,
  prepareKnowledgeCommand,
  sendKnowledgeCommand,
  readKnowledgeReview,
  type KnowledgeRequest,
} from "@/features/project-knowledge/knowledge-queries";
import {
  operator,
  item,
  input,
  deferred,
} from "@/features/project-knowledge/knowledge-fixtures.test-helper";
function setup() {
  const source = vi.fn(async (path: string) =>
    path === "/auth/me"
      ? operator
      : path.includes("?")
        ? { items: [item], page: 1, pageSize: 20, total: 1, hasNext: false }
        : item,
  );
  return {
    source,
    request: source as KnowledgeRequest,
    signal: new AbortController().signal,
  };
}
describe("project knowledge query and write contracts", () => {
  it("reads current identity before a private detail and uses no-store", async () => {
    const s = setup();
    expect(await readKnowledge(s.request, operator, 7, s.signal)).toEqual(item);
    expect(s.source.mock.calls.map(([path]) => path)).toEqual([
      "/auth/me",
      "/admin/project-knowledge/7",
      "/auth/me",
    ]);
    for (const call of vi.mocked(s.request).mock.calls)
      expect(call[1]).toMatchObject({ signal: s.signal, cache: "no-store" });
  });
  it("stops after identity changes", async () => {
    const s = setup();
    s.source.mockResolvedValue({ ...operator, userId: 2 });
    await expect(
      readKnowledge(s.request, operator, 7, s.signal),
    ).rejects.toThrow();
    expect(s.source).toHaveBeenCalledTimes(1);
  });
  it("does not read content after cancellation while identity loads", async () => {
    const s = setup(),
      controller = new AbortController(),
      pending = deferred<typeof operator>();
    s.source.mockImplementation(() => pending.promise);
    const result = readKnowledge(s.request, operator, 7, controller.signal);
    controller.abort();
    pending.resolve(operator);
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(s.source).toHaveBeenCalledTimes(1);
  });
  it("rejects a mismatched target response", async () => {
    const s = setup();
    s.source.mockImplementation(async (path) =>
      path === "/auth/me" ? operator : { ...item, projectKnowledgeId: 8 },
    );
    await expect(
      readKnowledge(s.request, operator, 7, s.signal),
    ).rejects.toThrow();
  });
  it("rejects invalid page/id before making requests", async () => {
    const s = setup();
    await expect(
      readKnowledgePage(s.request, operator, { page: 0 }, s.signal),
    ).rejects.toThrow();
    await expect(
      readKnowledge(s.request, operator, 2147483648, s.signal),
    ).rejects.toThrow();
    expect(s.source).not.toHaveBeenCalled();
  });
  it("retains requested filters", async () => {
    const s = setup();
    s.source.mockImplementation(async (path) =>
      path === "/auth/me"
        ? operator
        : { items: [], page: 2, pageSize: 20, total: 20, hasNext: false },
    );
    await readKnowledgePage(
      s.request,
      operator,
      { page: 2, keyword: " FAQ ", status: "withdrawn" },
      s.signal,
    );
    expect(s.source.mock.calls[1]?.[0]).toBe(
      "/admin/project-knowledge?page=2&pageSize=20&keyword=FAQ&status=withdrawn",
    );
  });
  it("creates using only creation identity, without requesting a read API", async () => {
    const s = setup(),
      creator = {
        ...operator,
        permissionKeys: [
          "management:portal:enter",
          "content:project-knowledge:create",
        ],
      };
    s.source.mockResolvedValue(creator);
    expect(
      await prepareKnowledgeSave(
        s.request,
        creator,
        input,
        undefined,
        s.signal,
      ),
    ).toEqual(input);
    expect(s.source.mock.calls.map(([path]) => path)).toEqual(["/auth/me"]);
  });
  it("retains the loaded edit version and rejects an already changed record", async () => {
    const s = setup();
    expect(
      await prepareKnowledgeSave(s.request, operator, input, item, s.signal),
    ).toEqual({ ...input, version: 2 });
    await expect(
      prepareKnowledgeSave(
        s.request,
        operator,
        input,
        { ...item, version: 1 },
        s.signal,
      ),
    ).rejects.toThrow("保留当前修改");
  });
  it.each([undefined, 7])(
    "sends the exact save method/body for %s",
    async (id) => {
      const s = setup(),
        body = id ? { ...input, version: 2 } : input;
      await saveKnowledge(s.request, id, body, s.signal);
      expect(vi.mocked(s.request)).toHaveBeenCalledWith(
        id ? "/admin/project-knowledge/7" : "/admin/project-knowledge",
        { method: id ? "PATCH" : "POST", body, signal: s.signal },
      );
    },
  );
  it("does not treat a malformed save response as confirmation", async () => {
    const s = setup();
    s.source.mockResolvedValue({ ...item, projectKnowledgeId: 8 });
    await expect(
      saveKnowledge(s.request, 7, { ...input, version: 2 }, s.signal),
    ).rejects.toThrow("Unexpected");
  });
  it("does not send a state command for a stale displayed version", async () => {
    const s = setup();
    await expect(
      prepareKnowledgeCommand(s.request, operator, 7, "publish", 1, s.signal),
    ).rejects.toThrow("刷新核对");
    expect(
      await prepareKnowledgeCommand(
        s.request,
        operator,
        7,
        "publish",
        2,
        s.signal,
      ),
    ).toBe(7);
  });
  it.each(["publish", "withdraw", "delete"] as const)(
    "uses explicit %s command with no save body",
    async (action) => {
      const s = setup();
      const receipt =
        action === "delete"
          ? undefined
          : {
              ...item,
              status: action === "publish" ? "published" : "withdrawn",
            };
      s.source.mockResolvedValue(receipt as never);
      await sendKnowledgeCommand(s.request, 7, action, s.signal);
      expect(vi.mocked(s.request)).toHaveBeenCalledWith(
        `/admin/project-knowledge/7${action === "delete" ? "" : `/${action}`}`,
        { method: action === "delete" ? "DELETE" : "PATCH", signal: s.signal },
      );
    },
  );
  it("requires human review of creation candidates", async () => {
    const s = setup();
    const summaries = await readKnowledgeReview(
      s.request,
      operator,
      [{ action: "create", title: input.title }],
      s.signal,
    );
    expect(summaries[0]).toContain("#7");
    expect(summaries[0]).toContain("搜索不证明创建成功");
  });
  it("does not confuse a review 404 with proof of deletion", async () => {
    const s = setup();
    s.source.mockImplementation(async (path) => {
      if (path === "/auth/me") return operator;
      throw new ApiError("not found", {
        status: 404,
        code: 404,
        traceId: null,
      });
    });
    expect(
      (
        await readKnowledgeReview(
          s.request,
          operator,
          [{ action: "delete", projectKnowledgeId: 7 }],
          s.signal,
        )
      )[0],
    ).toContain("404不证明删除成功");
  });
  it("propagates a denied review instead of permitting acknowledgement", async () => {
    const s = setup();
    s.source.mockRejectedValue(
      new ApiError("denied", { status: 403, code: 403, traceId: null }),
    );
    await expect(
      readKnowledgeReview(
        s.request,
        operator,
        [{ action: "update", projectKnowledgeId: 7 }],
        s.signal,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});
