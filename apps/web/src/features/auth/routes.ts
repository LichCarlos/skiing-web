import type { Route } from "next";

export const authRoutes = {
  login: "/login" as Route,
  loginFor: (returnTo: string) =>
    `/login?returnTo=${encodeURIComponent(returnTo)}` as Route,
} as const;
