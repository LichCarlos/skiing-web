"use client";
import { ControlHint } from "@/components/control-hint";

import { useState } from "react";
import { App, Button, Empty, Input, Space, Tag, Tree } from "antd";
import type { DataNode } from "antd/es/tree";
import {
  dictionaryRows,
  dictionaryParents,
  type Dictionary,
  type Item,
  type ItemRow,
} from "@/features/dictionaries/dictionary-model";
import styles from "@/features/dictionaries/relationships.module.css";
import {
  NodePalette,
  useNodeDrop,
} from "@/features/custom-fields/node-palette";

export function DictionaryTree({
  dictionary,
  busy,
  canCreate,
  canUpdate,
  onCreate,
  onEdit,
  onMove,
}: {
  dictionary: Dictionary;
  busy: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  onCreate: (parentId?: number) => void;
  onEdit: (item: ItemRow) => void;
  onMove: (item: ItemRow, parentId: number | null) => void;
}) {
  const [query, setQuery] = useState("");
  const { message } = App.useApp();
  const [expanded, setExpanded] = useState<React.Key[]>(
    dictionaryRows(dictionary.items).map((item) => item.itemId),
  );
  const rows = new Map(
    dictionaryRows(dictionary.items).map((row) => [row.itemId, row]),
  );
  const search = query.trim().toLocaleLowerCase();
  const create = (targetId?: string) => {
    if (busy || !canCreate || dictionary.status !== "active") return;
    const target = targetId ? rows.get(Number(targetId)) : undefined;
    if (targetId && (!target || target.status !== "active")) {
      message.warning("请拖至启用的父级，或空白处创建根节点");
      return;
    }
    onCreate(target?.itemId);
  };
  const dropProps = useNodeDrop(
    (kind, target) => {
      if (kind === "item") create(target);
      else message.warning("此处仅接收新字典项");
    },
    busy || !canCreate || dictionary.status !== "active",
  );
  const matching = new Set<number>();
  if (search)
    for (const row of rows.values()) {
      if (`${row.label} ${row.value}`.toLocaleLowerCase().includes(search)) {
        let current: ItemRow | undefined = row;
        while (current && !matching.has(current.itemId)) {
          matching.add(current.itemId);
          current = current.parentId ? rows.get(current.parentId) : undefined;
        }
      }
    }
  const convert = (items: Item[]): DataNode[] =>
    items
      .filter((item) => !search || matching.has(item.itemId))
      .map((item) => ({
        key: item.itemId,
        title: (
          <div className={styles.treeRow} data-id={item.itemId}>
            <div className={styles.treeLabel}>
              <strong>{item.label}</strong>
              <span>{item.value}</span>
              {item.status !== "active" ? <Tag>停用</Tag> : null}
              {item.isDefault ? <Tag color="blue">默认</Tag> : null}
            </div>
            <Space wrap size={4}>
              {canCreate ? (
                <Button
                  size="small"
                  disabled={
                    busy ||
                    dictionary.status !== "active" ||
                    item.status !== "active"
                  }
                  aria-label={`在${item.label}下新增子项`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onCreate(item.itemId);
                  }}
                >
                  新增子项
                </Button>
              ) : null}
              {canUpdate ? (
                <Button
                  size="small"
                  disabled={busy}
                  aria-label={`编辑字典项${item.label}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onEdit(rows.get(item.itemId)!);
                  }}
                >
                  编辑
                </Button>
              ) : null}
            </Space>
          </div>
        ),
        children: convert(item.children),
      }));
  const data = convert(dictionary.items);
  return (
    <div className={styles.treePanel} {...dropProps}>
      {canCreate ? (
        <NodePalette
          kinds={["item"]}
          disabled={busy || dictionary.status !== "active"}
          onCreate={() => create()}
        />
      ) : null}
      <span className={styles.dragHint}>
        拖“新字典项”到父级创建子项；拖动已有项目调整父级，填写弹窗后保存。
      </span>
      <Space wrap>
        <ControlHint hint="按项目名称或保存值搜索；搜索期间需清空搜索后才能拖动已有节点。">
          <Input
            aria-label="搜索字典项"
            placeholder="搜索名称或保存值"
            value={query}
            allowClear
            onChange={(event) => setQuery(event.target.value)}
          />
        </ControlHint>
        <Button onClick={() => setExpanded([...rows.keys()])}>全部展开</Button>
        <Button
          onClick={() => {
            setQuery("");
            setExpanded([]);
          }}
        >
          全部收起
        </Button>
      </Space>
      {data.length ? (
        <Tree
          aria-label="字典项层级树"
          blockNode
          showLine
          selectable={false}
          expandedKeys={search ? [...matching] : expanded}
          onExpand={setExpanded}
          treeData={data}
          draggable={
            !busy && canUpdate && !search && dictionary.status === "active"
          }
          allowDrop={({ dragNode, dropNode, dropPosition }) => {
            const dragged = rows.get(Number(dragNode.key)),
              target = rows.get(Number(dropNode.key));
            if (!dragged || !target || busy) return false;
            const parentId =
              dropPosition !== 0 ? target.parentId : target.itemId;
            return (
              parentId === null ||
              parentId === undefined ||
              dictionaryParents(dictionary.items, dragged.itemId).some(
                (option) =>
                  option.value === parentId &&
                  rows.get(parentId)?.status === "active",
              )
            );
          }}
          onDrop={(info) => {
            if (busy || !canUpdate) return;
            const dragged = rows.get(Number(info.dragNode.key)),
              target = rows.get(Number(info.node.key));
            if (!dragged || !target) return;
            const parentId = info.dropToGap
              ? (target.parentId ?? null)
              : target.itemId;
            if (parentId === dragged.parentId) {
              message.info("父级未变化；同级顺序可在编辑弹窗调整“排序”");
              return;
            }
            if (
              parentId !== null &&
              !dictionaryParents(dictionary.items, dragged.itemId).some(
                (option) => option.value === parentId,
              )
            )
              return;
            onMove(dragged, parentId);
          }}
        />
      ) : (
        <Empty
          description={
            search ? "没有匹配的字典项" : "暂无字典项，点击上方按钮新增"
          }
        />
      )}
    </div>
  );
}
