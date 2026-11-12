"use client";
import { useState, type DragEvent } from "react";
import { Button, Typography } from "antd";
import {
  nodeDragMime,
  parseNodeDrag,
  type CreateNodeKind,
} from "@/features/custom-fields/node-drag";
import styles from "@/features/dictionaries/relationships.module.css";

export function NodePalette({
  kinds,
  disabled,
  onCreate,
}: {
  kinds: CreateNodeKind[];
  disabled: boolean;
  onCreate: (kind: CreateNodeKind) => void;
}) {
  const labels = {
    dictionary: "新字典",
    item: "新字典项",
    group: "新分组",
    field: "新字段",
  };
  return (
    <div className={styles.palette} aria-label="拖拽创建节点">
      <Typography.Text type="secondary">
        拖动节点到对应位置，填写表单后创建；也可点按创建。
      </Typography.Text>
      <div className={styles.paletteButtons}>
        {kinds.map((kind) => (
          <Button
            key={kind}
            disabled={disabled}
            draggable={!disabled}
            data-create-kind={kind}
            onDragStart={(event) => {
              event.dataTransfer.setData(nodeDragMime, kind);
              event.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => onCreate(kind)}
          >
            {labels[kind]}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function useNodeDrop(
  onDrop: (kind: CreateNodeKind, targetId?: string) => void,
  disabled: boolean,
) {
  const [over, setOver] = useState(false);
  const dragOver = (event: DragEvent<HTMLElement>) => {
    if (disabled || !event.dataTransfer.types.includes(nodeDragMime)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setOver(true);
  };
  const drop = (event: DragEvent<HTMLElement>) => {
    setOver(false);
    if (disabled) return;
    const kind = parseNodeDrag(event.dataTransfer.getData(nodeDragMime));
    if (!kind) return;
    event.preventDefault();
    event.stopPropagation();
    const targetId = (event.target as Element).closest<HTMLElement>("[data-id]")
      ?.dataset.id;
    onDrop(kind, targetId);
  };
  return {
    "data-drop-over": over || undefined,
    // Capture external palette drops before Ant Design Tree consumes native drag events.
    onDragOverCapture: dragOver,
    onDragLeave: (event: DragEvent<HTMLElement>) => {
      if (
        !event.currentTarget.contains(
          event.relatedTarget as globalThis.Node | null,
        )
      )
        setOver(false);
    },
    onDropCapture: drop,
  };
}
