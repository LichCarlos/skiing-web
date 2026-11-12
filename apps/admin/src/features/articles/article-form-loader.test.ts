import { describe, expect, it, vi } from "vitest";
import {
  loadArticleFormData,
  type ArticleFormRequest,
} from "@/features/articles/article-form-loader";
import {
  testArticleField,
  testArticleSchema,
} from "@/features/articles/__tests__/fixtures";

import {
  article,
  articleDictionaryFixture,
} from "@/features/articles/article-fixtures.test-helper";

function setup() {
  const schema = testArticleSchema([
    testArticleField("category", {
      dataType: "single_select",
      optionsDictType: "knowledge.article_category",
    }),
    testArticleField("level", {
      dataType: "single_select",
      optionsDictType: "level",
    }),
    testArticleField("levels", {
      dataType: "multi_select",
      optionsDictType: "level",
    }),
    testArticleField("hidden", {
      dataType: "single_select",
      optionsDictType: "private",
      canWrite: false,
    }),
  ]);
  const dictionary = {
    ...articleDictionaryFixture(),
    items: [
      {
        itemId: 1,
        parentId: null,
        sortOrder: 0,
        isDefault: false,
        color: null,
        value: "beginner",
        label: "初学者",
        status: "active",
        children: [],
      },
      {
        itemId: 2,
        parentId: null,
        sortOrder: 1,
        isDefault: false,
        color: null,
        value: "old",
        label: "停用",
        status: "disabled",
        children: [],
      },
    ],
  };
  const source = vi.fn(async (path: string): Promise<unknown> =>
    path === "/admin/articles/custom-fields"
      ? schema
      : path === "/admin/articles/19"
        ? { ...article, articleId: 19, customFields: {} }
        : {
            ...dictionary,
            dictType: decodeURIComponent(
              path.slice("/admin/dictionaries/".length),
            ),
          },
  );
  return { schema, dictionary, source, request: source as ArticleFormRequest };
}
describe("article form data loading", () => {
  it("loads authorized schema/detail, reuses category lookup and deduplicates writable dictionaries", async () => {
    const { source, request } = setup();
    const result = await loadArticleFormData(
      request,
      19,
      new AbortController().signal,
    );
    expect(result.article?.articleId).toBe(19);
    expect(result.categories).toEqual([{ value: "beginner", label: "初学者" }]);
    expect(result.options.level).toEqual(result.categories);
    expect(source.mock.calls.map(([path]) => path)).toEqual([
      "/admin/dictionaries/knowledge.article_category",
      "/admin/articles/custom-fields",
      "/admin/articles/19",
      "/admin/dictionaries/level",
    ]);
  });
  it("does not fetch an article for creation", async () => {
    const { request, source } = setup();
    expect(
      (
        await loadArticleFormData(
          request,
          undefined,
          new AbortController().signal,
        )
      ).article,
    ).toBeNull();
    expect(
      source.mock.calls.some(([path]) => path === "/admin/articles/undefined"),
    ).toBe(false);
  });
  it("propagates denied or unavailable option dictionaries without returning an incomplete form", async () => {
    const { source, request } = setup();
    source.mockImplementation(async (path) => {
      if (path === "/admin/dictionaries/level")
        throw new Error("denied options");
      return path === "/admin/articles/custom-fields"
        ? testArticleSchema([
            testArticleField("level", {
              dataType: "single_select",
              optionsDictType: "level",
            }),
          ])
        : articleDictionaryFixture(
            decodeURIComponent(path.slice("/admin/dictionaries/".length)),
          );
    });
    await expect(
      loadArticleFormData(request, undefined, new AbortController().signal),
    ).rejects.toThrow("denied options");
  });
  it("rejects disabled dictionaries before accepting options", async () => {
    const { dictionary, request } = setup();
    dictionary.status = "disabled";
    await expect(
      loadArticleFormData(request, undefined, new AbortController().signal),
    ).rejects.toThrow("文章分类字典已停用");
  });
  it("stops an aborted load without fetching any data", async () => {
    const { source, request } = setup(),
      controller = new AbortController();
    controller.abort();
    await expect(
      loadArticleFormData(request, 19, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(source).not.toHaveBeenCalled();
  });
});
