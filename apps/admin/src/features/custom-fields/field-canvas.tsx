"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, App, Button, Select, Spin, Tree, Typography } from "antd";
import {
  ReactFlow,
  Controls,
  Position,
  type Node,
  type Edge,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  NodePalette,
  useNodeDrop,
} from "@/features/custom-fields/node-palette";
import {
  resolveNodeDrop,
  type CreateNodeKind,
} from "@/features/custom-fields/node-drag";
import { readFieldPage } from "@/features/custom-fields/field-queries";
import { fieldEntities } from "@/features/custom-fields/routes";
import { apiRequest } from "@/platform/api";
import type {
  EntityType,
  Field,
  Group,
  User,
} from "@/features/custom-fields/field-model";
import type { RelationshipNode } from "@/features/dictionaries/relationship-model";
import styles from "@/features/dictionaries/relationships.module.css";

export function FieldCanvas({
  user,
  entityType,
  groups,
  groupsReady,
  revision,
  busy,
  onCreateField,
  onCreateGroup,
  onEditField,
  onEditGroup,
}: {
  user: User;
  entityType: EntityType;
  groups: Group[];
  groupsReady: boolean;
  revision: number;
  busy: boolean;
  onCreateField: (groupKey?: string) => void;
  onCreateGroup: () => void;
  onEditField: (field: Field) => void;
  onEditGroup: (group: Group) => void;
}) {
  const [fields, setFields] = useState<Field[]>();
  const [attempt, setAttempt] = useState(0);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState(false);
  const flowRef = useRef<ReactFlowInstance | null>(null);
  const { message } = App.useApp();
  useEffect(() => {
    const hide = () => {
      setFields(undefined);
      setPaused(document.visibilityState !== "visible");
      setAttempt((value) => value + 1);
    };
    const pagehide = () => {
      setFields(undefined);
      setPaused(true);
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", pagehide);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", pagehide);
    };
  }, []);
  useEffect(() => {
    if (paused || document.visibilityState !== "visible") return;
    const controller = new AbortController();
    setFields(undefined);
    setError(false);
    void (async () => {
      const result: Field[] = [],
        seen = new Set<number>();
      let total: number | undefined;
      for (let page = 1; ; page++) {
        const value = await readFieldPage(
          apiRequest,
          user,
          entityType,
          page,
          undefined,
          controller.signal,
        );
        if (total !== undefined && total !== value.total)
          throw new Error("字段已变化");
        total = value.total;
        for (const field of value.items) {
          if (seen.has(field.fieldDefinitionId)) throw new Error("重复字段");
          seen.add(field.fieldDefinitionId);
          result.push(field);
        }
        if (page * 20 >= total) break;
      }
      if (!controller.signal.aborted) setFields(result);
    })().catch(() => {
      if (!controller.signal.aborted) setError(true);
    });
    return () => controller.abort();
  }, [user, entityType, revision, attempt, paused]);
  const has = (permission: string) => user.permissionKeys.includes(permission);
  const available: CreateNodeKind[] = [
    ...(has("system:field-group:create") ? ["group" as const] : []),
    ...(has("system:field:create") ? ["field" as const] : []),
  ];
  const relations = useMemo(() => {
    const nodes: RelationshipNode[] = [
      {
        id: `entity:${entityType}`,
        kind: "entity",
        key: entityType,
        label: fieldEntities.find((item) => item.value === entityType)!.label,
        entityType,
        column: 0,
      },
    ];
    groups.forEach((group) =>
      nodes.push({
        id: `group:${group.groupKey}`,
        kind: "group",
        key: group.groupKey,
        label: group.label,
        status: group.status,
        group,
        entityType,
        column: 1,
      }),
    );
    fields?.forEach((field) =>
      nodes.push({
        id: `field:${field.fieldDefinitionId}`,
        kind: "field",
        key: field.fieldKey,
        label: field.label,
        status: field.status,
        field,
        entityType,
        column: 2,
      }),
    );
    return nodes;
  }, [entityType, groups, fields]);
  const create = (kind: CreateNodeKind, targetId?: string) => {
    if (busy || !fields || !groupsReady || !available.includes(kind)) return;
    try {
      const intent = resolveNodeDrop(
        kind,
        relations.find((node) => node.id === targetId),
        entityType,
      );
      if (intent.kind === "field") onCreateField(intent.groupKey);
      else if (intent.kind === "group") onCreateGroup();
    } catch (cause) {
      message.warning((cause as Error).message);
    }
  };
  const dropProps = useNodeDrop(create, busy || !fields || !groupsReady);
  const edit = (id: string) => {
    if (busy) return;
    const node = relations.find((item) => item.id === id);
    if (node?.field && has("system:field:update")) onEditField(node.field);
    else if (node?.group && has("system:field-group:update"))
      onEditGroup(node.group);
  };
  const nodes: Node[] = relations.map((node, i) => ({
    id: node.id,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    position: {
      x: node.column * 300,
      y:
        node.column === 0
          ? 60
          : node.column === 1
            ? groups.findIndex((item) => item.groupKey === node.key) * 120
            : (i - groups.length - 1) * 100,
    },
    data: {
      label: (
        <div className={styles.fieldNode}>
          <strong>{node.label}</strong>
          <span>
            {node.kind === "entity"
              ? "业务实体"
              : node.kind === "group"
                ? "字段分组"
                : "扩展字段"}{" "}
            · {node.key}
          </span>
          {node.status ? (
            <span>
              {{ active: "启用", disabled: "停用", draft: "草稿" }[node.status]}
            </span>
          ) : null}
        </div>
      ),
    },
    style: {
      width: 230,
      borderColor: node.kind === "entity" ? "#2455f5" : "#9bb1d3",
      background: node.kind === "entity" ? "#e5efff" : "#fff",
    },
  }));
  const edges: Edge[] = relations
    .filter((node) => node.kind !== "entity")
    .map((node) => ({
      id: `edge:${node.id}`,
      source:
        node.field &&
        groups.some((group) => group.groupKey === node.field!.groupKey)
          ? `group:${node.field.groupKey}`
          : `entity:${entityType}`,
      target: node.id,
    }));
  const tree = [
    {
      key: `entity:${entityType}`,
      title: fieldEntities.find((item) => item.value === entityType)!.label,
      children: [
        ...groups.map((group) => ({
          key: `group:${group.groupKey}`,
          title: `${group.label} · 分组`,
          children: fields
            ?.filter((field) => field.groupKey === group.groupKey)
            .map((field) => ({
              key: `field:${field.fieldDefinitionId}`,
              title: field.label,
            })),
        })),
        ...(fields
          ?.filter(
            (field) =>
              !groups.some((group) => group.groupKey === field.groupKey),
          )
          .map((field) => ({
            key: `field:${field.fieldDefinitionId}`,
            title: field.label,
          })) ?? []),
      ],
    },
  ];
  return (
    <section className={styles.workspace} aria-label="字段拖拽管理">
      <div className={styles.toolbar}>
        <div>
          <h2>字段节点管理</h2>
          <Typography.Text type="secondary">
            新字段拖到分组上会自动归组；点击已有节点可编辑。拖动画布或搜索可查看其他字段。
          </Typography.Text>
        </div>
        <Button
          disabled={busy}
          onClick={() => setAttempt((value) => value + 1)}
        >
          刷新字段图
        </Button>
      </div>
      <NodePalette
        kinds={available}
        disabled={busy || !fields || !groupsReady}
        onCreate={(kind) => create(kind)}
      />
      <Select
        className={styles.fieldSearch}
        aria-label="查找字段节点"
        placeholder="查找分组或字段"
        showSearch={{ optionFilterProp: "label" }}
        value={undefined}
        disabled={!fields || busy}
        options={relations
          .filter((node) => node.kind !== "entity")
          .map((node) => ({
            value: node.id,
            label: `${node.kind === "group" ? "分组" : "字段"} · ${node.label} · ${node.key}`,
          }))}
        onChange={(id) => {
          const target = nodes.find((node) => node.id === id);
          if (target)
            void flowRef.current?.setCenter(
              target.position.x + 115,
              target.position.y + 45,
              { zoom: 1 },
            );
        }}
      />
      {!groupsReady ? (
        <Alert
          type="info"
          title="请先读取字段分组；需要字段分组读取权限才能拖拽创建"
        />
      ) : null}
      {error ? (
        <Alert type="error" title="字段图读取失败，请刷新字段图重试" />
      ) : !fields ? (
        <div role="status" className={styles.loading}>
          <Spin />
          正在读取字段节点…
        </div>
      ) : (
        <>
          <div className={styles.fieldCanvas} {...dropProps}>
            <ReactFlow
              key={`${entityType}:${attempt}:${revision}`}
              nodes={nodes}
              edges={edges}
              onNodeClick={(_, node) => edit(node.id)}
              nodesDraggable={false}
              nodesConnectable={false}
              deleteKeyCode={null}
              onInit={(instance) => {
                flowRef.current = instance;
              }}
              fitView
              fitViewOptions={{
                nodes: nodes
                  .filter((node) => node.position.y < 250)
                  .map((node) => ({ id: node.id })),
                minZoom: 0.65,
                maxZoom: 1,
                padding: 0.12,
              }}
              minZoom={0.1}
              maxZoom={1.5}
              zoomOnScroll={false}
            >
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>
          <div className={styles.fieldOutline}>
            <Tree
              aria-label="字段配置层级树"
              key={`${entityType}:${attempt}:${revision}`}
              defaultExpandAll
              showLine
              treeData={tree}
              onSelect={(keys) => {
                if (keys[0]) edit(String(keys[0]));
              }}
            />
          </div>
        </>
      )}
    </section>
  );
}
