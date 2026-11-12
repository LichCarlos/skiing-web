import type { Route } from "next";

export const memberRoutes = {
  member: "/me" as Route,
  memberNew: "/me/new" as Route,
  memberNote: (id: number) => `/me/notes/${id}` as Route,
  memberCollection: (type = "dynamic", page = 1) =>
    `/me?tab=favorites&type=${type}&page=${page}` as Route,
} as const;
