import { expect, it, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import {
  item,
  operator,
  input,
} from "@/features/project-knowledge/knowledge-fixtures.test-helper";
import {
  readKnowledge,
  readKnowledgePage,
  readKnowledgeReview,
  saveKnowledge,
  sendKnowledgeCommand,
  type KnowledgeRequest,
} from "@/features/project-knowledge/knowledge-queries";
import {
  knowledgePath,
  knowledgeWorkspaceKey,
} from "@/features/project-knowledge/knowledge-model";
const signal = () => new AbortController().signal;
function source(value: unknown) {
  return vi.fn(async (path: string) =>
    path === "/auth/me" ? operator : value,
  );
}
it.each([
  null,
  [],
  { ...item, title: null },
  { ...item, content: [] },
  { ...item, category: 1 },
  { ...item, version: 0 },
  { ...item, version: "2" },
  { ...item, version: 2147483648 },
  { ...item, status: ["draft"] },
  { ...item, status: "deleted" },
  { ...item, sourceUrl: 1 },
  { ...item, sourceUrl: "javascript:alert(1)" },
  { ...item, sourceUrl: "https://user:password@example.com/" },
  { ...item, createTime: "2026-11-01" },
  { ...item, updateTime: null },
  { ...item, publishTime: "bad" },
])("rejects malformed knowledge %j", async (value) => {
  await expect(
    readKnowledge(source(value) as KnowledgeRequest, operator, 7, signal()),
  ).rejects.toThrow();
});
it("projects knowledge without backend internals", async () => {
  expect(
    await readKnowledge(
      source({ ...item, internal: { apiKey: "secret" } }) as KnowledgeRequest,
      operator,
      7,
      signal(),
    ),
  ).toEqual(item);
});
const page = { items: [item], page: 1, pageSize: 20, total: 1, hasNext: false };
it.each([
  { ...page, page: 2 },
  { ...page, pageSize: 12 },
  { ...page, total: -1 },
  { ...page, total: 21 },
  { ...page, total: 0 },
  { ...page, hasNext: true },
  { ...page, items: [item, item], total: 2 },
  { ...page, items: [{ ...item, status: "withdrawn" }] },
])("rejects wrong knowledge page %j", async (value) => {
  await expect(
    readKnowledgePage(
      source(value) as KnowledgeRequest,
      operator,
      { page: 1, status: "draft" },
      signal(),
    ),
  ).rejects.toThrow();
});
it("rejects nonstring keyword instead of coercion", () => {
  expect(() => knowledgePath({ page: 1, keyword: ["FAQ"] } as never)).toThrow();
});
it.each(["account", "merchant"] as const)(
  "includes %s in knowledge identity",
  (key) => {
    const changed =
      key === "account"
        ? { ...operator, account: "changed" }
        : { ...operator, merchant: { merchantId: 3, businessName: "changed" } };
    expect(knowledgeWorkspaceKey(changed)).not.toBe(
      knowledgeWorkspaceKey(operator),
    );
  },
);
it("rejects malformed local identity before private requests", async () => {
  const mock = source(item);
  await expect(
    readKnowledge(
      mock as KnowledgeRequest,
      { ...operator, account: "" },
      7,
      signal(),
    ),
  ).rejects.toThrow();
  expect(mock).not.toHaveBeenCalled();
});
it.each([false, true])(
  "rejects read-end authorization changes including404 (missing=%s)",
  async (missing) => {
    let identities = 0;
    const mock = vi.fn(async (path: string) => {
      if (path === "/auth/me")
        return ++identities === 1
          ? operator
          : { ...operator, permissionKeys: [] };
      if (missing)
        throw new ApiError("missing", {
          status: 404,
          code: 404,
          traceId: null,
        });
      return item;
    });
    const task = missing
      ? readKnowledgeReview(
          mock as KnowledgeRequest,
          operator,
          [{ action: "delete", projectKnowledgeId: 7 }],
          signal(),
        )
      : readKnowledge(mock as KnowledgeRequest, operator, 7, signal());
    await expect(task).rejects.toThrow("授权");
    expect(identities).toBe(2);
  },
);
it.each([
  { ...item, updateTime: null },
  { ...item, status: ["draft"] },
  { ...item, publishTime: "bad" },
])("does not confirm malformed save receipt %j", async (value) => {
  await expect(
    saveKnowledge(
      source(value) as KnowledgeRequest,
      7,
      { ...input, version: 2 },
      signal(),
    ),
  ).rejects.toThrow();
});
it.each(["publish", "withdraw"] as const)(
  "requires a matching %s state receipt",
  async (action) => {
    await expect(
      sendKnowledgeCommand(
        source(item) as KnowledgeRequest,
        7,
        action,
        signal(),
      ),
    ).rejects.toThrow();
  },
);
it("requires an empty delete receipt", async () => {
  await expect(
    sendKnowledgeCommand(
      source(item) as KnowledgeRequest,
      7,
      "delete",
      signal(),
    ),
  ).rejects.toThrow();
});
it("rejects an unknown command before network access", async () => {
  const mock = source(item);
  await expect(
    sendKnowledgeCommand(
      mock as KnowledgeRequest,
      7,
      "restore" as never,
      signal(),
    ),
  ).rejects.toThrow();
  expect(mock).not.toHaveBeenCalled();
});
