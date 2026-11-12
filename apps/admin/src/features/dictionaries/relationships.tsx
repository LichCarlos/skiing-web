"use client";
import { AdminParagraph } from "@/components/admin-paragraph";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  App,
  Button,
  Drawer,
  Select,
  Spin,
  Switch,
  Tag,
  Tree,
  Typography,
} from "antd";
import {
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Node,
  type NodeProps,
  type NodeTypes,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { apiRequest } from "@/platform/api";
import CustomFieldsPage, {
  type FieldEntry,
} from "@/features/custom-fields/field-console";
import { fieldEntities } from "@/features/custom-fields/routes";
import type { EntityType } from "@/features/custom-fields/field-model";
import type { DictionaryUser } from "@/features/dictionaries/dictionary-model";
import {
  buildRelationships,
  readRelationshipCatalog,
  type RelationshipCatalog,
  type RelationshipNode,
} from "@/features/dictionaries/relationship-model";
import styles from "@/features/dictionaries/relationships.module.css";
import type { DataNode } from "antd/es/tree";
import {
  NodePalette,
  useNodeDrop,
} from "@/features/custom-fields/node-palette";
import {
  resolveNodeDrop,
  type CreateNodeKind,
  type NodeCreateIntent,
} from "@/features/custom-fields/node-drag";

const kinds = {
  entity: "业务实体",
  group: "字段分组",
  field: "扩展字段",
  builtin: "固定字段",
  dictionary: "选项字典",
};
const statuses: Record<string, string> = {
  active: "启用",
  draft: "草稿",
  disabled: "停用",
};
type GraphNode = Node<{ relation: RelationshipNode }, "relation">;
function RelationNode({ data, selected }: NodeProps<GraphNode>) {
  const node = data.relation;
  return (
    <div
      className={`${styles.node} ${selected ? styles.selected : ""}`}
      data-kind={node.kind}
      data-missing={node.missing || undefined}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <span className={styles.nodeKind}>
        {kinds[node.kind]}
        {node.status ? ` · ${statuses[node.status]}` : ""}
      </span>
      <strong>{node.label}</strong>
      <span className={styles.nodeKey}>{node.key}</span>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}
const nodeTypes: NodeTypes = { relation: RelationNode };
type OutlineNode = DataNode & { relationId: string; children?: OutlineNode[] };
function relationshipOutline(
  graph: ReturnType<typeof buildRelationships>,
): OutlineNode[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const children = new Map<string, string[]>();
  const targets = new Set(graph.edges.map((edge) => edge.target));
  for (const edge of graph.edges)
    children.set(edge.source, [
      ...(children.get(edge.source) ?? []),
      edge.target,
    ]);
  const convert = (id: string, path: string[]): OutlineNode => {
    const node = byId.get(id)!;
    return {
      key: JSON.stringify([...path, id]),
      relationId: id,
      title: (
        <span className={styles.outlineLabel}>
          <strong>{node.label}</strong>
          <span>
            {kinds[node.kind]}
            {node.status ? ` · ${statuses[node.status]}` : ""}
          </span>
        </span>
      ),
      children: (children.get(id) ?? []).map((child) =>
        convert(child, [...path, id]),
      ),
    };
  };
  return graph.nodes
    .filter((node) => !targets.has(node.id))
    .map((node) => convert(node.id, []));
}

function layout(
  nodes: RelationshipNode[],
  edges: { source: string; target: string }[],
): GraphNode[] {
  const positions = new Map<string, { x: number; y: number }>();
  let offset = 0;
  for (const entity of fieldEntities) {
    const members = nodes.filter((node) => node.entityType === entity.value);
    const fields = members.filter((node) => node.column === 2);
    const groups = members.filter((node) => node.column === 1);
    const height = Math.max(1, fields.length, groups.length) * 136;
    for (const node of members) {
      const siblings =
        node.column === 2 ? fields : node.column === 1 ? groups : [node];
      positions.set(node.id, {
        x: node.column * 280,
        y:
          offset +
          (height - siblings.length * 136) / 2 +
          siblings.indexOf(node) * 136,
      });
    }
    if (members.length) offset += height + 64;
  }
  let dictionaryY = -136;
  const dictionaries = nodes
    .filter((node) => node.kind === "dictionary")
    .map((node, index) => {
      const ys = edges
        .filter((edge) => edge.target === node.id)
        .map((edge) => positions.get(edge.source)?.y)
        .filter((y): y is number => y !== undefined);
      return {
        node,
        desired: ys.length
          ? ys.reduce((a, b) => a + b, 0) / ys.length
          : offset + index * 136,
      };
    })
    .sort(
      (a, b) => a.desired - b.desired || a.node.id.localeCompare(b.node.id),
    );
  for (const { node, desired } of dictionaries) {
    dictionaryY = Math.max(dictionaryY + 136, desired);
    positions.set(node.id, { x: 840, y: dictionaryY });
  }
  return nodes.map((node) => ({
    id: node.id,
    type: "relation",
    position: positions.get(node.id)!,
    data: { relation: node },
    ariaLabel: `${kinds[node.kind]}：${node.label}`,
    draggable: false,
  }));
}

export function DictionaryRelationships({
  user,
  revision,
  busy,
  onDictionary,
  onCreate,
}: {
  user: DictionaryUser;
  revision: number;
  busy: boolean;
  onDictionary: (key: string) => void;
  onCreate: (intent: NodeCreateIntent) => void;
}) {
  const [catalog, setCatalog] = useState<RelationshipCatalog>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [entity, setEntity] = useState<EntityType | "all">("ski_resort");
  const [selectedId, setSelectedId] = useState<string>();
  const [showAllFields, setShowAllFields] = useState(false);
  const [editor, setEditor] = useState<{
    entityType: EntityType;
    entry?: FieldEntry;
  }>();
  const [paused, setPaused] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const flowRef = useRef<ReactFlowInstance<GraphNode> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const hide = () => {
      if (document.visibilityState !== "visible") {
        controllerRef.current?.abort();
        setCatalog(undefined);
        setSelectedId(undefined);
        setEditor(undefined);
        setPaused(true);
      } else {
        setPaused(false);
        setAttempt((value) => value + 1);
      }
    };
    const pagehide = () => {
      controllerRef.current?.abort();
      setCatalog(undefined);
      setEditor(undefined);
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
    controllerRef.current = controller;
    setCatalog(undefined);
    setSelectedId(undefined);
    setError(undefined);
    void readRelationshipCatalog(apiRequest, user, controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) setCatalog(value);
      },
      () => {
        if (!controller.signal.aborted)
          setError("关系图读取失败，请刷新重试；不会显示不完整的关联。");
      },
    );
    return () => controller.abort();
  }, [user, revision, attempt, paused]);
  const graph = useMemo(
    () =>
      catalog
        ? buildRelationships(
            {
              ...catalog,
              fields: showAllFields
                ? catalog.fields
                : catalog.fields.filter((field) => !!field.optionsDictType),
            },
            entity === "all" ? undefined : entity,
          )
        : { nodes: [], edges: [] },
    [catalog, entity, showAllFields],
  );
  const outline = useMemo(() => relationshipOutline(graph), [graph]);
  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth)
        void flowRef.current?.fitView({ padding: 0.12, maxZoom: 1 });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [catalog, entity, showAllFields]);
  const nodes = useMemo(
    () =>
      layout(graph.nodes, graph.edges).map((node) => ({
        ...node,
        selected: node.id === selectedId,
      })),
    [graph, selectedId],
  );
  const selected = graph.nodes.find((node) => node.id === selectedId);
  const has = (key: string) => user.permissionKeys.includes(key);
  const { message } = App.useApp();
  const createKinds: CreateNodeKind[] = [
    ...(has("system:dict:create")
      ? ["dictionary" as const, "item" as const]
      : []),
    ...(catalog?.fieldsReadable &&
    catalog.groupsReadable &&
    has("system:field-group:create")
      ? ["group" as const]
      : []),
    ...(catalog?.fieldsReadable &&
    catalog.groupsReadable &&
    has("system:field:create")
      ? ["field" as const]
      : []),
  ];
  const create = (kind: CreateNodeKind, targetId?: string) => {
    if (busy || !catalog || paused || !createKinds.includes(kind)) return;
    try {
      const target = graph.nodes.find(
        (node) => node.id === (targetId ?? selectedId),
      );
      const intent = resolveNodeDrop(
        kind,
        target,
        entity === "all" ? undefined : entity,
      );
      if (intent.kind === "group" || intent.kind === "field")
        setEditor({
          entityType: intent.entityType!,
          entry:
            intent.kind === "group"
              ? { kind: "create-group" }
              : { kind: "create-field", groupKey: intent.groupKey },
        });
      else onCreate(intent);
    } catch (cause) {
      message.warning((cause as Error).message);
    }
  };
  const dropProps = useNodeDrop(
    (kind, targetId) => create(kind, targetId ?? ""),
    busy || !catalog || paused,
  );
  const closeEditor = () => {
    if (editorBusy) return;
    setEditor(undefined);
    setAttempt((value) => value + 1);
  };
  return (
    <section className={styles.workspace} aria-label="字典实体关系图">
      <div className={styles.toolbar}>
        <div>
          <h2>实体与字典关系</h2>
          <Typography.Text type="secondary">
            从业务实体找到字段与选项。点击节点管理，拖动画布移动，使用左下角缩放。
          </Typography.Text>
        </div>
        <Button
          disabled={busy}
          onClick={() => setAttempt((value) => value + 1)}
        >
          刷新关系图
        </Button>
      </div>
      <div className={styles.tools}>
        <Select
          aria-label="关系图业务范围"
          value={entity}
          options={[
            { value: "all", label: "全部实体与字典" },
            ...fieldEntities,
          ]}
          onChange={(value) => {
            setEntity(value);
            setSelectedId(undefined);
          }}
        />
        <Select
          aria-label="查找关系节点"
          placeholder="查找字段、分组或字典"
          showSearch
          optionFilterProp="label"
          allowClear
          value={selectedId}
          onChange={(id) => {
            setSelectedId(id);
            void flowRef.current?.fitView({
              nodes: id ? [{ id }] : undefined,
              padding: 0.5,
              maxZoom: 1,
            });
          }}
          options={graph.nodes.map((node) => ({
            value: node.id,
            label: `${node.entityType ? `${fieldEntities.find((entity) => entity.value === node.entityType)?.label} · ` : ""}${kinds[node.kind]} · ${node.label} (${node.key})`,
          }))}
          className={styles.nodeSearch}
          disabled={!catalog}
        />
        <label className={styles.allFields}>
          <Switch
            aria-label="显示全部字段"
            checked={showAllFields}
            onChange={(value) => {
              setShowAllFields(value);
              setSelectedId(undefined);
            }}
          />
          显示全部字段
        </label>
      </div>
      <NodePalette
        kinds={createKinds}
        disabled={busy || !catalog || paused}
        onCreate={(kind) => create(kind)}
      />
      {paused ? (
        <Alert type="info" title="页面已暂停，请回到页面后刷新" />
      ) : error ? (
        <Alert type="error" title={error} />
      ) : !catalog ? (
        <div className={styles.loading} role="status">
          <Spin />
          正在读取真实实体关联…
        </div>
      ) : (
        <>
          {!catalog.fieldsReadable || !catalog.groupsReadable ? (
            <Alert
              type="info"
              title="当前账号仅显示已授权关系"
              description={`${!catalog.fieldsReadable ? "缺少字段读取权限，扩展字段未加载。" : ""}${!catalog.groupsReadable ? "缺少分组读取权限，字段分组未加载。" : ""}`}
            />
          ) : null}
          <div className={styles.diagramLayout}>
            <div className={styles.canvas} ref={canvasRef} {...dropProps}>
              <ReactFlow<GraphNode>
                key={`${entity}:${attempt}:${revision}:${showAllFields}`}
                nodes={nodes}
                edges={graph.edges.map((edge) => ({
                  ...edge,
                  type: "smoothstep",
                  style: { stroke: "#59729e", strokeWidth: 1.5 },
                  labelStyle: { fill: "#17264c", fontSize: 12 },
                  labelBgStyle: { fill: "#f4f8ff" },
                }))}
                nodeTypes={nodeTypes}
                onInit={(instance) => {
                  flowRef.current = instance;
                }}
                onNodeClick={(_, node) => setSelectedId(node.id)}
                onPaneClick={() => setSelectedId(undefined)}
                fitView
                fitViewOptions={{ padding: 0.16, maxZoom: 1 }}
                minZoom={0.12}
                maxZoom={1.5}
                nodesConnectable={false}
                nodesDraggable={false}
                edgesFocusable={false}
                zoomOnScroll={false}
                panOnScroll
                preventScrolling={false}
                deleteKeyCode={null}
                ariaLabelConfig={{
                  "controls.zoomIn.ariaLabel": "放大关系图",
                  "controls.zoomOut.ariaLabel": "缩小关系图",
                  "controls.fitView.ariaLabel": "显示全部节点",
                  "node.a11yDescription.default": "按 Enter 或空格选择节点。",
                }}
              >
                <Controls showInteractive={false} />
              </ReactFlow>
            </div>
            <div className={styles.outline}>
              <Typography.Text type="secondary">
                点选层级节点查看和管理，同一字典可被多个字段引用。
              </Typography.Text>
              <Tree<OutlineNode>
                key={`${entity}:${attempt}:${revision}:${showAllFields}`}
                aria-label="实体字典关系层级树"
                showLine
                blockNode
                defaultExpandAll
                treeData={outline}
                onSelect={(_, info) => setSelectedId(info.node.relationId)}
              />
            </div>
            <aside
              className={styles.inspector}
              aria-label="关系节点详情"
              aria-live="polite"
            >
              {selected ? (
                <>
                  <Tag color="blue">{kinds[selected.kind]}</Tag>
                  <h3>{selected.label}</h3>
                  <code>{selected.key}</code>
                  {selected.entityType ? (
                    <AdminParagraph>
                      所属实体：
                      {
                        fieldEntities.find(
                          (entity) => entity.value === selected.entityType,
                        )?.label
                      }
                    </AdminParagraph>
                  ) : null}
                  {selected.status ? (
                    <AdminParagraph>
                      状态：{statuses[selected.status]}
                    </AdminParagraph>
                  ) : null}
                  {selected.kind === "builtin" ? (
                    <AdminParagraph>
                      此字段由业务规则固定绑定字典，可维护选项，绑定目标不可更换。
                    </AdminParagraph>
                  ) : null}
                  {selected.field ? (
                    <>
                      <AdminParagraph>
                        类型：{selected.field.dataType}
                        <br />
                        版本：{selected.field.schemaVersion}
                        <br />
                        所属分组：{selected.field.groupKey}
                      </AdminParagraph>
                      <Typography.Text type="secondary">
                        选择类字段可在编辑表单中选择字典，保存后刷新连线。
                      </Typography.Text>
                    </>
                  ) : null}
                  {selected.dictionary ? (
                    <AdminParagraph>
                      归类：{selected.dictionary.groupKey}
                      <br />
                      {
                        graph.edges.filter(
                          (edge) => edge.target === selected.id,
                        ).length
                      }{" "}
                      个当前视图中的字段引用
                    </AdminParagraph>
                  ) : null}
                  {selected.missing ? (
                    <Alert
                      type="warning"
                      title="引用的字典尚未配置或已不存在，请核对后配置"
                    />
                  ) : null}
                  <div className={styles.actions}>
                    {selected.dictionary ? (
                      <Button
                        type="primary"
                        disabled={busy}
                        onClick={() => onDictionary(selected.key)}
                      >
                        管理字典与层级
                      </Button>
                    ) : null}
                    {selected.kind === "builtin" ? (
                      <Button
                        disabled={
                          busy ||
                          !graph.edges.some(
                            (edge) =>
                              edge.source === selected.id &&
                              catalog.dictionaries.some(
                                (dict) =>
                                  `dictionary:${dict.dictType}` === edge.target,
                              ),
                          )
                        }
                        onClick={() => {
                          const edge = graph.edges.find(
                            (item) => item.source === selected.id,
                          );
                          if (edge)
                            onDictionary(
                              edge.target.slice("dictionary:".length),
                            );
                        }}
                      >
                        管理分类选项
                      </Button>
                    ) : null}
                    {selected.field && has("system:field:update") ? (
                      <Button
                        type="primary"
                        disabled={busy}
                        onClick={() =>
                          setEditor({
                            entityType: selected.field!.entityType,
                            entry: {
                              kind: "field",
                              id: selected.field!.fieldDefinitionId,
                            },
                          })
                        }
                      >
                        编辑字段 / 绑定字典
                      </Button>
                    ) : null}
                    {selected.group &&
                    has("system:field:list") &&
                    has("system:field-group:update") ? (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          setEditor({
                            entityType: selected.group!.entityType,
                            entry: {
                              kind: "group",
                              key: selected.group!.groupKey,
                            },
                          })
                        }
                      >
                        编辑字段分组
                      </Button>
                    ) : null}
                    {selected.entityType && has("system:field:list") ? (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          setEditor({ entityType: selected.entityType! })
                        }
                      >
                        管理此实体字段
                      </Button>
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  <h3>选择一个节点</h3>
                  <AdminParagraph>
                    点击图中节点，或用上方搜索定位，即可查看关联并进入编辑。
                  </AdminParagraph>
                  <Typography.Text type="secondary">
                    连线来自实际字段引用。字典归类不会自动建立实体绑定；未引用字典可在“全部实体与字典”中查看。
                  </Typography.Text>
                </>
              )}
            </aside>
          </div>
          <Typography.Text type="secondary" className={styles.help}>
            默认显示已绑定字典的扩展字段，可开启“显示全部字段”。实体 → 字段分组
            → 扩展字段 →
            选项字典；固定字段直接关联指定字典。配置扩展字段不会新建数据库表。
          </Typography.Text>
        </>
      )}
      <Drawer
        title="实体字段配置"
        open={!!editor}
        onClose={closeEditor}
        size="large"
        destroyOnHidden
        maskClosable={false}
        closable={!editorBusy}
        keyboard={!editorBusy}
      >
        {editor ? (
          <CustomFieldsPage
            key={JSON.stringify(editor)}
            initialEntityType={editor.entityType}
            initialEntry={editor.entry}
            onActivityChange={setEditorBusy}
          />
        ) : null}
      </Drawer>
    </section>
  );
}
