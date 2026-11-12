import type { components } from "@common/api-contracts/openapi";

export type DashboardSummary = components["schemas"]["DashboardSummaryVO"];
export class SummaryInputError extends Error {}
function invalid(): never {
  throw new SummaryInputError("工作台响应不完整或不一致，请重新读取");
}
function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    invalid();
  return value;
}
function counts<K extends string>(value: unknown, keys: readonly K[]) {
  if (value === null) return null;
  const input = row(value);
  const result = Object.fromEntries(
    keys.map((key) => [key, count(input[key])]),
  ) as Record<K, number>;
  const total = count(input.total);
  if (keys.reduce((sum, key) => sum + result[key], 0) !== total) invalid();
  return { total, ...result };
}
export function parseSummary(value: unknown): DashboardSummary {
  const input = row(value);
  if (
    typeof input.generatedAt !== "string" ||
    !Number.isFinite(Date.parse(input.generatedAt)) ||
    new Date(input.generatedAt).toISOString() !== input.generatedAt
  )
    invalid();
  const rag =
    input.rag === null ? null : { failed: count(row(input.rag).failed) };
  let revenue: DashboardSummary["revenue"] = null;
  if (input.revenue !== null) {
    const item = row(input.revenue);
    if (
      typeof item.amount !== "string" ||
      !/^\d+\.\d{2}$/.test(item.amount) ||
      item.currency !== "CNY" ||
      item.period !== "all-time" ||
      (item.scope !== "all" && item.scope !== "merchant")
    )
      invalid();
    revenue = {
      amount: item.amount,
      currency: "CNY",
      period: "all-time",
      scope: item.scope,
    };
  }
  return {
    generatedAt: input.generatedAt,
    users: counts(input.users, ["active", "disabled"]),
    merchants: counts(input.merchants, ["active", "disabled"]),
    resorts: counts(input.resorts, [
      "draft",
      "pendingReview",
      "published",
      "offline",
    ]),
    articles: counts(input.articles, ["draft", "published", "withdrawn"]),
    dynamics: counts(input.dynamics, ["pending", "published", "hidden"]),
    rag,
    revenue,
  };
}
