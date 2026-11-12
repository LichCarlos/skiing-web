export function articleFieldChanges(
  submitted: Record<string, unknown>,
  original: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(submitted).filter(
      ([key, value]) =>
        !Object.hasOwn(original, key) ||
        JSON.stringify(value) !== JSON.stringify(original[key]),
    ),
  );
}
