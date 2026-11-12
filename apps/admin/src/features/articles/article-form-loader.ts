import type { components } from "@common/api-contracts/openapi";
import {
  articleOptionDictionaries,
  type ArticleFieldSchema,
  type ArticleFieldOptions,
} from "@/features/articles/article-field-model";
import { parseDictionary } from "@/features/dictionaries/dictionary-queries";
import {
  parseManagedArticle,
  parseArticleFieldSchema,
} from "@/features/articles/article-responses";

export type ManagedArticle = components["schemas"]["AdminArticleVO"];
type DictionaryItem = components["schemas"]["DictionaryItemVO"];
export type ArticleFormRequest = <T>(
  path: string,
  options: { signal: AbortSignal },
) => Promise<T>;

export async function loadArticleFormData(
  request: ArticleFormRequest,
  articleId: number | undefined,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const categoryType = "knowledge.article_category";
  const [dictionaryValue, schemaValue, articleValue] = await Promise.all([
    request<unknown>(
      `/admin/dictionaries/${encodeURIComponent(categoryType)}`,
      { signal },
    ),
    request<unknown>("/admin/articles/custom-fields", { signal }),
    articleId
      ? request<unknown>(`/admin/articles/${articleId}`, { signal })
      : Promise.resolve(null),
  ]);
  signal.throwIfAborted();
  const dictionary = parseDictionary(dictionaryValue),
    schema = parseArticleFieldSchema(schemaValue),
    article =
      articleId === undefined
        ? null
        : parseManagedArticle(articleValue, articleId);
  if (dictionary.dictType !== categoryType)
    throw new Error("文章分类字典不匹配");
  if (dictionary.status !== "active") throw new Error("文章分类字典已停用");
  const entries = await Promise.all(
    articleOptionDictionaries(schema).map(async (dictType) => {
      const dict =
        dictType === categoryType
          ? dictionary
          : parseDictionary(
              await request<unknown>(
                `/admin/dictionaries/${encodeURIComponent(dictType)}`,
                { signal },
              ),
            );
      if (dict.dictType !== dictType)
        throw new Error("文章扩展字段选项字典不匹配");
      if (dict.status !== "active")
        throw new Error("文章扩展字段选项字典已停用");
      return [dictType, flattenActive(dict.items)] as const;
    }),
  );
  signal.throwIfAborted();
  const options: ArticleFieldOptions = Object.fromEntries(entries);
  return {
    categories: flattenActive(dictionary.items),
    schema,
    article,
    options,
  };
}

function flattenActive(
  items: DictionaryItem[],
): Array<{ value: string; label: string }> {
  const result: Array<{ value: string; label: string }> = [],
    stack = [...items].reverse();
  while (stack.length) {
    const item = stack.pop()!;
    if (item.status === "active")
      result.push({ value: item.value, label: item.label });
    for (let i = item.children.length - 1; i >= 0; i--)
      stack.push(item.children[i]!);
  }
  return result;
}
