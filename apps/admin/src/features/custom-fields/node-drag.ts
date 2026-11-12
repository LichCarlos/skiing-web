import type { EntityType } from "@/features/custom-fields/field-model";
import type { RelationshipNode } from "@/features/dictionaries/relationship-model";

export const nodeDragMime = "application/x-linji-config-node";
export type CreateNodeKind = "dictionary" | "item" | "group" | "field";
export function parseNodeDrag(value: string): CreateNodeKind | null {
  return ["dictionary", "item", "group", "field"].includes(value)
    ? (value as CreateNodeKind)
    : null;
}
export type NodeCreateIntent = {
  kind: CreateNodeKind;
  entityType?: EntityType;
  groupKey?: string;
  dictType?: string;
};
/** Drop target supplies context only. The existing form/API still validates every write. */
export function resolveNodeDrop(
  kind: CreateNodeKind,
  target: RelationshipNode | undefined,
  fallback: EntityType | undefined,
): NodeCreateIntent {
  const entityType = target?.entityType ?? fallback;
  if (kind === "dictionary") {
    if (target && !["entity", "group"].includes(target.kind))
      throw new Error("新字典请拖至业务实体、字段分组或画布空白处");
    return { kind, entityType };
  }
  if (kind === "item") {
    if (!target?.dictionary || target.dictionary.status !== "active")
      throw new Error("请将字典项拖至已启用的字典节点");
    return { kind, dictType: target.dictionary.dictType };
  }
  if (target && !["entity", "group"].includes(target.kind))
    throw new Error("请拖至业务实体或字段分组节点");
  if (!entityType) throw new Error("请先选择具体业务，或拖至对应的实体节点");
  if (kind === "group" && target?.kind === "group")
    throw new Error("分组不支持嵌套，请拖至业务实体或空白处");
  if (target?.group && target.group.status !== "active")
    throw new Error("停用的分组不能新增字段，请选择启用分组");
  return {
    kind,
    entityType,
    ...(kind === "field" && target?.group
      ? { groupKey: target.group.groupKey }
      : {}),
  };
}
