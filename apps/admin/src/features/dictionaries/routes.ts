import type { Route } from "next";

export const dictionaryRoutes = {
  dictionaries: "/admin/system/dictionaries" as const,
};

export function isDictionaryType(value: string): boolean {
  return /^[a-z][a-z0-9._:-]{0,99}$/.test(value);
}

export function dictionaryDetailRoute(dictType: string): Route {
  if (!isDictionaryType(dictType)) throw new Error("字典类型键无效");
  return `${dictionaryRoutes.dictionaries}/${encodeURIComponent(dictType)}` as Route;
}

export function dictionaryTypeFromPath(path: string): string | null {
  const prefix = `${dictionaryRoutes.dictionaries}/`;
  if (!path.startsWith(prefix)) return null;
  try {
    const key = decodeURIComponent(path.slice(prefix.length));
    return isDictionaryType(key) ? key : null;
  } catch {
    return null;
  }
}
