import type { components } from "@common/api-contracts/openapi";
import {
  resort as resortCard,
  article as articleCard,
  dynamic as dynamicCard,
} from "@/features/home/home-fixtures.test-helper";
export const resort: components["schemas"]["PublicResortDetailVO"] = {
  ...resortCard,
  resortId: 7,
  name: "雪山",
  description: " 粉雪\n与雪道 ",
  address: null,
  longitude: 0,
  latitude: 0,
  galleryUrls: [],
  snowCondition: { value: "unknown", label: "雪况待更新", verifiedAt: null },
  openingHours: null,
  trailSummary: null,
  facilitySummary: null,
  officialUrl: null,
  updatedAt: "2026-11-03T00:00:00Z",
};
export const article: components["schemas"]["PublicArticleDetailVO"] = {
  ...articleCard,
  articleId: 7,
  title: "滑雪技巧",
  summary: "重心与转弯",
  body: "<安全正文>",
};
export const dynamic: components["schemas"]["DynamicDetailVO"] = {
  ...dynamicCard,
  dynamicId: 7,
  author: { ...dynamicCard.author, nickname: "雪友" },
  summary: "今日雪况",
  content: "<雪道正文>",
  imageUrls: [],
  updatedAt: "2026-11-03T00:00:00Z",
};
export const comment: components["schemas"]["CommentVO"] = {
  commentId: 9,
  author: dynamic.author,
  content: "<公开评论>",
  createdAt: "2026-11-03T00:00:00Z",
  status: "visible",
};
export const comments: components["schemas"]["CommentPageVO"] = {
  items: [comment],
  page: 1,
  pageSize: 20,
  total: 1,
  hasNext: false,
};
