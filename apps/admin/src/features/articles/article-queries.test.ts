import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import {
  prepareArticleSave,
  saveManagedArticle,
  prepareArticleCommand,
  sendArticleCommand,
  readArticlePage,
  readArticle,
  readArticleForm,
  readArticleReview,
  type ArticleRequest,
} from "@/features/articles/article-queries";
import {
  operator,
  article,
  input,
  deferred,
  articleDictionaryFixture,
} from "@/features/articles/article-fixtures.test-helper";
import {
  testArticleField,
  testArticleSchema,
} from "@/features/articles/__tests__/fixtures";
import { type ArticleInput } from "@/features/articles/article-model";

function setup() {
  const schema = testArticleSchema([testArticleField("note")]);
  const source = vi.fn(async (path: string) => {
    if (path === "/auth/me") return operator;
    if (path === "/admin/articles/7") return article;
    if (path === "/admin/articles/custom-fields") return schema;
    if (path.startsWith("/admin/articles?"))
      return new URL(path, "http://localhost").searchParams.get("page") === "2"
        ? { items: [], total: 1, page: 2, pageSize: 20 }
        : { items: [article], total: 1, page: 1, pageSize: 20 };
    if (path.startsWith("/admin/dictionaries/"))
      return articleDictionaryFixture(
        decodeURIComponent(path.slice("/admin/dictionaries/".length)),
      );
    return article;
  });
  return {
    schema,
    source,
    request: source as ArticleRequest,
    signal: new AbortController().signal,
  };
}
describe("article reads and command preparation", () => {
  it("verifies the actor and uses no-store before loading a filtered page", async () => {
    const s = setup();
    await readArticlePage(
      s.request,
      operator,
      { page: 2, keyword: " x ", status: "draft" },
      s.signal,
    );
    expect(s.source.mock.calls.map(([path]) => path)).toEqual([
      "/auth/me",
      "/admin/articles?page=2&pageSize=20&keyword=x&status=draft",
      "/auth/me",
    ]);
    for (const call of vi.mocked(s.request).mock.calls)
      expect(call[1]).toMatchObject({ signal: s.signal, cache: "no-store" });
  });
  it("rejects invalid pagination before any request", async () => {
    const s = setup();
    await expect(
      readArticlePage(s.request, operator, { page: 0 }, s.signal),
    ).rejects.toThrow();
    expect(s.source).not.toHaveBeenCalled();
  });
  it("does not fetch private data after the cookie identity changes", async () => {
    const s = setup();
    s.source.mockResolvedValue({ ...operator, userId: 2 } as never);
    await expect(
      readArticle(s.request, operator, 7, s.signal),
    ).rejects.toThrow();
    expect(s.source).toHaveBeenCalledTimes(1);
  });
  it("does not fetch content after cancellation during /auth/me", async () => {
    const s = setup(),
      pending = deferred<unknown>(),
      controller = new AbortController();
    s.source.mockImplementation(() => pending.promise as never);
    const result = readArticle(s.request, operator, 7, controller.signal);
    controller.abort();
    pending.resolve(operator);
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(s.source).toHaveBeenCalledTimes(1);
  });
  it.each([0, 1.5, 2147483648])("rejects invalid detail id %s", async (id) => {
    const s = setup();
    await expect(
      readArticle(s.request, operator, id, s.signal),
    ).rejects.toThrow();
    expect(s.source).not.toHaveBeenCalled();
  });
  it("rejects a mismatched detail response", async () => {
    const s = setup();
    s.source.mockImplementation(async (path) =>
      path === "/auth/me"
        ? (operator as never)
        : ({ ...article, articleId: 8 } as never),
    );
    await expect(
      readArticle(s.request, operator, 7, s.signal),
    ).rejects.toThrow();
  });
  it("loads the complete form only after confirming identity", async () => {
    const s = setup();
    const result = await readArticleForm(s.request, operator, 7, s.signal);
    expect(result.article).toEqual(article);
    expect(s.source.mock.calls[0]?.[0]).toBe("/auth/me");
  });
  it("requires the latest version before editing and leaves the schema untouched on conflict", async () => {
    const s = setup();
    await expect(
      prepareArticleSave(
        s.request,
        operator,
        {
          article: { ...article, version: 0 },
          schema: s.schema,
          values: input,
        },
        s.signal,
      ),
    ).rejects.toThrow("版本");
    expect(s.source.mock.calls.map(([path]) => path)).toEqual([
      "/auth/me",
      "/admin/articles/7",
      "/auth/me",
    ]);
  });
  it("requires the latest field policies before constructing a patch", async () => {
    const s = setup();
    await expect(
      prepareArticleSave(
        s.request,
        operator,
        { article, schema: testArticleSchema([]), values: input },
        s.signal,
      ),
    ).rejects.toThrow("字段定义");
  });
  it("creates a whitelisted patch from current metadata without copying hidden fields", async () => {
    const s = setup();
    const values = {
      ...input,
      status: "published",
      customFields: { note: "new", hidden: "attack" },
    };
    const result = await prepareArticleSave(
      s.request,
      operator,
      {
        article: { ...article, customFields: { hidden: "secret" } },
        schema: s.schema,
        values,
      },
      s.signal,
    );
    expect(result).toEqual({ ...input, customFields: { note: "new" } });
    expect(result).not.toHaveProperty("status");
  });
  it("validates creation identity before requesting field metadata", async () => {
    const s = setup();
    await prepareArticleSave(
      s.request,
      operator,
      { schema: s.schema, values: input },
      s.signal,
    );
    expect(s.source.mock.calls.map(([path]) => path)).toEqual([
      "/auth/me",
      "/admin/articles/custom-fields",
      "/auth/me",
    ]);
  });
  it.each(["publish", "withdraw"] as const)(
    "rechecks current state before %s without updating content",
    async (action) => {
      const s = setup();
      if (action === "publish") {
        s.source.mockImplementation(async (path) =>
          path === "/auth/me"
            ? (operator as never)
            : ({
                ...article,
                status: "published",
                publishTime: article.createTime,
              } as never),
        );
      }
      await expect(
        prepareArticleCommand(s.request, operator, 7, action, s.signal),
      ).rejects.toThrow("状态");
      expect(s.source.mock.calls.map(([path]) => path)).toEqual([
        "/auth/me",
        "/admin/articles/7",
        "/auth/me",
      ]);
    },
  );
  it("rejects a stale command version and permits a current command", async () => {
    const s = setup();
    await expect(
      prepareArticleCommand(s.request, operator, 7, "publish", s.signal, 0),
    ).rejects.toThrow("版本");
    expect(
      await prepareArticleCommand(
        s.request,
        operator,
        7,
        "publish",
        s.signal,
        1,
      ),
    ).toBe(7);
  });
  it.each(["publish", "withdraw", "delete"] as const)(
    "sends only the explicit %s command",
    async (action) => {
      const s = setup();
      s.source.mockResolvedValue({
        ...article,
        status: action === "publish" ? "published" : "withdrawn",
        publishTime: article.createTime,
      } as never);
      await sendArticleCommand(s.request, 7, action, s.signal);
      expect(vi.mocked(s.request)).toHaveBeenCalledWith(
        `/admin/articles/7${action === "delete" ? "" : `/${action}`}`,
        { method: action === "delete" ? "DELETE" : "PATCH", signal: s.signal },
      );
    },
  );
  it.each([undefined, 7])(
    "uses the existing save contract for id %s",
    async (id) => {
      const s = setup();
      await saveManagedArticle(s.request, id, input, s.signal);
      expect(vi.mocked(s.request)).toHaveBeenCalledWith(
        id ? "/admin/articles/7" : "/admin/articles",
        { method: id ? "PATCH" : "POST", body: input, signal: s.signal },
      );
    },
  );
  it("rejects a save response with a mismatched target", async () => {
    const s = setup();
    s.source.mockResolvedValue({ ...article, articleId: 8 } as never);
    await expect(
      saveManagedArticle(s.request, 7, input, s.signal),
    ).rejects.toThrow("文章资料不匹配");
  });
  it("reads create candidates without treating search results as proof of success", async () => {
    const s = setup();
    const result = await readArticleReview(
      s.request,
      operator,
      [{ action: "create", title: input.title }],
      s.signal,
    );
    expect(result[0]).toContain("候选");
    expect(result[0]).toContain("#7");
  });
  it("handles an unknown deleted/hidden target without claiming deletion succeeded", async () => {
    const s = setup();
    s.source.mockImplementation(async (path) => {
      if (path === "/auth/me") return operator as never;
      throw new ApiError("not found", {
        status: 404,
        code: 404,
        traceId: null,
      });
    });
    expect(
      (
        await readArticleReview(
          s.request,
          operator,
          [{ action: "delete", articleId: 7 }],
          s.signal,
        )
      )[0],
    ).toContain("404不能证明删除成功");
  });
  it("does not convert a denied review to an acknowledgement", async () => {
    const s = setup();
    s.source.mockRejectedValue(
      new ApiError("denied", { status: 403, code: 403, traceId: null }),
    );
    await expect(
      readArticleReview(
        s.request,
        operator,
        [{ action: "save", articleId: 7 }],
        s.signal,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("preserves explicit per-field null in a prepared patch", async () => {
    const s = setup();
    const result = await prepareArticleSave(
      s.request,
      operator,
      {
        article: { ...article, customFields: { note: "old" } },
        schema: s.schema,
        values: { ...input, customFields: { note: null } } as ArticleInput,
      },
      s.signal,
    );
    expect(result.customFields).toEqual({ note: null });
  });
});
