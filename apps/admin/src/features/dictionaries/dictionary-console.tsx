"use client";
import { ControlHint } from "@/components/control-hint";

import { AdminParagraph } from "@/components/admin-paragraph";

import Link from "next/link";
import dynamic from "next/dynamic";
import { DictionaryTree } from "@/features/dictionaries/dictionary-tree";
import type { NodeCreateIntent } from "@/features/custom-fields/node-drag";
import { CategoryPicker } from "@/features/dictionaries/category-picker";
import {
  dictionaryGroups,
  type CategoryOption,
} from "@/features/dictionaries/category-options";
import { FormHint } from "@/components/form-hint";
import { routes, dictionaryDetailRoute } from "@/config/routes";
import { isDictionaryType } from "@/features/dictionaries/routes";
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
  TreeSelect,
} from "antd";
import type { TableColumnsType } from "antd";
import type { components } from "@common/api-contracts/openapi";
import { ApiError } from "@common/api-contracts/client";
import { apiRequest } from "@/platform/api";
import { useSession } from "@/platform/auth/session-provider";
import {
  dictionaryRows,
  dictionaryParents,
  dictionaryItemBody,
  dictionaryReadError,
  DictionaryReadLane,
  DictionaryWriteGate,
  dictionaryWorkspaceKey,
  type Dictionary,
  type DictionaryPage,
  type ItemRow,
  type DictionaryTypeForm as TypeForm,
  type DictionaryItemForm as ItemForm,
} from "@/features/dictionaries/dictionary-model";
import {
  readDictionaryPage,
  readDictionaryDetail,
} from "@/features/dictionaries/dictionary-queries";
import {
  saveDictionaryType,
  saveDictionaryItem,
  disableDictionary,
} from "@/features/dictionaries/dictionary-commands";
import {
  beginDictionaryWrite,
  dictionaryRecoveryState,
  dictionaryRecoverySnapshot,
  dictionaryRecoveryServerSnapshot,
  subscribeDictionaryRecovery,
  reviewDictionaryWrite,
} from "@/features/dictionaries/dictionary-recovery";
import styles from "@/features/dictionaries/dictionary-console.module.css";

type Status = "active" | "disabled";

const PAGE_SIZE = 20;
const DictionaryRelationships = dynamic(
  () =>
    import("@/features/dictionaries/relationships").then(
      (module) => module.DictionaryRelationships,
    ),
  {
    ssr: false,
    loading: () => (
      <AdminParagraph role="status">正在加载实体关系图…</AdminParagraph>
    ),
  },
);

export function DictionaryConsole({
  initialDictType,
}: {
  initialDictType?: string;
}) {
  const { session } = useSession();
  if (session.status !== "authenticated") return null;
  if (initialDictType !== undefined && !isDictionaryType(initialDictType))
    return <AdminParagraph role="alert">字典类型键无效</AdminParagraph>;
  const user = session.currentUser;
  if (
    !["management:portal:enter", "system:dict:list"].every((key) =>
      user.permissionKeys.includes(key),
    )
  )
    return (
      <AdminParagraph role="alert">当前账号无权读取数据字典</AdminParagraph>
    );
  return (
    <DictionaryWorkspace
      key={`${dictionaryWorkspaceKey(user)}:${initialDictType ?? ""}`}
      user={user}
      initialDictType={initialDictType}
    />
  );
}

function DictionaryWorkspace({
  user,
  initialDictType,
}: {
  user: components["schemas"]["CurrentUserVO"];
  initialDictType?: string;
}) {
  const recoveryVersion = useSyncExternalStore(
    subscribeDictionaryRecovery,
    dictionaryRecoverySnapshot,
    dictionaryRecoveryServerSnapshot,
  );
  const recovery =
    recoveryVersion === 0 ? null : dictionaryRecoveryState(user.userId);
  const detailMode = initialDictType !== undefined;
  const { message } = App.useApp();
  const [typeForm] = Form.useForm<TypeForm>();
  const [itemForm] = Form.useForm<ItemForm>();
  const [page, setPage] = useState(1);
  const [groupKey, setGroupKey] = useState<string>();
  const [status, setStatus] = useState<Status>();
  const [data, setData] = useState<DictionaryPage | null>(null);
  const [selected, setSelected] = useState<Dictionary | null>(null);
  const [selectedTypeKey, setSelectedTypeKey] = useState<string | null>(
    initialDictType ?? recovery?.dictType ?? null,
  );
  const [selectedError, setSelectedError] = useState<string>();
  const [selectedLoading, setSelectedLoading] = useState(detailMode);
  const [loading, setLoading] = useState(!detailMode);
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [typeOpen, setTypeOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [graphReading, setGraphReading] = useState(false);
  const graphReadLock = useRef(false);
  const [graphOpen, setGraphOpen] = useState(false);
  const [treeView, setTreeView] = useState(true);
  const [fixedCategory, setFixedCategory] = useState(false);
  const [typeGroupKey, setTypeGroupKey] = useState("resort");
  const [itemOpen, setItemOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemRow | null>(null);
  const [editingType, setEditingType] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detailAttempt, setDetailAttempt] = useState(0);
  const [listLane] = useState(() => new DictionaryReadLane());
  const [detailLane] = useState(() => new DictionaryReadLane());
  const [graphLane] = useState(() => new DictionaryReadLane());
  const uncertain = recovery !== null;
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [dataKey, setDataKey] = useState<string>();
  const queryKey = JSON.stringify([page, groupKey, status]);
  const generation = useRef(0);
  const reviewLock = useRef(false);
  const reviewRevision = useRef<number | null>(null);
  const [gate] = useState(
    () =>
      new DictionaryWriteGate(
        user.userId,
        (signal) => apiRequest("/auth/me", { signal, cache: "no-store" }),
        setSaving,
        {
          user,
          has: () => dictionaryRecoveryState(user.userId) !== null,
          begin: (dictType) => beginDictionaryWrite(user.userId, dictType),
        },
      ),
  );
  const permissions = user.permissionKeys;
  const canCreate = permissions.includes("system:dict:create");
  const canUpdate = permissions.includes("system:dict:update");
  const canDelete = permissions.includes("system:dict:delete");
  const busy = saving || uncertain || reviewBusy || paused || graphReading;

  useEffect(() => {
    gate.activate();
    const clear = () => {
      generation.current++;
      gate.dispose();
      listLane.cancel();
      detailLane.cancel();
      graphLane.cancel();
      reviewLock.current = false;
      reviewRevision.current = null;
      setPaused(true);
      graphReadLock.current = false;
      setGraphReading(false);
      setSaving(false);
      setLoading(false);
      setSelectedLoading(false);
      setData(null);
      setDataKey(undefined);
      setSelected(null);
      setError(undefined);
      setSelectedError(undefined);
      setTypeOpen(false);
      setCategoryOpen(false);
      setItemOpen(false);
      setEditingItem(null);
      setReviewBusy(false);
      setReviewed(false);
      typeForm.resetFields();
      itemForm.resetFields();
    };
    const hide = () => {
      if (document.visibilityState !== "visible") clear();
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", clear);
    hide();
    return () => {
      generation.current++;
      gate.dispose();
      listLane.cancel();
      detailLane.cancel();
      graphLane.cancel();
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", clear);
    };
  }, [gate, listLane, detailLane, graphLane, typeForm, itemForm]);

  const loadTypes = useCallback(async () => {
    if (document.visibilityState !== "visible" || !gate.isActive())
      return false;
    if (detailMode) return true;
    setLoading(true);
    setData(null);
    setError(undefined);
    return listLane.run(
      (signal) =>
        readDictionaryPage(apiRequest, user, page, groupKey, status, signal),
      (value) => {
        setData(value);
        setDataKey(queryKey);
      },
      (cause) => setError(dictionaryReadError(cause)),
      () => setLoading(false),
    );
  }, [groupKey, page, status, listLane, detailMode, user, gate, queryKey]);

  useEffect(() => {
    void loadTypes();
    return () => listLane.cancel();
  }, [attempt, loadTypes, listLane]);

  const loadSelected = useCallback(async () => {
    if (document.visibilityState !== "visible" || !gate.isActive())
      return false;
    detailLane.cancel();
    setSelected(null);
    setSelectedError(undefined);
    if (!selectedTypeKey) {
      setSelectedLoading(false);
      return true;
    }
    setSelectedLoading(true);
    let missing = false;
    const loaded = await detailLane.run(
      (signal) =>
        readDictionaryDetail(apiRequest, user, selectedTypeKey, signal),
      setSelected,
      (cause) => {
        missing = cause instanceof ApiError && cause.status === 404;
        setSelectedError(dictionaryReadError(cause));
      },
      () => setSelectedLoading(false),
    );
    // A confirmed 404 is reviewable after a type-disable response was lost.
    return loaded || missing;
  }, [selectedTypeKey, detailLane, user, gate]);

  useEffect(() => {
    void loadSelected();
    return () => detailLane.cancel();
  }, [detailAttempt, loadSelected, detailLane]);

  function selectType(key: string | null) {
    if (busy || !gate.isActive()) return;
    setItemOpen(false);
    setSelected(null);
    if (key === selectedTypeKey) setDetailAttempt((value) => value + 1);
    setSelectedTypeKey(key);
  }

  async function reviewResults() {
    const pending = dictionaryRecoveryState(user.userId);
    if (
      reviewLock.current ||
      document.visibilityState !== "visible" ||
      !pending ||
      pending.inFlight ||
      pending.dictType !== selectedTypeKey
    )
      return;
    gate.activate();
    setPaused(false);
    const currentGeneration = generation.current;
    reviewLock.current = true;
    const revision = dictionaryRecoverySnapshot();
    reviewRevision.current = null;
    setReviewBusy(true);
    setReviewed(false);
    try {
      const results = await Promise.all([loadTypes(), loadSelected()]);
      if (!gate.isActive() || generation.current !== currentGeneration) return;
      const valid =
        results.every(Boolean) && revision === dictionaryRecoverySnapshot();
      reviewRevision.current = valid ? revision : null;
      setReviewed(valid);
    } finally {
      if (generation.current === currentGeneration) {
        reviewLock.current = false;
        if (gate.isActive()) setReviewBusy(false);
      }
    }
  }

  function refresh() {
    if (document.visibilityState !== "visible" || graphReadLock.current) return;
    gate.activate();
    setPaused(false);
    setAttempt((value) => value + 1);
    setDetailAttempt((value) => value + 1);
  }

  async function mutate<T>(
    permission: string,
    prepare: () => Promise<T | null>,
    write: (value: T, signal: AbortSignal) => Promise<unknown>,
    committed: () => void,
    dictType: string,
  ) {
    if (document.visibilityState !== "visible" || !gate.isActive()) return;
    const currentGeneration = generation.current;
    const result = await gate.run(
      permission,
      prepare,
      write,
      () => {
        committed();
        refresh();
      },
      dictType,
    );
    if (
      gate.isActive() &&
      generation.current === currentGeneration &&
      result.status === "error"
    ) {
      message.error(result.message);
      if (result.uncertain) {
        if (!detailMode) setSelectedTypeKey(dictType);
        setReviewed(false);
        setTypeOpen(false);
        setItemOpen(false);
      }
    }
  }

  const typeColumns: TableColumnsType<Dictionary> = [
    {
      title: "类型键",
      dataIndex: "dictType",
      key: "dictType",
      render: (value: string) => <code>{value}</code>,
    },
    { title: "名称", dataIndex: "dictName", key: "dictName" },
    { title: "分组", dataIndex: "groupKey", key: "groupKey" },
    {
      title: "项目数",
      key: "count",
      render: (_, item) => dictionaryRows(item.items).length,
    },
    {
      title: "公开检索",
      dataIndex: "publiclyReadable",
      key: "publiclyReadable",
      render: (value: boolean) =>
        value ? <Tag color="green">允许</Tag> : <Tag>禁止</Tag>,
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: (value: Status) => (
        <Tag color={value === "active" ? "green" : "default"}>
          {value === "active" ? "启用" : "停用"}
        </Tag>
      ),
    },
    {
      title: "操作",
      key: "actions",
      render: (_, item) => (
        <Space>
          {busy ? (
            <Button type="link" disabled>
              字典项
            </Button>
          ) : (
            <Link href={dictionaryDetailRoute(item.dictType)} prefetch={false}>
              字典项
            </Link>
          )}

          {canUpdate ? (
            <Button
              type="link"
              disabled={busy}
              onClick={() => openTypeEdit(item)}
            >
              编辑
            </Button>
          ) : null}
          {canDelete && item.status === "active" ? (
            <Popconfirm
              title="停用此字典类型？"
              disabled={busy}
              onConfirm={() => void disableType(item)}
            >
              <Button type="link" danger disabled={busy}>
                停用
              </Button>
            </Popconfirm>
          ) : null}
        </Space>
      ),
    },
  ];

  const itemColumns: TableColumnsType<ItemRow> = [
    {
      title: "名称",
      dataIndex: "label",
      key: "label",
      render: (value: string, item) => (
        <span
          style={{
            paddingInlineStart: Math.min(item.depth * 16, 96),
          }}
        >
          {value}
        </span>
      ),
    },
    {
      title: "值",
      dataIndex: "value",
      key: "value",
      render: (value: string) => <code>{value}</code>,
    },
    {
      title: "颜色",
      dataIndex: "color",
      key: "color",
      render: (value: string | null) =>
        value ? (
          <span className={styles.color}>
            <i style={{ background: value }} />
            {value}
          </span>
        ) : (
          "—"
        ),
    },
    {
      title: "默认",
      dataIndex: "isDefault",
      key: "isDefault",
      render: (value: boolean) => (value ? "是" : "否"),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: (value: Status) => (value === "active" ? "启用" : "停用"),
    },
    {
      title: "操作",
      key: "actions",
      render: (_, item) => (
        <Space>
          {canUpdate ? (
            <Button
              type="link"
              disabled={busy}
              onClick={() => openItemEdit(item)}
            >
              编辑
            </Button>
          ) : null}
          {canDelete && item.status === "active" ? (
            <Popconfirm
              title="停用此字典项？"
              disabled={busy}
              onConfirm={() => void disableItem(item)}
            >
              <Button type="link" danger disabled={busy}>
                停用
              </Button>
            </Popconfirm>
          ) : null}
        </Space>
      ),
    },
  ];

  function openTypeCreate(group = "resort") {
    if (busy || !gate.isActive() || gate.isLocked() || !canCreate) return;
    setEditingType(false);
    setFixedCategory(false);
    setTypeGroupKey(group);
    typeForm.resetFields();
    typeForm.setFieldsValue({
      dictType: `${group}.options.${crypto.randomUUID()}`,
      dictName: "",
      groupKey: group,
      publiclyReadable: false,
    });
    setTypeOpen(true);
  }

  async function createGraphNode(intent: NodeCreateIntent) {
    if (
      busy ||
      !canCreate ||
      graphReadLock.current ||
      !gate.isActive() ||
      gate.isLocked()
    )
      return;
    if (intent.kind === "dictionary") {
      const groups = {
        ski_resort: "resort",
        article: "knowledge",
        dynamic: "community",
        merchant_profile: "merchant",
      };
      openTypeCreate(intent.entityType ? groups[intent.entityType] : "resort");
    } else if (intent.kind === "item" && intent.dictType) {
      graphReadLock.current = true;
      setGraphReading(true);
      await graphLane.run(
        (signal) =>
          readDictionaryDetail(apiRequest, user, intent.dictType!, signal),
        (dictionary) => {
          if (dictionary.status === "active") addCategory(dictionary);
        },
        () => message.error("字典读取失败，请刷新后重试"),
        () => {
          graphReadLock.current = false;
          setGraphReading(false);
        },
      );
    }
  }

  function configureCategory(option: CategoryOption) {
    if (busy || !gate.isActive() || gate.isLocked() || !canCreate) return;
    setCategoryOpen(false);
    setFixedCategory(true);
    setTypeGroupKey(option.groupKey);
    setEditingType(false);
    typeForm.resetFields();
    typeForm.setFieldsValue({
      dictType: option.dictType,
      dictName: option.dictName,
      groupKey: option.groupKey,
      publiclyReadable: false,
    });
    setTypeOpen(true);
  }

  function addCategory(dictionary: Dictionary) {
    if (busy || !gate.isActive() || gate.isLocked() || !canCreate) return;
    setCategoryOpen(false);
    setSelectedTypeKey(dictionary.dictType);
    setSelected(dictionary);
    setSelectedError(undefined);
    setEditingItem(null);
    itemForm.resetFields();
    itemForm.setFieldsValue({
      label: "",
      value: "",
      parentId: null,
      color: "",
      sortOrder: 0,
      isDefault: false,
    });
    setItemOpen(true);
  }

  function openTypeEdit(item: Dictionary) {
    if (busy || !gate.isActive() || gate.isLocked() || !canUpdate) return;
    setEditingType(true);
    setTypeGroupKey(item.groupKey);
    typeForm.setFieldsValue({
      dictType: item.dictType,
      dictName: item.dictName,
      groupKey: item.groupKey,
      publiclyReadable: item.publiclyReadable,
      status: item.status,
    });
    setTypeOpen(true);
  }

  function openItemCreate(parentId?: number) {
    if (
      busy ||
      !gate.isActive() ||
      gate.isLocked() ||
      !canCreate ||
      !selected ||
      selected.status !== "active" ||
      selectedLoading ||
      selectedError
    )
      return;
    setEditingItem(null);
    itemForm.resetFields();
    itemForm.setFieldsValue({
      label: "",
      value: "",
      parentId: parentId ?? null,
      color: "",
      sortOrder: 0,
      isDefault: false,
    });
    setItemOpen(true);
  }

  function openItemEdit(item: ItemRow, parentId = item.parentId) {
    if (
      busy ||
      !gate.isActive() ||
      gate.isLocked() ||
      !canUpdate ||
      !selected ||
      selectedLoading ||
      selectedError
    )
      return;
    setEditingItem(item);
    itemForm.setFieldsValue({
      label: item.label,
      value: item.value,
      parentId: typeof parentId === "number" ? parentId : null,
      color: item.color ?? "",
      sortOrder: item.sortOrder,
      isDefault: item.isDefault,
      status: item.status,
    });
    setItemOpen(true);
  }

  async function saveType() {
    const key = typeForm.getFieldValue("dictType");
    const editing = editingType;
    await mutate(
      editing ? "system:dict:update" : "system:dict:create",
      () => typeForm.validateFields().catch(() => null),
      (values, signal) => {
        const { dictType: _key, ...body } = values;
        return saveDictionaryType(
          apiRequest,
          key,
          editing ? body : values,
          editing,
          signal,
        );
      },
      () => {
        message.success(editing ? "字典类型已更新" : "字典类型已创建");
        setTypeOpen(false);
        if (!editing) {
          setSelected(null);
          setSelectedTypeKey(key);
          if (fixedCategory) {
            setEditingItem(null);
            itemForm.resetFields();
            itemForm.setFieldsValue({
              label: "",
              value: "",
              parentId: null,
              color: "",
              sortOrder: 0,
              isDefault: false,
            });
            setItemOpen(true);
          }
        }
      },
      key,
    );
  }

  async function saveItem() {
    if (
      !selected ||
      selected.dictType !== selectedTypeKey ||
      (!editingItem && selected.status !== "active")
    )
      return;
    const key = selected.dictType;
    const editing = editingItem;
    await mutate(
      editing ? "system:dict:update" : "system:dict:create",
      () => itemForm.validateFields().catch(() => null),
      (values, signal) =>
        saveDictionaryItem(
          apiRequest,
          key,
          editing?.itemId,
          dictionaryItemBody(values),
          signal,
        ),
      () => {
        message.success(editing ? "字典项已更新" : "字典项已创建");
        setItemOpen(false);
      },
      key,
    );
  }

  async function disableType(item: Dictionary) {
    await mutate(
      "system:dict:delete",
      async () => item.dictType,
      (key, signal) => disableDictionary(apiRequest, key, undefined, signal),
      () => {
        if (!detailMode && selectedTypeKey === item.dictType)
          setSelectedTypeKey(null);
        message.success("字典类型已停用");
      },
      item.dictType,
    );
  }

  async function disableItem(item: ItemRow) {
    if (!selected || selected.dictType !== selectedTypeKey) return;
    const key = selected.dictType;
    await mutate(
      "system:dict:delete",
      async () => item.itemId,
      (id, signal) => disableDictionary(apiRequest, key, id, signal),
      () => message.success("字典项已停用"),
      key,
    );
  }

  const parentOptions = dictionaryParents(
    selected?.items ?? [],
    editingItem?.itemId,
  );
  const parentRows = new Map(
    dictionaryRows(selected?.items ?? []).map((item) => [item.itemId, item]),
  );

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div>
          <h1>{detailMode ? "字典详情" : "数据字典"}</h1>
          <FormHint>
            维护统一选项及层级，供选择类字段或业务功能引用；配置字典不会自动新增业务字段。
          </FormHint>
        </div>
        {detailMode ? (
          busy ? (
            <Button disabled>返回字典列表</Button>
          ) : (
            <Link href={routes.dictionaries} prefetch={false}>
              返回字典列表
            </Link>
          )
        ) : null}
        {!detailMode && canCreate ? (
          <Space wrap>
            <Button disabled={busy} onClick={() => openTypeCreate()}>
              新建选项字典
            </Button>
            <Button
              type="primary"
              disabled={busy}
              onClick={() => setCategoryOpen(true)}
            >
              新增分类
            </Button>
          </Space>
        ) : null}
      </header>
      {!detailMode ? (
        <div>
          <Button
            type={graphOpen ? "primary" : "default"}
            aria-pressed={graphOpen}
            disabled={busy}
            onClick={() => setGraphOpen((value) => !value)}
          >
            {graphOpen ? "收起实体关系图" : "实体关系图"}
          </Button>
        </div>
      ) : null}
      {!detailMode && graphOpen && !paused ? (
        <DictionaryRelationships
          user={user}
          revision={attempt}
          busy={busy}
          onCreate={createGraphNode}
          onDictionary={(key) => {
            if (busy) return;
            selectType(key);
            window.setTimeout(
              () =>
                document.getElementById("dictionary-items")?.scrollIntoView({
                  behavior: window.matchMedia(
                    "(prefers-reduced-motion: reduce)",
                  ).matches
                    ? "instant"
                    : "smooth",
                  block: "start",
                }),
              0,
            );
          }}
        />
      ) : null}
      {paused ? (
        <AdminParagraph role="status">
          页面已暂停，请刷新后继续操作
        </AdminParagraph>
      ) : null}
      <Button disabled={saving || reviewBusy || graphReading} onClick={refresh}>
        刷新字典
      </Button>
      {uncertain ? (
        <section className={styles.error} role="alert">
          <AdminParagraph>
            {recovery?.inFlight
              ? "正在等待字典操作返回，请勿重复提交。"
              : "操作结果未确认。请刷新列表与当前字典项，核对是否已保存，再重新打开表单。"}
          </AdminParagraph>
          <AdminParagraph>
            待核对字典：<code>{recovery?.dictType}</code>
          </AdminParagraph>
          {recovery && recovery.dictType !== selectedTypeKey ? (
            <Link
              href={dictionaryDetailRoute(recovery.dictType)}
              prefetch={false}
            >
              前往待核对字典
            </Link>
          ) : null}
          <Button
            disabled={
              recovery?.inFlight || recovery?.dictType !== selectedTypeKey
            }
            loading={reviewBusy}
            onClick={() => void reviewResults()}
          >
            刷新核对
          </Button>
          {reviewed ? (
            <Button
              disabled={
                reviewBusy ||
                recovery?.inFlight ||
                recovery?.dictType !== selectedTypeKey
              }
              onClick={() => {
                if (
                  !gate.isActive() ||
                  !recovery ||
                  reviewRevision.current === null ||
                  !reviewDictionaryWrite(
                    user.userId,
                    recovery.dictType,
                    reviewRevision.current,
                  )
                ) {
                  setReviewed(false);
                  reviewRevision.current = null;
                  message.warning("操作状态已变化，请重新刷新核对");
                  return;
                }
                gate.acknowledgeReview();
                setReviewed(false);
              }}
            >
              已核对结果，继续操作
            </Button>
          ) : null}
        </section>
      ) : null}
      {!detailMode ? (
        <>
          <section className={styles.filters} aria-label="字典筛选">
            <ControlHint hint="选填字典归类的分组键，最多100字；它表示归类，不代表实体或字段绑定。">
              <Input
                disabled={busy}
                maxLength={100}
                allowClear
                placeholder="按分组键筛选"
                value={groupKey}
                onChange={(event) => {
                  selectType(null);
                  setGroupKey(event.target.value || undefined);
                  setPage(1);
                }}
                style={{ width: 220, maxWidth: "100%" }}
              />
            </ControlHint>
            <ControlHint hint="选填，按字典启停状态筛选；清空表示全部状态。">
              <Select
                disabled={busy}
                allowClear
                placeholder="全部状态"
                value={status}
                onChange={(value: Status | undefined) => {
                  selectType(null);
                  setStatus(value);
                  setPage(1);
                }}
                options={[
                  { value: "active", label: "启用" },
                  { value: "disabled", label: "停用" },
                ]}
                style={{ width: 140 }}
              />
            </ControlHint>
          </section>
          {error ? (
            <section className={styles.error} role="alert">
              <strong>{error}</strong>
              <Button disabled={busy} onClick={refresh}>
                重试
              </Button>
            </section>
          ) : (
            <Table<Dictionary>
              rowKey="dictType"
              columns={typeColumns}
              dataSource={dataKey === queryKey ? (data?.items ?? []) : []}
              loading={loading}
              locale={{ emptyText: "暂无字典类型" }}
              pagination={{
                current: page,
                pageSize: PAGE_SIZE,
                total: dataKey === queryKey ? (data?.total ?? 0) : 0,
                showSizeChanger: false,
                disabled: busy,
                onChange: (value) => {
                  selectType(null);
                  setPage(value);
                },
              }}
              scroll={{ x: 900 }}
              onRow={(record) => ({
                onDoubleClick: () => selectType(record.dictType),
              })}
            />
          )}
        </>
      ) : null}
      {selectedTypeKey ? (
        <section id="dictionary-items" className={styles.items}>
          <header>
            <div>
              <h2>{selected?.dictName ?? selectedTypeKey}</h2>
              <code>{selectedTypeKey}</code>
            </div>
            <Space wrap>
              <Button
                disabled={busy}
                onClick={() => setTreeView((value) => !value)}
              >
                {treeView ? "切换表格" : "切换层级树"}
              </Button>
              {!detailMode ? (
                <Button disabled={busy} onClick={() => selectType(null)}>
                  收起
                </Button>
              ) : null}
              {detailMode && selected && canUpdate ? (
                <Button disabled={busy} onClick={() => openTypeEdit(selected)}>
                  编辑类型
                </Button>
              ) : null}
              {detailMode && selected?.status === "active" && canDelete ? (
                <Popconfirm
                  title="停用此字典类型？"
                  disabled={busy}
                  onConfirm={() => void disableType(selected)}
                >
                  <Button danger disabled={busy}>
                    停用类型
                  </Button>
                </Popconfirm>
              ) : null}
              {canCreate ? (
                <Button
                  type="primary"
                  disabled={
                    busy ||
                    !selected ||
                    selected.status !== "active" ||
                    selectedLoading ||
                    !!selectedError
                  }
                  onClick={() => openItemCreate()}
                >
                  新增字典项
                </Button>
              ) : null}
            </Space>
          </header>
          {detailMode && selected ? (
            <Space wrap aria-label="字典类型资料">
              <span>分组：{selected.groupKey}</span>
              <Tag>{selected.status === "active" ? "启用" : "停用"}</Tag>
              <span>
                公开 RAG 检索：{selected.publiclyReadable ? "允许" : "禁止"}
              </span>
              <span>字典项：{dictionaryRows(selected.items).length}</span>
            </Space>
          ) : null}
          {selectedError ? (
            <section className={styles.error} role="alert">
              <strong>{selectedError}</strong>
              <Button disabled={busy} onClick={refresh}>
                重试字典项
              </Button>
            </section>
          ) : null}
          {treeView && selected && !selectedError && !selectedLoading ? (
            <DictionaryTree
              key={`${selected.dictType}:${detailAttempt}:${attempt}`}
              dictionary={selected}
              busy={busy}
              canCreate={canCreate}
              canUpdate={canUpdate}
              onCreate={openItemCreate}
              onEdit={openItemEdit}
              onMove={openItemEdit}
            />
          ) : (
            <Table<ItemRow>
              rowKey="itemId"
              columns={itemColumns}
              dataSource={
                selectedError ? [] : dictionaryRows(selected?.items ?? [])
              }
              loading={selectedLoading}
              pagination={false}
              locale={{
                emptyText: selectedError ? "请重试读取字典项" : "暂无字典项",
              }}
              size="small"
            />
          )}
        </section>
      ) : null}
      {categoryOpen ? (
        <CategoryPicker
          user={user}
          onCancel={() => setCategoryOpen(false)}
          onChoose={addCategory}
          onMissing={configureCategory}
        />
      ) : null}
      <Modal
        title={
          editingType
            ? "编辑字典类型"
            : fixedCategory
              ? "配置分类字典"
              : "新建选项字典"
        }
        open={typeOpen}
        onCancel={() => {
          if (!saving) setTypeOpen(false);
        }}
        cancelButtonProps={{ disabled: saving }}
        okButtonProps={{ disabled: busy }}
        closable={!saving}
        maskClosable={!saving}
        keyboard={!saving}
        onOk={() => void saveType()}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form
          form={typeForm}
          layout="vertical"
          preserve={false}
          disabled={saving}
        >
          {!editingType && !fixedCategory ? (
            <Form.Item
              label="适用业务"
              extra={
                <FormHint>
                  为扩展字段建立可复用的选项字典；创建后在字段管理中绑定。系统自动生成唯一类型键。
                </FormHint>
              }
            >
              <Select
                aria-label="适用业务"
                defaultValue={typeGroupKey}
                options={[...dictionaryGroups]}
                onChange={(group: string) => {
                  setTypeGroupKey(group);
                  typeForm.setFieldsValue({
                    groupKey: group,
                    dictType: `${group}.options.${crypto.randomUUID()}`,
                  });
                }}
              />
            </Form.Item>
          ) : null}
          <Form.Item
            label="类型键"
            extra={
              <FormHint>
                由所属字段或适用业务自动生成，供系统引用，创建后不可修改。
              </FormHint>
            }
            name="dictType"
            rules={[
              { required: true },
              {
                pattern: /^[a-z][a-z0-9._:-]{0,99}$/,
                message: "请输入小写字母开头的类型键",
              },
            ]}
          >
            <Input maxLength={100} readOnly />
          </Form.Item>
          <Form.Item
            label="类型名称"
            extra={
              <FormHint>后台显示的字典名称，如“雪场设施”，最多100字。</FormHint>
            }
            name="dictName"
            rules={[{ required: true, whitespace: true }]}
          >
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item
            label="分组键"
            extra={
              <FormHint>
                按所属字段或适用业务自动归类；编辑时可从业务分组中选择。
              </FormHint>
            }
            name="groupKey"
            rules={[
              { required: true },
              { pattern: /^[a-z][a-z0-9._:-]{0,99}$/ },
            ]}
          >
            <Select
              disabled={!editingType}
              options={[
                ...dictionaryGroups,
                ...(!dictionaryGroups.some(
                  (group) => group.value === typeGroupKey,
                )
                  ? [
                      {
                        value: typeGroupKey,
                        label: typeGroupKey,
                      },
                    ]
                  : []),
              ]}
            />
          </Form.Item>
          <Form.Item
            label="允许公开 RAG 检索"
            extra={
              <FormHint>
                开启后，启用的字典项可用于 AI 公开检索；需要等待索引完成。
              </FormHint>
            }
            name="publiclyReadable"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          {editingType ? (
            <Form.Item
              label="状态"
              extra={
                <FormHint>
                  停用后不再作为有效字典选项使用；历史业务数据保留。
                </FormHint>
              }
              name="status"
            >
              <Select
                options={[
                  { value: "active", label: "启用" },
                  { value: "disabled", label: "停用" },
                ]}
              />
            </Form.Item>
          ) : null}
        </Form>
      </Modal>
      <Modal
        title={editingItem ? "编辑字典项" : "新增字典项"}
        open={itemOpen}
        onCancel={() => {
          if (!saving) setItemOpen(false);
        }}
        cancelButtonProps={{ disabled: saving }}
        okButtonProps={{
          disabled: busy || selectedLoading || !selected || !!selectedError,
        }}
        closable={!saving}
        maskClosable={!saving}
        keyboard={!saving}
        onOk={() => void saveItem()}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form
          form={itemForm}
          layout="vertical"
          preserve={false}
          disabled={saving}
        >
          <FormHint>
            所属字典：{selected?.dictName ?? selectedTypeKey}；分组：
            {selected?.groupKey ?? "读取中"}
          </FormHint>
          <Form.Item
            label="名称"
            extra={
              <FormHint>选项显示给用户的文字，如“停车场”，最多100字。</FormHint>
            }
            name="label"
            rules={[{ required: true, whitespace: true }]}
          >
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item
            label="值"
            extra={
              <FormHint>
                实际保存和引用的值，如 parking；修改前请核对已有业务引用。
              </FormHint>
            }
            name="value"
            rules={[{ required: true, whitespace: true }]}
          >
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item
            label="父级"
            extra={
              <FormHint>
                选择所属上级以建立层级；留空表示根节点，不能选择自己或自己的子级。
              </FormHint>
            }
            name="parentId"
          >
            <TreeSelect
              allowClear
              showSearch
              treeDefaultExpandAll
              treeLine
              treeNodeFilterProp="title"
              treeDataSimpleMode={{ id: "id", pId: "pId", rootPId: 0 }}
              treeData={parentOptions.map((option) => ({
                id: option.value,
                pId: parentRows.get(option.value)?.parentId ?? 0,
                value: option.value,
                title: `${parentRows.get(option.value)?.label} (${parentRows.get(option.value)?.value})`,
              }))}
              placeholder="根节点"
            />
          </Form.Item>
          <Form.Item
            label="颜色"
            extra={
              <FormHint>
                可选的选项标识色，如 #2455F5；留空不指定颜色。
              </FormHint>
            }
            name="color"
          >
            <Input maxLength={20} placeholder="#RRGGBB" />
          </Form.Item>
          <Form.Item
            label="排序"
            extra={
              <FormHint>控制同级选项的展示顺序，数值较小的优先。</FormHint>
            }
            name="sortOrder"
          >
            <InputNumber precision={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            label="默认项"
            extra={
              <FormHint>
                标记为默认候选项，具体是否预选由使用该字典的表单决定。
              </FormHint>
            }
            name="isDefault"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          {editingItem ? (
            <Form.Item
              label="状态"
              extra={
                <FormHint>
                  停用后不再作为有效字典选项使用；历史业务数据保留。
                </FormHint>
              }
              name="status"
            >
              <Select
                options={[
                  { value: "active", label: "启用" },
                  { value: "disabled", label: "停用" },
                ]}
              />
            </Form.Item>
          ) : null}
        </Form>
      </Modal>
    </main>
  );
}
