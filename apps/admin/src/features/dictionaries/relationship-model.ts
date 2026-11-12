import type {
  Dictionary,
  DictionaryUser,
} from "@/features/dictionaries/dictionary-model";
import {
  readAllDictionaries,
  type DictionaryRequest,
} from "@/features/dictionaries/dictionary-queries";
import {
  readFieldGroups,
  readFieldPage,
} from "@/features/custom-fields/field-queries";
import { fieldEntities } from "@/features/custom-fields/routes";
import type {
  EntityType,
  Field,
  Group,
} from "@/features/custom-fields/field-model";

export type RelationshipCatalog = {
  dictionaries: Dictionary[];
  fields: Field[];
  groups: Group[];
  fieldsReadable: boolean;
  groupsReadable: boolean;
};
export type RelationshipNode = {
  id: string;
  kind: "entity" | "group" | "field" | "builtin" | "dictionary";
  label: string;
  key: string;
  status?: string;
  entityType?: EntityType;
  field?: Field;
  group?: Group;
  dictionary?: Dictionary;
  missing?: boolean;
  column: number;
};
export type RelationshipEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
};
export const fixedBindings = [
  {
    entityType: "article",
    fieldKey: "category",
    label: "文章分类",
    dictType: "knowledge.article_category",
    storage: "Article.CategoryDictType + CategoryValue",
  },
  {
    entityType: "ski_resort",
    fieldKey: "fitTags",
    label: "适合标签",
    dictType: "resort.fit_tag",
    storage: "ResortFitTag.DictType + ItemId",
  },
] as const;

/** Publish a complete catalog only; no partial graphs after errors or pagination drift. */
export async function readRelationshipCatalog(
  request: DictionaryRequest,
  user: DictionaryUser,
  signal: AbortSignal,
): Promise<RelationshipCatalog> {
  const dictionaries = await readAllDictionaries(request, user, signal);
  const fieldsReadable = user.permissionKeys.includes("system:field:list");
  const groupsReadable =
    fieldsReadable && user.permissionKeys.includes("system:field-group:list");
  const fields: Field[] = [],
    groups: Group[] = [];
  const seen = new Set<number>();
  for (const entity of fieldEntities) {
    if (groupsReadable)
      groups.push(
        ...(await readFieldGroups(request, user, entity.value, signal)),
      );
    if (!fieldsReadable) continue;
    let total: number | undefined;
    for (let page = 1; ; page++) {
      signal.throwIfAborted();
      const value = await readFieldPage(
        request,
        user,
        entity.value,
        page,
        undefined,
        signal,
      );
      if (total !== undefined && total !== value.total)
        throw new Error("字段配置已变化，请刷新关系图");
      total = value.total;
      for (const field of value.items) {
        if (seen.has(field.fieldDefinitionId))
          throw new Error("字段配置重复，请刷新关系图");
        seen.add(field.fieldDefinitionId);
        fields.push(field);
      }
      if (page * 20 >= total) break;
    }
  }
  signal.throwIfAborted();
  return { dictionaries, fields, groups, fieldsReadable, groupsReadable };
}

/** Dictionary GroupKey is a display category, never an entity/group foreign key. */
export function buildRelationships(
  catalog: RelationshipCatalog,
  entityType?: EntityType,
) {
  const nodes: RelationshipNode[] = [],
    edges: RelationshipEdge[] = [];
  const addEdge = (source: string, target: string, label: string) =>
    edges.push({ id: JSON.stringify([source, target]), source, target, label });
  const groupId = (entity: string, key: string) => `group:${entity}:${key}`;
  const dictionaryId = (key: string) => `dictionary:${key}`;
  for (const entity of fieldEntities.filter(
    (item) => !entityType || item.value === entityType,
  )) {
    const entityId = `entity:${entity.value}`;
    nodes.push({
      id: entityId,
      kind: "entity",
      label: entity.label,
      key: entity.value,
      entityType: entity.value,
      column: 0,
    });
    for (const group of catalog.groups.filter(
      (item) => item.entityType === entity.value,
    )) {
      const id = groupId(entity.value, group.groupKey);
      nodes.push({
        id,
        kind: "group",
        label: group.label,
        key: group.groupKey,
        status: group.status,
        group,
        entityType: entity.value,
        column: 1,
      });
      addEdge(entityId, id, "字段分组");
    }
    for (const fixed of fixedBindings.filter(
      (item) => item.entityType === entity.value,
    )) {
      const id = `builtin:${entity.value}:${fixed.fieldKey}`;
      nodes.push({
        id,
        kind: "builtin",
        label: fixed.label,
        key: fixed.storage,
        entityType: entity.value,
        column: 2,
      });
      addEdge(entityId, id, "固定业务字段");
      addEdge(id, dictionaryId(fixed.dictType), "固定绑定");
    }
    for (const field of catalog.fields.filter(
      (item) => item.entityType === entity.value,
    )) {
      const id = `field:${field.fieldDefinitionId}`;
      nodes.push({
        id,
        kind: "field",
        label: field.label,
        key: field.fieldKey,
        status: field.status,
        field,
        entityType: entity.value,
        column: 2,
      });
      const group = catalog.groups.find(
        (item) =>
          item.entityType === entity.value && item.groupKey === field.groupKey,
      );
      if (group) addEdge(groupId(entity.value, group.groupKey), id, "包含字段");
      else
        addEdge(
          entityId,
          id,
          catalog.groupsReadable ? "分组待核对" : "分组无读取权限",
        );
      if (field.optionsDictType)
        addEdge(id, dictionaryId(field.optionsDictType), "选项字典");
    }
  }
  const referenced = new Set(edges.map((edge) => edge.target));
  for (const dictionary of catalog.dictionaries) {
    const id = dictionaryId(dictionary.dictType);
    if (entityType && !referenced.has(id)) continue;
    nodes.push({
      id,
      kind: "dictionary",
      label: dictionary.dictName,
      key: dictionary.dictType,
      dictionary,
      status: dictionary.status,
      column: 3,
    });
  }
  for (const id of referenced) {
    if (id.startsWith("dictionary:") && !nodes.some((node) => node.id === id)) {
      nodes.push({
        id,
        kind: "dictionary",
        label: "字典待配置或已缺失",
        key: id.slice("dictionary:".length),
        missing: true,
        column: 3,
      });
    }
  }
  return { nodes, edges };
}
