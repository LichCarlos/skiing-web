import type { components } from "@common/api-contracts/openapi";
import { articleFieldChanges } from "@/features/articles/article-field-changes";

export type ArticleField = components["schemas"]["ArticleFieldDefinitionVO"];
export type ArticleFieldSchema = Omit<
  components["schemas"]["ArticleFieldSchemaVO"],
  "entityType"
> & { entityType: string };
export type ArticleFieldOptions = Record<
  string,
  Array<{ value: string; label: string }>
>;

export function initialArticleFields(
  schema: ArticleFieldSchema,
  original: Readonly<Record<string, unknown>>,
  editing: boolean,
): Record<string, unknown> {
  return Object.fromEntries(
    schema.groups.flatMap((group) =>
      group.fields.flatMap((field) => {
        if (field.canRead && Object.hasOwn(original, field.fieldKey))
          return [[field.fieldKey, original[field.fieldKey]]];
        // A write-only field on an existing record must stay untouched until edited.
        if (
          !editing &&
          field.canWrite &&
          field.defaultValue !== null &&
          isFieldValue(field.defaultValue)
        )
          return [[field.fieldKey, field.defaultValue]];
        return [];
      }),
    ),
  );
}

export function writableArticleChanges(
  schema: ArticleFieldSchema,
  submitted: Readonly<Record<string, unknown>>,
  original: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const supplied = Object.fromEntries(
    schema.groups.flatMap((group) =>
      group.fields.flatMap((field) =>
        field.canWrite &&
        Object.hasOwn(submitted, field.fieldKey) &&
        submitted[field.fieldKey] !== undefined
          ? [[field.fieldKey, submitted[field.fieldKey]]]
          : [],
      ),
    ),
  );
  return articleFieldChanges(supplied, original);
}

export function articleOptionDictionaries(
  schema: ArticleFieldSchema,
): string[] {
  return [
    ...new Set(
      schema.groups.flatMap((group) =>
        group.fields.flatMap((field) =>
          field.canWrite &&
          ["single_select", "multi_select"].includes(field.dataType) &&
          field.optionsDictType
            ? [field.optionsDictType]
            : [],
        ),
      ),
    ),
  ];
}

export function articleFieldRequired(field: ArticleField, editing: boolean) {
  return field.canWrite && field.required && (!editing || field.canRead);
}

function isFieldValue(value: unknown): boolean {
  return (
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"))
  );
}
