import { safeContentUrl } from "@common/ui";

export function logicalArticleLink(value: string) {
  const match = /^(article|resort):([1-9]\d{0,9})$/.exec(value);
  if (!match || Number(match[2]) > 2147483647) return null;
  return { type: match[1] as "article" | "resort", id: Number(match[2]) };
}
export function allowedArticleLink(value: string): boolean {
  return logicalArticleLink(value) !== null || safeContentUrl(value);
}
export function articleAssetReference(value: string): boolean {
  return (
    /^asset:[1-9]\d{0,18}$/.test(value) &&
    BigInt(value.slice(6)) <= 9223372036854775807n
  );
}
export function plainTextDocument(value: string) {
  return {
    type: "doc",
    content: value.split(/\r?\n/).map((line) => ({
      type: "paragraph",
      ...(line ? { content: [{ type: "text", text: line }] } : {}),
    })),
  };
}
