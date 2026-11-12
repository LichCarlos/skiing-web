import type {
  ArticleField,
  ArticleFieldSchema,
} from "@/features/articles/article-field-model";
export function testArticleField(
  fieldKey: string,
  change: Partial<ArticleField> = {},
): ArticleField {
  return {
    fieldDefinitionId: 1,
    fieldKey,
    label: fieldKey,
    dataType: "text",
    groupKey: "general",
    sortOrder: 0,
    required: false,
    defaultValue: null,
    optionsDictType: null,
    validation: null,
    schemaVersion: 1,
    canRead: true,
    canWrite: true,
    ...change,
  };
}
export function testArticleSchema(fields: ArticleField[]): ArticleFieldSchema {
  return {
    entityType: "article",
    groups: [
      {
        groupKey: "general",
        label: "基本扩展",
        sortOrder: 0,
        fields: fields.map((field, index) => ({
          ...field,
          fieldDefinitionId: index + 1,
        })),
      },
    ],
  };
}
