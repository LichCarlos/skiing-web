import type { Route } from "next";

export const aiRoutes = {
  memberAi: (conversationId?: string, page = 1) => {
    const query = new URLSearchParams();
    if (conversationId) query.set("conversation", conversationId);
    if (page > 1) query.set("page", String(page));
    return `/me/ai${query.size ? `?${query}` : ""}` as Route;
  },
} as const;
