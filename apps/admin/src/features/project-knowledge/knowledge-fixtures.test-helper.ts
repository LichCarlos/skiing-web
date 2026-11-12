import type {
  Knowledge,
  KnowledgeInput,
  KnowledgeOperator,
} from "@/features/project-knowledge/knowledge-model";
export const operator: KnowledgeOperator = {
  userId: 1,
  account: "admin",
  nickname: "管理员",
  avatarUrl: null,
  merchant: null,
  menuTree: [],
  roles: [{ roleKey: "system_admin", roleName: "管理员" }],
  permissionKeys: [
    "management:portal:enter",
    ...["list", "create", "update", "publish", "withdraw", "delete"].map(
      (action) => `content:project-knowledge:${action}`,
    ),
  ],
};
export const item: Knowledge = {
  projectKnowledgeId: 7,
  title: "平台说明",
  content: "公开说明内容",
  category: "FAQ",
  sourceUrl: "https://example.com/docs",
  status: "draft",
  publishTime: null,
  version: 2,
  createTime: "2026-11-01T00:00:00.000Z",
  updateTime: "2026-11-01T00:00:00.000Z",
};
export const input: KnowledgeInput = {
  title: item.title,
  content: item.content,
  category: item.category,
  sourceUrl: item.sourceUrl,
};
export function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (cause: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
