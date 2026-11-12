import type {
  ArticleOperator,
  ManagedArticle,
  ArticleInput,
} from "@/features/articles/article-model";
export const operator: ArticleOperator = {
  userId: 1,
  account: "editor",
  nickname: "编辑",
  avatarUrl: null,
  merchant: null,
  roles: [{ roleKey: "custom_editor", roleName: "编辑" }],
  menuTree: [],
  permissionKeys: [
    "management:portal:enter",
    "content:article:manage",
    "system:dict:list",
  ],
};
export const article: ManagedArticle = {
  articleId: 7,
  title: "滑雪入门",
  summary: "新手知识",
  body: "保留完整正文",
  category: { value: "beginner", label: "入门" },
  coverAssetId: null,
  coverUrl: null,
  authorName: "编辑",
  status: "draft",
  publishTime: null,
  version: 1,
  customFields: {},
  createTime: "2026-11-01T00:00:00.000Z",
  updateTime: "2026-11-01T00:00:00.000Z",
};
export const input: ArticleInput = {
  title: article.title,
  summary: article.summary,
  body: article.body,
  categoryValue: article.category.value,
  coverAssetId: null,
  customFields: {},
};
export function articleDictionaryFixture(
  dictType = "knowledge.article_category",
) {
  return {
    dictType,
    dictName: "文章字典",
    groupKey: "knowledge",
    status: "active",
    publiclyReadable: false,
    items: [] as Array<{
      itemId: number;
      parentId: number | null;
      value: string;
      label: string;
      status: string;
      children: never[];
      sortOrder: number;
      isDefault: boolean;
      color: null;
    }>,
  };
}
export function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (cause: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
