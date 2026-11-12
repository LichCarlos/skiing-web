"use client";
import { ControlHint } from "@/components/control-hint";

import { AdminParagraph } from "@/components/admin-paragraph";

import Link from "next/link";
import dynamic from "next/dynamic";
import { FieldDictionarySelect } from "@/features/custom-fields/field-dictionary-select";
import { FormHint } from "@/components/form-hint";
import { routes, fieldEntityRoute } from "@/config/routes";
import { fieldEntities, isFieldEntity } from "@/features/custom-fields/routes";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from "antd";
import type { TableColumnsType } from "antd";
import type { components } from "@common/api-contracts/openapi";
import { apiRequest } from "@/platform/api";
import { useSession } from "@/platform/auth/session-provider";
import { RequestLane } from "@/platform/api/request-lane";
import {
  canReadFields,
  createFieldBody,
  fieldBody,
  fieldReadError,
  groupBody,
  groupPath,
  workspaceKey,
  FieldWriteGate,
  type User,
  type EntityType,
  type Field as FieldDefinition,
  type Group as FieldGroup,
  type FieldPage,
  type FieldForm as FieldFormValues,
  type GroupForm as GroupFormValues,
} from "@/features/custom-fields/field-model";
import {
  beginFieldWrite,
  fieldRecoveryState,
  fieldRecoverySnapshot,
  fieldRecoveryServerSnapshot,
  subscribeFieldRecovery,
  reviewFieldWrite,
} from "@/features/custom-fields/field-recovery";
import {
  readFieldPage,
  readFieldGroups,
  readFieldDetail,
  readFieldGroupDetail,
} from "@/features/custom-fields/field-queries";
import styles from "@/features/custom-fields/field-console.module.css";
import {
  parseFieldReceipt,
  parseGroupReceipt,
} from "@/features/custom-fields/field-responses";
type FieldStatus = FieldDefinition["status"];

const PAGE_SIZE = 20;
const FieldCanvas = dynamic(
  () =>
    import("@/features/custom-fields/field-canvas").then(
      (module) => module.FieldCanvas,
    ),
  { ssr: false },
);
const statuses: { value: FieldStatus; label: string }[] = [
  { value: "draft", label: "草稿" },
  { value: "active", label: "启用" },
  { value: "disabled", label: "停用" },
];

export type FieldEntry =
  | { kind: "field"; id: number }
  | { kind: "group"; key: string }
  | { kind: "create-field"; groupKey?: string }
  | { kind: "create-group" };

export default function CustomFieldsPage({
  initialEntityType,
  initialEntry,
  onActivityChange,
}: {
  initialEntityType?: EntityType;
  initialEntry?: FieldEntry;
  onActivityChange?: (busy: boolean) => void;
}) {
  const { session } = useSession();
  const [selectedEntityType, setEntityType] =
    useState<EntityType>("ski_resort");
  const entityType = initialEntityType ?? selectedEntityType;
  if (!isFieldEntity(entityType))
    return <AdminParagraph role="alert">字段实体类型无效</AdminParagraph>;
  if (session.status !== "authenticated") return null;
  const user = session.currentUser;
  if (!canReadFields(user))
    return (
      <AdminParagraph role="alert">当前账号无权读取字段配置</AdminParagraph>
    );
  return (
    <FieldWorkspace
      key={`${workspaceKey(user, entityType)}:${initialEntityType !== undefined}`}
      user={user}
      entityType={entityType}
      onEntityChange={setEntityType}
      detailMode={initialEntityType !== undefined}
      initialEntry={initialEntry}
      onActivityChange={onActivityChange}
    />
  );
}

function FieldWorkspace({
  user,
  entityType,
  onEntityChange,
  detailMode,
  initialEntry,
  onActivityChange,
}: {
  user: User;
  entityType: EntityType;
  onEntityChange: (value: EntityType) => void;
  detailMode: boolean;
  initialEntry?: FieldEntry;
  onActivityChange?: (busy: boolean) => void;
}) {
  const recoveryVersion = useSyncExternalStore(
    subscribeFieldRecovery,
    fieldRecoverySnapshot,
    fieldRecoveryServerSnapshot,
  );
  const { message } = App.useApp();
  const [fieldForm] = Form.useForm<FieldFormValues>();
  const [groupForm] = Form.useForm<GroupFormValues>();
  const [status, setStatus] = useState<FieldStatus>();
  const [page, setPage] = useState(1);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [data, setData] = useState<FieldPage | null>(null);
  const [groups, setGroups] = useState<FieldGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupLoading, setGroupLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [groupError, setGroupError] = useState<string>();
  const [detailError, setDetailError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [groupAttempt, setGroupAttempt] = useState(0);
  const [fieldOpen, setFieldOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [editing, setEditing] = useState<FieldDefinition | null>(null);
  const dataType =
    Form.useWatch("dataType", { form: fieldForm, preserve: true }) ??
    editing?.dataType ??
    "text";
  const choiceField =
    dataType === "single_select" || dataType === "multi_select";
  const [editingGroup, setEditingGroup] = useState<FieldGroup | null>(null);
  const [saving, setSaving] = useState(false);
  const recovery =
    recoveryVersion === 0
      ? { pending: false, inFlight: false, needsGroup: false }
      : fieldRecoveryState(user.userId, entityType);
  const uncertain = recovery.pending;
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const reviewNeedsGroup = recovery.needsGroup;
  const reviewLock = useRef(false);
  const reviewRevision = useRef<number | null>(null);
  const lifecycleVersion = useRef(0);
  const currentContext = useRef({ user, page, status });
  currentContext.current = { user, page, status };
  const [editorLock] = useState(() => ({ busy: false }));
  const [fieldLane] = useState(() => new RequestLane());
  const [groupLane] = useState(() => new RequestLane());
  const [detailLane] = useState(() => new RequestLane());
  const [gate] = useState(
    () =>
      new FieldWriteGate(
        user,
        (signal) => apiRequest<User>("/auth/me", { signal, cache: "no-store" }),
        setSaving,
        {
          has: () => fieldRecoveryState(user.userId, entityType).pending,
          begin: (permission) =>
            beginFieldWrite(user.userId, entityType, permission),
        },
      ),
  );
  const permissionKeys = user.permissionKeys;
  const isSystemAdmin = user.roles.some(
    (role) => role.roleKey === "system_admin",
  );
  const canCreate = permissionKeys.includes("system:field:create");
  const canUpdate = permissionKeys.includes("system:field:update");
  const canDelete = permissionKeys.includes("system:field:delete");
  const canListGroups = permissionKeys.includes("system:field-group:list");
  const canCreateGroup = permissionKeys.includes("system:field-group:create");
  const canUpdateGroup = permissionKeys.includes("system:field-group:update");
  const canDeleteGroup = permissionKeys.includes("system:field-group:delete");
  const busy = saving || uncertain || reviewBusy || detailLoading;
  const readBusy = saving || reviewBusy || detailLoading;
  useEffect(() => {
    onActivityChange?.(saving || reviewBusy);
  }, [saving, reviewBusy, onActivityChange]);
  useEffect(() => {
    gate.activate();
    return () => gate.dispose();
  }, [gate]);

  const loadFields = useCallback(async () => {
    if (
      document.visibilityState !== "visible" ||
      currentContext.current.user !== user ||
      currentContext.current.page !== page ||
      currentContext.current.status !== status
    )
      return false;
    setLoading(true);
    setData(null);
    setError(undefined);
    return fieldLane.run(
      (signal) =>
        readFieldPage(apiRequest, user, entityType, page, status, signal),
      setData,
      (cause) => setError(fieldReadError(cause)),
      () => setLoading(false),
    );
  }, [entityType, page, status, fieldLane, user]);
  const loadGroups = useCallback(async () => {
    if (
      document.visibilityState !== "visible" ||
      currentContext.current.user !== user
    )
      return false;
    if (!canListGroups) return true;
    setGroupLoading(true);
    setGroups([]);
    setGroupError(undefined);
    return groupLane.run(
      (signal) => readFieldGroups(apiRequest, user, entityType, signal),
      setGroups,
      (cause) => setGroupError(fieldReadError(cause, true)),
      () => setGroupLoading(false),
    );
  }, [entityType, canListGroups, groupLane, user]);
  useEffect(() => {
    void loadFields();
    return () => fieldLane.cancel();
  }, [attempt, loadFields, fieldLane]);
  useEffect(() => {
    void loadGroups();
    return () => groupLane.cancel();
  }, [groupAttempt, loadGroups, groupLane]);
  useEffect(() => () => detailLane.cancel(), [detailLane]);
  useEffect(() => {
    const clear = () => {
      fieldLane.cancel();
      groupLane.cancel();
      detailLane.cancel();
      gate.dispose();
      lifecycleVersion.current++;
      reviewLock.current = false;
      reviewRevision.current = null;
      editorLock.busy = false;
      setSaving(false);
      setLoading(false);
      setGroupLoading(false);
      setDetailLoading(false);
      setData(null);
      setGroups([]);
      setEditing(null);
      setEditingGroup(null);
      setFieldOpen(false);
      setGroupOpen(false);
      fieldForm.resetFields();
      groupForm.resetFields();
      setReviewed(false);
      setReviewBusy(false);
      setDetailError(undefined);
      setGroupError(undefined);
      setError("页面读取已暂停，请点击刷新重新读取字段配置");
    };
    const hide = () => {
      if (document.visibilityState !== "visible") clear();
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", clear);
    hide();
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", clear);
    };
  }, [
    fieldLane,
    groupLane,
    detailLane,
    gate,
    editorLock,
    fieldForm,
    groupForm,
  ]);
  function refresh() {
    if (document.visibilityState !== "visible") return;
    gate.activate();
    setAttempt((v) => v + 1);
    setGroupAttempt((v) => v + 1);
  }
  function changeEntity(value: EntityType) {
    if (busy || value === entityType) return;
    fieldLane.cancel();
    groupLane.cancel();
    detailLane.cancel();
    gate.dispose();
    onEntityChange(value);
  }
  async function reviewResults() {
    if (document.visibilityState !== "visible") return;
    gate.activate();
    if (
      reviewLock.current ||
      fieldRecoveryState(user.userId, entityType).inFlight ||
      !gate.isActive()
    )
      return;
    reviewLock.current = true;
    const generation = lifecycleVersion.current;
    const revision = fieldRecoverySnapshot();
    reviewRevision.current = null;
    setReviewBusy(true);
    setReviewed(false);
    try {
      const results = await Promise.all([loadFields(), loadGroups()]);
      if (!gate.isActive() || generation !== lifecycleVersion.current) return;
      const valid =
        results.every(Boolean) &&
        (!reviewNeedsGroup || canListGroups) &&
        !fieldRecoveryState(user.userId, entityType).inFlight &&
        revision === fieldRecoverySnapshot();
      reviewRevision.current = valid ? revision : null;
      setReviewed(valid);
    } finally {
      if (generation === lifecycleVersion.current) {
        reviewLock.current = false;
        if (gate.isActive()) setReviewBusy(false);
      }
    }
  }
  async function mutate<T>(
    permission: string,
    prepare: () => Promise<T | null>,
    write: (value: T, signal: AbortSignal) => Promise<unknown>,
    committed: () => void,
  ) {
    if (
      document.visibilityState !== "visible" ||
      editorLock.busy ||
      reviewLock.current
    )
      return;
    const result = await gate.run(permission, prepare, write, () => {
      committed();
      refresh();
    });
    if (gate.isActive() && result.status === "error") {
      message.error(result.message);
      if (result.uncertain) {
        setReviewed(false);
        setFieldOpen(false);
        setGroupOpen(false);
      }
    }
  }
  async function validated<T>(validate: () => Promise<T>) {
    try {
      return await validate();
    } catch (cause) {
      if (cause && typeof cause === "object" && "errorFields" in cause)
        return null;
      throw cause;
    }
  }
  function openCreateField(groupKey?: string) {
    if (
      busy ||
      !gate.isActive() ||
      gate.isLocked() ||
      editorLock.busy ||
      document.visibilityState !== "visible" ||
      !canCreate ||
      !canListGroups ||
      groupLoading ||
      !!groupError ||
      (groupKey !== undefined &&
        !groups.some(
          (group) => group.groupKey === groupKey && group.status === "active",
        ))
    )
      return;
    setEditing(null);
    fieldForm.resetFields();
    fieldForm.setFieldsValue({
      label: "",
      dataType: "text",
      groupKey: groupKey ?? groups.find((g) => g.status === "active")?.groupKey,
      sortOrder: 0,
      required: false,
      searchable: false,
      filterable: false,
      sortable: false,
      isPublic: false,
      optionsDictType: undefined,
      validationText: "",
      defaultValueText: "",
    });
    setFieldOpen(true);
  }
  async function openEditField(
    field: Pick<FieldDefinition, "fieldDefinitionId">,
  ) {
    if (
      busy ||
      !gate.isActive() ||
      gate.isLocked() ||
      editorLock.busy ||
      document.visibilityState !== "visible" ||
      !canUpdate
    )
      return;
    editorLock.busy = true;
    const generation = lifecycleVersion.current;
    setDetailLoading(true);
    setDetailError(undefined);
    try {
      await detailLane.run(
        (signal) =>
          readFieldDetail(
            apiRequest,
            user,
            entityType,
            field.fieldDefinitionId,
            signal,
          ),
        (value) => {
          setEditing(value);
          fieldForm.resetFields();
          fieldForm.setFieldsValue({
            ...value,
            optionsDictType: value.optionsDictType ?? undefined,
            validationText: value.validation
              ? JSON.stringify(value.validation, null, 2)
              : "",
            defaultValueText:
              value.defaultValue === null
                ? ""
                : JSON.stringify(value.defaultValue),
          });
          setFieldOpen(true);
        },
        (cause) => setDetailError(fieldReadError(cause)),
        () => setDetailLoading(false),
      );
    } finally {
      if (generation === lifecycleVersion.current) editorLock.busy = false;
    }
  }
  async function saveField() {
    const target = editing;
    await mutate(
      target ? "system:field:update" : "system:field:create",
      async () => {
        const values = await validated(() => fieldForm.validateFields());
        if (!values) return null;
        if (!choiceField) values.optionsDictType = undefined;
        return target
          ? ({
              ...fieldBody(values, isSystemAdmin),
              expectedSchemaVersion: target.schemaVersion,
            } satisfies components["schemas"]["UpdateCustomFieldDto"])
          : createFieldBody(values, entityType, isSystemAdmin);
      },
      async (body, signal) => {
        const value = parseFieldReceipt(
          await (target
            ? apiRequest(`/admin/custom-fields/${target.fieldDefinitionId}`, {
                method: "PATCH",
                signal,
                body,
              })
            : apiRequest("/admin/custom-fields", {
                method: "POST",
                signal,
                body,
              })),
          entityType,
          target
            ? {
                fieldDefinitionId: target.fieldDefinitionId,
                schemaVersion: target.schemaVersion + 1,
              }
            : {
                fieldKey: (
                  body as components["schemas"]["CreateCustomFieldDto"]
                ).fieldKey,
                schemaVersion: 1,
                status: "draft",
              },
        );
        return value;
      },
      () => {
        message.success(target ? "字段已更新" : "字段已创建");
        setFieldOpen(false);
      },
    );
  }
  async function changeStatus(
    field: FieldDefinition,
    action: "activate" | "disable",
  ) {
    await mutate(
      action === "activate" ? "system:field:update" : "system:field:delete",
      async () => field,
      async (target, signal) => {
        if (action === "activate") {
          const value = parseFieldReceipt(
            await apiRequest(
              `/admin/custom-fields/${target.fieldDefinitionId}/activate`,
              {
                method: "PATCH",
                signal,
                body: { expectedSchemaVersion: target.schemaVersion },
              },
            ),
            entityType,
            {
              fieldDefinitionId: target.fieldDefinitionId,
              fieldKey: target.fieldKey,
              status: "active",
              schemaVersion: target.schemaVersion + 1,
            },
          );
          return value;
        }
        return apiRequest(`/admin/custom-fields/${target.fieldDefinitionId}`, {
          method: "DELETE",
          signal,
        });
      },
      () => {
        message.success(action === "activate" ? "字段已启用" : "字段已停用");
      },
    );
  }
  function openCreateGroup() {
    if (
      busy ||
      !gate.isActive() ||
      gate.isLocked() ||
      editorLock.busy ||
      document.visibilityState !== "visible" ||
      !canCreateGroup
    )
      return;
    setEditingGroup(null);
    groupForm.resetFields();
    groupForm.setFieldsValue({ label: "", sortOrder: groups.length });
    setGroupOpen(true);
  }
  async function openEditGroup(group: Pick<FieldGroup, "groupKey">) {
    if (
      busy ||
      !gate.isActive() ||
      gate.isLocked() ||
      editorLock.busy ||
      document.visibilityState !== "visible" ||
      !canListGroups ||
      !canUpdateGroup
    )
      return;
    editorLock.busy = true;
    const generation = lifecycleVersion.current;
    setDetailLoading(true);
    setDetailError(undefined);
    try {
      await detailLane.run(
        (signal) =>
          readFieldGroupDetail(
            apiRequest,
            user,
            entityType,
            group.groupKey,
            signal,
          ),
        (value) => {
          setEditingGroup(value);
          groupForm.resetFields();
          groupForm.setFieldsValue({
            label: value.label,
            sortOrder: value.sortOrder,
          });
          setGroupOpen(true);
        },
        (cause) => setDetailError(fieldReadError(cause, true)),
        () => setDetailLoading(false),
      );
    } finally {
      if (generation === lifecycleVersion.current) editorLock.busy = false;
    }
  }
  async function saveGroup() {
    const target = editingGroup;
    await mutate(
      target ? "system:field-group:update" : "system:field-group:create",
      () => validated(() => groupForm.validateFields()),
      async (values, signal) => {
        const value = parseGroupReceipt(
          await (target
            ? apiRequest(groupPath(entityType, target.groupKey), {
                method: "PATCH",
                signal,
                body: groupBody(values),
              })
            : apiRequest("/admin/custom-field-groups", {
                method: "POST",
                signal,
                body: {
                  ...groupBody(values),
                  entityType,
                  groupKey: values.groupKey?.trim() ?? "",
                  label: values.label.trim(),
                  sortOrder: values.sortOrder,
                } satisfies components["schemas"]["CreateCustomFieldGroupDto"],
              })),
          entityType,
          target?.groupKey ?? values.groupKey?.trim() ?? "",
        );
        return value;
      },
      () => {
        message.success(target ? "分组已更新" : "分组已创建");
        setGroupOpen(false);
      },
    );
  }
  async function disableGroup(group: FieldGroup) {
    await mutate(
      "system:field-group:delete",
      async () => group,
      (target, signal) =>
        apiRequest(groupPath(entityType, target.groupKey), {
          method: "DELETE",
          signal,
        }),
      () => {
        message.success("分组已停用");
      },
    );
  }
  const columns: TableColumnsType<FieldDefinition> = [
    {
      title: "字段",
      dataIndex: "label",
      key: "label",
      render: (label: string, field) => (
        <>
          <strong>{label}</strong>
          <br />
          <code>{field.fieldKey}</code>
        </>
      ),
    },
    { title: "类型", dataIndex: "dataType", key: "dataType" },
    { title: "分组", dataIndex: "groupKey", key: "groupKey" },
    { title: "排序", dataIndex: "sortOrder", key: "sortOrder", width: 76 },
    {
      title: "必填",
      dataIndex: "required",
      key: "required",
      render: (value: boolean) => (value ? "是" : "否"),
    },
    ...(isSystemAdmin
      ? [
          {
            title: "公开",
            dataIndex: "isPublic",
            key: "isPublic",
            render: (value: boolean) =>
              value ? <Tag color="green">公开</Tag> : <Tag>私有</Tag>,
          },
        ]
      : []),
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: (value: FieldStatus) => (
        <Tag
          color={
            value === "active"
              ? "green"
              : value === "draft"
                ? "blue"
                : "default"
          }
        >
          {statuses.find((item) => item.value === value)?.label}
        </Tag>
      ),
    },
    {
      title: "版本",
      dataIndex: "schemaVersion",
      key: "schemaVersion",
      width: 72,
    },
    {
      title: "操作",
      key: "actions",
      render: (_, field) => (
        <Space wrap>
          {canUpdate ? (
            <Button
              disabled={busy}
              type="link"
              onClick={() => void openEditField(field)}
            >
              编辑
            </Button>
          ) : null}
          {canUpdate && field.status === "draft" ? (
            <Button
              disabled={busy}
              type="link"
              onClick={() => void changeStatus(field, "activate")}
            >
              启用
            </Button>
          ) : null}
          {canDelete && field.status !== "disabled" ? (
            <Popconfirm
              disabled={busy}
              title="停用此字段？"
              onConfirm={() => void changeStatus(field, "disable")}
            >
              <Button disabled={busy} type="link" danger>
                停用
              </Button>
            </Popconfirm>
          ) : null}
        </Space>
      ),
    },
  ];

  const groupColumns: TableColumnsType<FieldGroup> = [
    {
      title: "分组",
      dataIndex: "label",
      key: "label",
      render: (label: string, group) => (
        <>
          <strong>{label}</strong>
          <br />
          <code>{group.groupKey}</code>
        </>
      ),
    },
    { title: "排序", dataIndex: "sortOrder", key: "sortOrder", width: 76 },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: (value: FieldGroup["status"]) =>
        value === "active" ? "启用" : "停用",
    },
    {
      title: "操作",
      key: "actions",
      render: (_, group) => (
        <Space wrap>
          {canUpdateGroup && group.status === "active" ? (
            <Button
              disabled={busy}
              type="link"
              onClick={() => void openEditGroup(group)}
            >
              编辑
            </Button>
          ) : null}
          {canDeleteGroup && group.status === "active" ? (
            <Popconfirm
              disabled={busy}
              title="停用此分组？分组内不能有启用字段。"
              onConfirm={() => void disableGroup(group)}
            >
              <Button disabled={busy} type="link" danger>
                停用
              </Button>
            </Popconfirm>
          ) : null}
        </Space>
      ),
    },
  ];

  const entryOpened = useRef(false);
  useEffect(() => {
    if (
      !initialEntry ||
      entryOpened.current ||
      loading ||
      groupLoading ||
      busy ||
      !gate.isActive()
    )
      return;
    entryOpened.current = true;
    if (initialEntry.kind === "field")
      void openEditField({ fieldDefinitionId: initialEntry.id });
    else if (initialEntry.kind === "group")
      void openEditGroup({ groupKey: initialEntry.key });
    else if (initialEntry.kind === "create-field")
      openCreateField(initialEntry.groupKey);
    else openCreateGroup();
  });

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div>
          <h1>
            {detailMode
              ? `${fieldEntities.find((entity) => entity.value === entityType)?.label}字段配置`
              : "字段管理"}
          </h1>
          {detailMode ? <code>{entityType}</code> : null}
          <FormHint>
            为滑雪场、文章、动态和商家资料配置扩展信息；新字段需启用，并配置角色读写权限后使用。
          </FormHint>
        </div>
        <Space wrap>
          {busy ? (
            <Button disabled>
              {detailMode ? "返回字段管理" : "打开实体配置"}
            </Button>
          ) : (
            <Link
              href={detailMode ? routes.fields : fieldEntityRoute(entityType)}
              prefetch={false}
            >
              {detailMode ? "返回字段管理" : "打开实体配置"}
            </Link>
          )}
          {canCreateGroup ? (
            <Button disabled={busy} onClick={openCreateGroup}>
              新建分组
            </Button>
          ) : null}
          {canCreate ? (
            <Button
              disabled={busy || !canListGroups || groupLoading || !!groupError}
              type="primary"
              onClick={() => openCreateField()}
            >
              新建字段
            </Button>
          ) : null}
        </Space>
      </header>
      <div>
        <Button
          disabled={busy}
          type={canvasOpen ? "primary" : "default"}
          aria-pressed={canvasOpen}
          onClick={() => setCanvasOpen((value) => !value)}
        >
          {canvasOpen ? "收起字段节点图" : "拖拽管理字段"}
        </Button>
      </div>
      {canvasOpen ? (
        <FieldCanvas
          user={user}
          entityType={entityType}
          groups={groups}
          groupsReady={canListGroups && !groupLoading && !groupError}
          revision={attempt + groupAttempt}
          busy={busy || !gate.isActive()}
          onCreateField={openCreateField}
          onCreateGroup={openCreateGroup}
          onEditField={(field) => void openEditField(field)}
          onEditGroup={(group) => void openEditGroup(group)}
        />
      ) : null}
      {detailMode ? (
        <nav aria-label="实体字段导航" className={styles.filters}>
          {fieldEntities.map((entity) =>
            entity.value === entityType ? (
              <span key={entity.value} aria-current="page">
                {entity.label}
              </span>
            ) : busy ? (
              <span key={entity.value} aria-disabled="true">
                {entity.label}
              </span>
            ) : (
              <Link
                key={entity.value}
                href={fieldEntityRoute(entity.value)}
                prefetch={false}
              >
                {entity.label}
              </Link>
            ),
          )}
        </nav>
      ) : null}
      <section className={styles.filters} aria-label="字段筛选">
        {!detailMode ? (
          <ControlHint hint="选择字段所属业务实体；切换后重新读取对应字段和分组。">
            <Select
              disabled={busy}
              value={entityType}
              onChange={(value: EntityType) => {
                changeEntity(value);
              }}
              options={[...fieldEntities]}
              style={{ width: 180 }}
            />
          </ControlHint>
        ) : null}
        <ControlHint hint="选填，筛选草稿、启用或停用字段；清空表示全部状态。">
          <Select
            disabled={readBusy}
            allowClear
            placeholder="全部状态"
            value={status}
            onChange={(value: FieldStatus | undefined) => {
              if (readBusy || (value === status && page === 1)) return;
              setReviewed(false);
              fieldLane.cancel();
              setData(null);
              setStatus(value);
              setPage(1);
            }}
            options={statuses}
            style={{ width: 140 }}
          />
        </ControlHint>
      </section>
      <Space wrap>
        <Button
          disabled={saving || reviewBusy || detailLoading || recovery.inFlight}
          onClick={uncertain ? () => void reviewResults() : refresh}
        >
          {uncertain ? "刷新核对操作结果" : "刷新"}
        </Button>
        {detailLoading ? <span role="status">正在读取最新详情</span> : null}
      </Space>
      {detailError ? (
        <AdminParagraph role="alert">{detailError}</AdminParagraph>
      ) : null}
      {uncertain ? (
        <section className={styles.error} role="alert">
          <span>
            {recovery.inFlight
              ? "正在等待字段或分组操作返回，请勿重复提交。"
              : "操作结果未确认。可切换状态和分页查找记录，刷新并核对是否已生效，再继续操作。"}
          </span>
          {reviewNeedsGroup && !canListGroups ? (
            <span>
              当前账号不能查询分组，需要具备分组查询权限的管理员核对结果。
            </span>
          ) : null}
          <Button
            disabled={!reviewed || reviewBusy || recovery.inFlight || saving}
            onClick={() => {
              if (
                !reviewed ||
                reviewBusy ||
                !gate.isActive() ||
                reviewRevision.current === null
              )
                return;
              if (
                !reviewFieldWrite(
                  user.userId,
                  entityType,
                  reviewRevision.current,
                )
              ) {
                setReviewed(false);
                message.warning("操作状态已变化，请重新刷新核对。");
                return;
              }
              gate.acknowledgeReview();
              setReviewed(false);
            }}
          >
            已核对，继续操作
          </Button>
        </section>
      ) : null}
      {error ? (
        <section className={styles.error} role="alert">
          <strong>{error}</strong>
          <Button disabled={busy} onClick={refresh}>
            重试
          </Button>
        </section>
      ) : (
        <Table<FieldDefinition>
          rowKey="fieldDefinitionId"
          columns={columns}
          dataSource={data?.items ?? []}
          loading={loading || detailLoading}
          locale={{ emptyText: "暂无字段定义" }}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            showSizeChanger: false,
            onChange: (value) => {
              if (readBusy || value === page) return;
              setReviewed(false);
              fieldLane.cancel();
              setData(null);
              setPage(value);
            },
          }}
          scroll={{ x: 950 }}
        />
      )}
      <section className={styles.groups}>
        <header>
          <div>
            <h2>字段分组</h2>
            <AdminParagraph>当前实体的表单分组</AdminParagraph>
          </div>
        </header>
        {!canListGroups ? (
          <AdminParagraph>当前账号无字段分组查询权限</AdminParagraph>
        ) : groupError ? (
          <div className={styles.error} role="alert">
            <strong>{groupError}</strong>
            <Button
              disabled={saving || reviewBusy}
              onClick={() => setGroupAttempt((v) => v + 1)}
            >
              重试分组
            </Button>
          </div>
        ) : (
          <Table<FieldGroup>
            rowKey="groupKey"
            columns={groupColumns}
            dataSource={groups}
            loading={groupLoading}
            pagination={false}
            locale={{ emptyText: "暂无字段分组" }}
            size="small"
          />
        )}
      </section>
      <Modal
        title={editing ? "编辑字段" : "新建字段"}
        open={fieldOpen}
        onCancel={() => {
          if (!busy) setFieldOpen(false);
        }}
        onOk={() => void saveField()}
        confirmLoading={saving}
        okButtonProps={{ disabled: busy }}
        cancelButtonProps={{ disabled: busy }}
        maskClosable={!busy}
        keyboard={!busy}
        destroyOnHidden
        width={640}
      >
        <Form
          disabled={busy}
          form={fieldForm}
          layout="vertical"
          preserve={false}
        >
          {!editing ? (
            <Form.Item
              label="字段键"
              extra={
                <FormHint>
                  数据保存时使用的唯一标识，如
                  facilities；小写字母开头，可含数字和下划线，创建后不可修改。
                </FormHint>
              }
              name="fieldKey"
              rules={[
                { required: true },
                {
                  pattern: /^[a-z][a-z0-9_]{0,99}$/,
                  message: "使用小写字母开头的英文、数字或下划线",
                },
              ]}
            >
              <Input maxLength={100} />
            </Form.Item>
          ) : (
            <Form.Item
              label="字段键"
              extra={
                <FormHint>
                  数据保存时使用的唯一标识，如
                  facilities；小写字母开头，可含数字和下划线，创建后不可修改。
                </FormHint>
              }
            >
              <code>{editing.fieldKey}</code>
            </Form.Item>
          )}
          <Form.Item
            label="显示名称"
            extra={
              <FormHint>
                业务表单展示的字段名称，如“配套设施”，最多100字。
              </FormHint>
            }
            name="label"
            rules={[{ required: true, whitespace: true }]}
          >
            <Input maxLength={100} />
          </Form.Item>
          {!editing ? (
            <Form.Item
              label="数据类型"
              extra={
                <FormHint>
                  决定填写控件和校验方式；单选、多选需绑定选项字典，创建后不可修改。
                </FormHint>
              }
              name="dataType"
              rules={[{ required: true }]}
            >
              <Select
                onChange={() =>
                  fieldForm.setFieldValue("optionsDictType", undefined)
                }
                options={[
                  "text",
                  "textarea",
                  "integer",
                  "decimal",
                  "boolean",
                  "date",
                  "single_select",
                  "multi_select",
                  "url",
                ].map((value) => ({
                  value,
                  label: (
                    {
                      text: "短文本",
                      textarea: "长文本",
                      integer: "整数",
                      decimal: "小数",
                      boolean: "是/否",
                      date: "日期",
                      single_select: "单选",
                      multi_select: "多选",
                      url: "网址",
                    } as Record<string, string>
                  )[value],
                }))}
              />
            </Form.Item>
          ) : (
            <Form.Item
              label="数据类型"
              extra={
                <FormHint>
                  决定填写控件和校验方式；单选、多选需绑定选项字典，创建后不可修改。
                </FormHint>
              }
            >
              <Tag>{editing.dataType}</Tag>
            </Form.Item>
          )}
          <Form.Item
            label="分组"
            extra={
              <FormHint>
                选择当前业务实体下已启用的分组，决定字段在表单中的归属。
              </FormHint>
            }
            name="groupKey"
            rules={[{ required: true }]}
          >
            {canListGroups ? (
              <Select
                loading={groupLoading}
                disabled={groupLoading || !!groupError}
                placeholder="选择已启用的字段分组"
                options={groups
                  .filter((group) => group.status === "active")
                  .map((group) => ({
                    value: group.groupKey,
                    label: group.label,
                  }))}
              />
            ) : (
              <Select
                disabled
                placeholder="需要字段分组读取权限"
                options={
                  editing
                    ? [
                        {
                          value: editing.groupKey,
                          label: `${editing.groupKey}（原分组）`,
                        },
                      ]
                    : []
                }
              />
            )}
          </Form.Item>
          <Form.Item
            label="排序"
            extra={<FormHint>填写非负整数；数值较小的优先展示。</FormHint>}
            name="sortOrder"
            rules={[{ required: true, type: "number", min: 0 }]}
          >
            <InputNumber min={0} precision={0} style={{ width: "100%" }} />
          </Form.Item>
          {fieldOpen && choiceField ? (
            <FieldDictionarySelect
              key={editing?.fieldDefinitionId ?? "new"}
              user={user}
              current={editing?.optionsDictType}
            />
          ) : null}
          <Form.Item
            label="默认值（JSON）"
            extra={
              <FormHint>
                文本用双引号，如
                "双板"；数字用100，多选用["parking"]。留空清除默认值。
              </FormHint>
            }
            name="defaultValueText"
          >
            <Input.TextArea rows={2} placeholder={'例如："双板" 或 100'} />
          </Form.Item>
          <Form.Item
            label="校验规则（JSON）"
            extra={
              <FormHint>
                填写 JSON 对象：文本可用 minLength、maxLength、pattern；数字可用
                min、max。留空清除规则。
              </FormHint>
            }
            name="validationText"
          >
            <Input.TextArea
              rows={3}
              placeholder={'例如：{"minLength":1,"maxLength":100}'}
            />
          </Form.Item>
          <div className={styles.fieldOptions}>
            <Form.Item
              label="必填"
              extra={
                <FormHint>
                  启用后，保存业务内容时必须提供该字段的有效值。
                </FormHint>
              }
              name="required"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            <Form.Item
              label="可搜索"
              extra={
                <FormHint>
                  允许查询功能使用该字段搜索；不会自动给所有页面增加搜索框。
                </FormHint>
              }
              name="searchable"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            <Form.Item
              label="可筛选"
              extra={
                <FormHint>
                  允许查询功能按该字段过滤，需相应业务页面接入。
                </FormHint>
              }
              name="filterable"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            <Form.Item
              label="可排序"
              extra={
                <FormHint>
                  允许查询功能按该字段排序，需相应业务页面接入。
                </FormHint>
              }
              name="sortable"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            {isSystemAdmin ? (
              <Form.Item
                label="公开字段"
                extra={
                  <FormHint>
                    允许公开读取；仅系统管理员可开启，业务内容仍需满足自身的公开条件。
                  </FormHint>
                }
                name="isPublic"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            ) : null}
          </div>
        </Form>
      </Modal>
      <Modal
        title={editingGroup ? "编辑分组" : "新建分组"}
        open={groupOpen}
        onCancel={() => {
          if (!busy) setGroupOpen(false);
        }}
        onOk={() => void saveGroup()}
        confirmLoading={saving}
        okButtonProps={{ disabled: busy }}
        cancelButtonProps={{ disabled: busy }}
        maskClosable={!busy}
        keyboard={!busy}
        destroyOnHidden
      >
        <Form
          disabled={busy}
          form={groupForm}
          layout="vertical"
          preserve={false}
        >
          {!editingGroup ? (
            <Form.Item
              label="分组键"
              extra={
                <FormHint>
                  当前实体下的稳定标识，如
                  basic_info；小写字母开头，可含数字、下划线和短横线，创建后不可修改。
                </FormHint>
              }
              name="groupKey"
              rules={[
                { required: true },
                { pattern: /^[a-z][a-z0-9_-]{0,99}$/ },
              ]}
            >
              <Input maxLength={100} />
            </Form.Item>
          ) : (
            <Form.Item
              label="分组键"
              extra={
                <FormHint>
                  当前实体下的稳定标识，如
                  basic_info；小写字母开头，可含数字、下划线和短横线，创建后不可修改。
                </FormHint>
              }
            >
              <code>{editingGroup.groupKey}</code>
            </Form.Item>
          )}
          <Form.Item
            label="分组名称"
            extra={
              <FormHint>
                表单中显示的分组标题，如“基础信息”，最多100字。
              </FormHint>
            }
            name="label"
            rules={[{ required: true, whitespace: true }]}
          >
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item
            label="排序"
            extra={<FormHint>填写非负整数；数值较小的优先展示。</FormHint>}
            name="sortOrder"
            rules={[{ required: true, type: "number", min: 0 }]}
          >
            <InputNumber min={0} precision={0} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </main>
  );
}
