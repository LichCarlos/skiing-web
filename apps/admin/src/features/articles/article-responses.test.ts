import { expect, it, vi } from "vitest";
import {
  parseManagedArticle,
  parseArticlePage,
  parseArticleFieldSchema,
} from "@/features/articles/article-responses";
import {
  readArticle,
  readArticlePage,
  readArticleForm,
  saveManagedArticle,
  sendArticleCommand,
  type ArticleRequest,
} from "@/features/articles/article-queries";
import {
  article,
  operator,
  input,
  articleDictionaryFixture,
  deferred,
} from "@/features/articles/article-fixtures.test-helper";
import {
  testArticleField,
  testArticleSchema,
} from "@/features/articles/__tests__/fixtures";
import {
  articleWorkspaceKey,
  type ArticleOperator,
} from "@/features/articles/article-model";
import {
  ArticleRecoveryLedger,
  ArticleWriteGate,
} from "@/features/articles/article-workflow";
const signal = () => new AbortController().signal;
it("arbitrates simultaneous preparations from two mounted gates before dispatch", async () => {
  const ledger = new ArticleRecoveryLedger(),
    firstIdentity = deferred<ArticleOperator>(),
    secondIdentity = deferred<ArticleOperator>(),
    result = deferred<string>();
  const first = new ArticleWriteGate(
      operator,
      () => firstIdentity.promise,
      ledger,
      vi.fn(),
    ),
    second = new ArticleWriteGate(
      operator,
      () => secondIdentity.promise,
      ledger,
      vi.fn(),
    );
  first.activate();
  second.activate();
  const write = vi.fn(() => result.promise),
    mutation = { action: "save" as const, articleId: 7 };
  const a = first.run(mutation, async () => 1, write, vi.fn()),
    b = second.run(mutation, async () => 2, write, vi.fn());
  firstIdentity.resolve(operator);
  await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
  secondIdentity.resolve(operator);
  expect(await b).toEqual({ status: "ignored" });
  expect(ledger.entries(operator.userId)).toHaveLength(1);
  result.resolve("saved");
  expect(await a).toEqual({ status: "success" });
  expect(ledger.entries(operator.userId)).toEqual([]);
});
it.each([
  { articleId: 0 },
  { title: " " },
  { summary: 9 },
  { body: undefined },
  { category: null },
  { category: { value: "a", label: [] } },
  { coverAssetId: 1 },
  { coverAssetId: "9223372036854775808" },
  { coverUrl: "javascript:alert(1)" },
  { coverUrl: "https://u:p@example.com/a" },
  { authorName: [] },
  { status: "pending" },
  { status: "published", publishTime: null },
  { publishTime: article.createTime },
  { version: 1.5 },
  { customFields: [] },
  { customFields: { invalid: Infinity } },
  { customFields: { invalid: undefined } },
  { createTime: "bad" },
  { updateTime: "2026-10-30T00:00:00Z" },
])("rejects malformed article data %o", (change) =>
  expect(() => parseManagedArticle({ ...article, ...change })).toThrow(
    "文章资料不匹配",
  ),
);
it("projects complete articles and copies stored JSON without exposing additional VO fields", () => {
  const customFields = {
    zero: 0,
    no: false,
    empty: "",
    unset: null,
    nested: [false, { text: "内容" }],
  };
  const parsed = parseManagedArticle(
    {
      ...article,
      customFields,
      authorId: 99,
      privateMetadata: "private",
      category: { ...article.category, secret: true },
    },
    7,
  );
  expect(parsed).toEqual({ ...article, customFields });
  expect(parsed.customFields).not.toBe(customFields);
  expect(parsed.customFields.nested).not.toBe(customFields.nested);
  expect(() => parseManagedArticle(article, 8)).toThrow();
});
const page = {
  page: 1,
  pageSize: 20,
  total: 1,
  hasNext: false,
  items: [article],
};
it.each([
  { page: 2 },
  { pageSize: 100 },
  { total: -1 },
  { total: 2 },
  { hasNext: true },
  { items: [article, article], total: 2 },
  { items: [{ ...article, status: "withdrawn" }] },
])("rejects invalid or mismatched pages %o", (change) =>
  expect(() => parseArticlePage({ ...page, ...change }, 1, "draft")).toThrow(),
);
it("keeps optional hasNext, projects pages and accepts empty later pages", () => {
  expect(parseArticlePage({ ...page, internal: "secret" }, 1)).toEqual(page);
  expect(
    parseArticlePage({ page: 2, pageSize: 20, total: 1, items: [] }, 2),
  ).toEqual({ page: 2, pageSize: 20, total: 1, items: [] });
});
const schema = testArticleSchema([testArticleField("note")]);
it.each([
  { fieldDefinitionId: 0 },
  { groupKey: "other" },
  { fieldKey: "../bad" },
  { dataType: "html" },
  { canRead: "false" },
  { canRead: false, canWrite: false },
  { schemaVersion: 0 },
  { sortOrder: -1 },
  { validation: [] },
  { defaultValue: { invalid: NaN } },
])("rejects invalid field schema properties %o", (change) => {
  const value = testArticleSchema([testArticleField("note", change as never)]);
  // Keep an invalid ID supplied by this test rather than normalizing the fixture.
  if ("fieldDefinitionId" in change && change.fieldDefinitionId !== undefined)
    value.groups[0]!.fields[0]!.fieldDefinitionId = change.fieldDefinitionId;
  expect(() => parseArticleFieldSchema(value)).toThrow();
});
it("rejects duplicate group/field keys and IDs, and projects permissions and stored JSON", () => {
  for (const groups of [
    [...schema.groups, ...schema.groups],
    [
      {
        ...schema.groups[0]!,
        fields: [...schema.groups[0]!.fields, ...schema.groups[0]!.fields],
      },
    ],
  ])
    expect(() =>
      parseArticleFieldSchema({ entityType: "article", groups }),
    ).toThrow();
  const value = testArticleSchema([
    testArticleField("note", {
      canRead: false,
      canWrite: true,
      defaultValue: false,
    }),
  ]);
  expect(parseArticleFieldSchema({ ...value, privateExtra: true })).toEqual(
    value,
  );
});
it.each(["account", "merchant", "role", "grant"])(
  "refuses a late %s change before exposing a detail",
  async (kind) => {
    const changed: ArticleOperator =
      kind === "account"
        ? { ...operator, account: "changed" }
        : kind === "merchant"
          ? { ...operator, merchant: { merchantId: 3, businessName: "商家" } }
          : kind === "role"
            ? { ...operator, roles: [] }
            : {
                ...operator,
                permissionKeys: [...operator.permissionKeys, "extra:read"],
              };
    expect(articleWorkspaceKey(changed)).not.toBe(
      articleWorkspaceKey(operator),
    );
    let reads = 0;
    const request = vi.fn(async (path: string) =>
      path === "/auth/me" ? (++reads === 1 ? operator : changed) : article,
    ) as ArticleRequest;
    await expect(readArticle(request, operator, 7, signal())).rejects.toThrow(
      "权限已变化",
    );
  },
);
it.each(["list", "form"])(
  "checks identity after the complete %s response",
  async (kind) => {
    let reads = 0;
    const request = vi.fn(async (path: string) => {
      if (path === "/auth/me")
        return ++reads === 1 ? operator : { ...operator, userId: 2 };
      if (path.includes("custom-fields")) return schema;
      if (path.startsWith("/admin/dictionaries/"))
        return articleDictionaryFixture();
      return kind === "list" ? page : article;
    }) as ArticleRequest;
    await expect(
      kind === "list"
        ? readArticlePage(request, operator, { page: 1 }, signal())
        : readArticleForm(request, operator, 7, signal()),
    ).rejects.toThrow("权限已变化");
  },
);
it("rejects malformed local identities before private reads or form preparation", async () => {
  const invalid = {
    ...operator,
    merchant: undefined,
  } as unknown as ArticleOperator;
  const request = vi.fn() as ArticleRequest;
  await expect(readArticle(request, invalid, 7, signal())).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
  const prepare = vi.fn(async () => 1),
    write = vi.fn();
  const gate = new ArticleWriteGate(
    invalid,
    async () => operator,
    new ArticleRecoveryLedger(),
    vi.fn(),
  );
  gate.activate();
  expect(
    await gate.run({ action: "save", articleId: 7 }, prepare, write, vi.fn()),
  ).toMatchObject({ status: "error", uncertain: false });
  expect(prepare).not.toHaveBeenCalled();
});
it("does not publish or verify after cancellation during a detail read", async () => {
  const abort = new AbortController(),
    pending = deferred<unknown>();
  const request = vi.fn(async (path: string) =>
    path === "/auth/me" ? operator : pending.promise,
  ) as ArticleRequest;
  const task = readArticle(request, operator, 7, abort.signal);
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  abort.abort();
  pending.resolve(article);
  await expect(task).rejects.toThrow();
  expect(request).toHaveBeenCalledTimes(2);
});
it("invalid successful write receipts remain unknown in the original recovery ledger", async () => {
  const ledger = new ArticleRecoveryLedger(),
    gate = new ArticleWriteGate(
      operator,
      async () => operator,
      ledger,
      vi.fn(),
    );
  gate.activate();
  const request = vi.fn(async () => ({
    ...article,
    version: 0,
  })) as ArticleRequest;
  expect(
    await gate.run(
      { action: "save", articleId: 7 },
      async () => input,
      (body, abort) => saveManagedArticle(request, 7, body, abort),
      vi.fn(),
    ),
  ).toMatchObject({ status: "error", uncertain: true });
  expect(ledger.entries(operator.userId)).toMatchObject([
    { inFlight: false, mutation: { action: "save", articleId: 7 } },
  ]);
  expect(gate.isLocked()).toBe(true);
});
it("matches publish/withdraw receipts and refuses invalid targets before sending", async () => {
  const request = vi.fn(async () => article) as ArticleRequest;
  await expect(
    sendArticleCommand(request, 7, "publish", signal()),
  ).rejects.toThrow();
  const empty = vi.fn() as ArticleRequest;
  await expect(saveManagedArticle(empty, 0, input, signal())).rejects.toThrow();
  await expect(
    sendArticleCommand(empty, 0, "delete", signal()),
  ).rejects.toThrow();
  expect(empty).not.toHaveBeenCalled();
});
