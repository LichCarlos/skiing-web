import type { components } from "@common/api-contracts/openapi";
export const resort: components["schemas"]["PublicResortCardVO"] = {
  resortId: 11,
  name: "北岭雪场",
  region: { province: "河北", city: "张家口", district: null },
  coverUrl: null,
  rating: 4.5,
  ratingCount: 2,
  distanceMeters: null,
  startingPrice: "99.00",
  fitTags: [{ value: "beginner", label: "入门" }],
  openStatus: "open",
  favoriteByMe: false,
  customFields: [],
};
export const article: components["schemas"]["PublicArticleSummaryVO"] = {
  articleId: 22,
  favoriteByMe: false,
  title: "安全入门",
  summary: "学会观察雪道",
  coverUrl: null,
  category: { value: "safety", label: "安全" },
  authorName: null,
  publishTime: "2026-10-29T00:00:00Z",
};
export const dynamic: components["schemas"]["DynamicCardVO"] = {
  dynamicId: 33,
  author: { userId: 44, nickname: "雪友小白", avatarUrl: null },
  summary: "第一次上雪道",
  coverUrl: null,
  imageCount: 0,
  resort: null,
  likeCount: 5,
  commentCount: 2,
  likedByMe: false,
  status: "published",
  createdAt: "2026-10-28T02:00:00Z",
};
