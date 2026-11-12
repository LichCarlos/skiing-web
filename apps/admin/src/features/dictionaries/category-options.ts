import type {
  Dictionary,
  DictionaryUser,
} from "@/features/dictionaries/dictionary-model";
import {
  readAllDictionaries,
  type DictionaryRequest,
} from "@/features/dictionaries/dictionary-queries";
import {
  readFieldPage,
  readFieldDetail,
} from "@/features/custom-fields/field-queries";
import { fieldEntities } from "@/features/custom-fields/routes";
import type { EntityType } from "@/features/custom-fields/field-model";

export const dictionaryGroups = [
  { value: "resort", label: "滑雪场" },
  { value: "knowledge", label: "文章" },
  { value: "community", label: "动态" },
  { value: "merchant", label: "商家资料" },
] as const;
export type CategoryOption = {
  value: string;
  label: string;
  dictType: string;
  dictName: string;
  groupKey: string;
  disabled: boolean;
  dictionary?: Dictionary;
  field?: { entityType: EntityType; id: number };
};
const builtins = [
  {
    value: "article.category",
    label: "文章 · 文章分类",
    dictType: "knowledge.article_category",
    dictName: "文章分类",
    groupKey: "knowledge",
  },
  {
    value: "ski_resort.fitTags",
    label: "滑雪场 · 适合标签",
    dictType: "resort.fit_tag",
    dictName: "雪场适合标签",
    groupKey: "resort",
  },
] as const;

export async function readCategoryOptions(
  request: DictionaryRequest,
  user: DictionaryUser,
  signal: AbortSignal,
) {
  const dictionaries = await readAllDictionaries(request, user, signal);
  const byKey = new Map(dictionaries.map((item) => [item.dictType, item]));
  const options: CategoryOption[] = builtins.map((item) => {
    const dictionary = byKey.get(item.dictType);
    return {
      ...item,
      dictionary,
      disabled: dictionary?.status === "disabled",
      groupKey: dictionary?.groupKey ?? item.groupKey,
    };
  });
  if (!user.permissionKeys.includes("system:field:list")) return options;
  for (const entity of fieldEntities) {
    let total: number | undefined;
    const seen = new Set<number>();
    for (let page = 1; ; page++) {
      signal.throwIfAborted();
      const value = await readFieldPage(
        request,
        user,
        entity.value,
        page,
        "active",
        signal,
      );
      if (total !== undefined && total !== value.total)
        throw new Error("字段配置已变化，请重新读取");
      total = value.total;
      for (const field of value.items) {
        if (seen.has(field.fieldDefinitionId))
          throw new Error("字段配置重复，请重新读取");
        seen.add(field.fieldDefinitionId);
        if (
          !["single_select", "multi_select"].includes(field.dataType) ||
          !field.optionsDictType
        )
          continue;
        const dictionary = byKey.get(field.optionsDictType);
        if (!dictionary || dictionary.status !== "active") continue;
        options.push({
          value: `${entity.value}:${field.fieldDefinitionId}`,
          label: `${entity.label} · ${field.label}`,
          dictType: dictionary.dictType,
          dictName: dictionary.dictName,
          groupKey: dictionary.groupKey,
          disabled: false,
          dictionary,
          field: { entityType: entity.value, id: field.fieldDefinitionId },
        });
      }
      if (page * 20 >= total) break;
    }
  }
  signal.throwIfAborted();
  return options;
}

export async function verifyCategoryField(
  request: DictionaryRequest,
  user: DictionaryUser,
  option: CategoryOption,
  signal: AbortSignal,
) {
  if (!option.field) return;
  const field = await readFieldDetail(
    request,
    user,
    option.field.entityType,
    option.field.id,
    signal,
  );
  if (
    field.status !== "active" ||
    !["single_select", "multi_select"].includes(field.dataType) ||
    field.optionsDictType !== option.dictType
  )
    throw new Error("所属字段或绑定字典已变化，请重新选择");
}
