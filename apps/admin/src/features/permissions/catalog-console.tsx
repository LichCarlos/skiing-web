"use client";
import { FormHint } from "@/components/form-hint";
import { AdminParagraph } from "@/components/admin-paragraph";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { apiRequest } from "@/platform/api";
import { RequestLane } from "@/platform/api/request-lane";
import {
  beginCatalogWrite,
  hasUnconfirmedCatalogWrite,
  markCatalogWrite,
} from "@/features/permissions/catalog-recovery";
import { useSession } from "@/platform/auth/session-provider";
import {
  canReadCatalog,
  canDisableCatalogNode,
  catalogWorkspaceKey,
  isCatalogAdmin,
  flattenCatalog,
  parentCandidates,
  createCatalogBody,
  updateCatalogBody,
  catalogReadError,
  CatalogInputError,
  CatalogWriteGate,
  type CatalogUser,
  type CatalogNode,
  type CatalogType,
  type CatalogForm,
  type CatalogRow,
} from "@/features/permissions/catalog-model";
import {
  readCatalog,
  readCatalogDetail,
  readCatalogTarget,
  parseCatalogNode,
  parseCatalogSync,
} from "@/features/permissions/catalog-queries";
import styles from "@/app/admin/system/permissions/page.module.css";

export default function PermissionCatalogConsole() {
  const { session, retryRestore } = useSession();
  const [, updateRecovery] = useState(0);
  if (session.status === "loading")
    return <AdminParagraph role="status">正在确认登录身份</AdminParagraph>;
  if (session.status !== "authenticated")
    return (
      <section role="alert">
        <AdminParagraph>
          {session.status === "unavailable" ? "会话暂时不可用" : "请先登录"}
        </AdminParagraph>
        <Button onClick={() => void retryRestore()}>重新读取身份</Button>
      </section>
    );
  if (!canReadCatalog(session.currentUser))
    return (
      <section role="alert">
        <AdminParagraph>当前账号无权读取权限目录</AdminParagraph>
        <Button onClick={() => void retryRestore()}>重新读取身份</Button>
      </section>
    );
  return (
    <CatalogWorkspace
      key={catalogWorkspaceKey(session.currentUser)}
      user={session.currentUser}
      retryIdentity={retryRestore}
      uncertain={hasUnconfirmedCatalogWrite(session.currentUser.userId)}
      setUncertain={(value) => {
        markCatalogWrite(session.currentUser.userId, value);
        updateRecovery((previous) => previous + 1);
      }}
    />
  );
}

function CatalogWorkspace({
  user,
  retryIdentity,
  uncertain,
  setUncertain,
}: {
  user: CatalogUser;
  retryIdentity: () => Promise<void>;
  uncertain: boolean;
  setUncertain: (value: boolean) => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<CatalogForm>();
  const [nodes, setNodes] = useState<CatalogNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [detailError, setDetailError] = useState<string>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogNode | null>(null);
  const [type, setType] = useState<CatalogType>("directory");
  const [reviewed, setReviewed] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const reviewLock = useRef(false);
  const reviewVersion = useRef(0);
  const currentUser = useRef(user);
  currentUser.current = user;
  const recoveryCallback = useRef(setUncertain);
  recoveryCallback.current = setUncertain;
  const [editorLock] = useState(() => ({ busy: false }));
  const [listLane] = useState(() => new RequestLane());
  const [detailLane] = useState(() => new RequestLane());
  const [gate] = useState(
    () =>
      new CatalogWriteGate(
        user,
        (signal) =>
          apiRequest<CatalogUser>("/auth/me", { signal, cache: "no-store" }),
        setSaving,
        uncertain,
        () => beginCatalogWrite(user.userId),
      ),
  );
  const canCreate = user.permissionKeys.includes("system:permission:create");
  const canUpdate = user.permissionKeys.includes("system:permission:update");
  const canDelete = user.permissionKeys.includes("system:permission:delete");
  const canSync = canUpdate && isCatalogAdmin(user);
  const busy = saving || detailLoading || reviewBusy || uncertain;
  const rows = useMemo(() => flattenCatalog(nodes), [nodes]);
  const candidates = useMemo(
    () => parentCandidates(nodes, type, editing),
    [nodes, type, editing],
  );
  useEffect(() => {
    gate.activate();
    return () => gate.dispose();
  }, [gate]);

  const load = useCallback(async () => {
    if (document.visibilityState !== "visible" || currentUser.current !== user)
      return false;
    setLoading(true);
    setNodes([]);
    setError(undefined);
    return listLane.run(
      (signal) => readCatalog(user, signal),
      setNodes,
      (cause) => setError(catalogReadError(cause)),
      () => setLoading(false),
    );
  }, [listLane, user]);
  useEffect(() => {
    void load();
    const clear = () => {
      listLane.cancel();
      detailLane.cancel();
      gate.dispose();
      reviewVersion.current++;
      reviewLock.current = false;
      editorLock.busy = false;
      setSaving(false);
      setLoading(false);
      setNodes([]);
      setOpen(false);
      setEditing(null);
      setDetailLoading(false);
      setDetailError(undefined);
      setReviewBusy(false);
      setReviewed(false);
      setError("页面读取已暂停，请点击刷新重新读取权限目录");
      recoveryCallback.current(hasUnconfirmedCatalogWrite(user.userId));
      form.resetFields();
    };
    const hide = () => {
      if (document.visibilityState !== "visible") clear();
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", clear);
    return () => {
      listLane.cancel();
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", clear);
    };
  }, [
    load,
    attempt,
    listLane,
    detailLane,
    gate,
    editorLock,
    form,
    user.userId,
  ]);
  useEffect(() => () => detailLane.cancel(), [detailLane]);

  function createNode(kind: CatalogType) {
    if (
      busy ||
      gate.isLocked() ||
      !canCreate ||
      document.visibilityState !== "visible"
    )
      return;
    detailLane.cancel();
    setDetailError(undefined);
    setEditing(null);
    setType(kind);
    form.resetFields();
    form.setFieldsValue({
      permissionKey: "custom:",
      permissionType: kind,
      parentId: null,
      sortOrder: 0,
      visible: true,
      status: "active",
    });
    setOpen(true);
  }
  async function editNode(id: number) {
    if (
      busy ||
      gate.isLocked() ||
      !canUpdate ||
      editorLock.busy ||
      document.visibilityState !== "visible"
    )
      return;
    editorLock.busy = true;
    setDetailLoading(true);
    setDetailError(undefined);
    setOpen(false);
    await detailLane.run(
      async (signal) => {
        const result = await readCatalogDetail(user, id, signal);
        if (result.permissionId !== id || result.permissionType === "api")
          throw new CatalogInputError("该节点不能编辑，请刷新目录");
        flattenCatalog([result]);
        return result;
      },
      (node) => {
        setEditing(node);
        setType(node.permissionType as CatalogType);
        form.resetFields();
        form.setFieldsValue({
          ...node,
          permissionType: node.permissionType as CatalogType,
        });
        setOpen(true);
      },
      (cause) => setDetailError(catalogReadError(cause)),
      () => {
        editorLock.busy = false;
        setDetailLoading(false);
      },
    );
  }
  async function mutate<T>(
    action: "create" | "update" | "delete" | "sync",
    prepare: (signal: AbortSignal) => Promise<T | null>,
    write: (value: T, signal: AbortSignal) => Promise<unknown>,
    done: () => void,
  ) {
    if (document.visibilityState !== "visible") return;
    if (!gate.isActive())
      gate.activate(hasUnconfirmedCatalogWrite(user.userId));
    const result = await gate.run(action, prepare, write, () => {
      setUncertain(false);
      done();
      setAttempt((value) => value + 1);
    });
    if (gate.isActive() && result.status === "error") {
      message.error(
        result.traceId
          ? `${result.message}（traceId: ${result.traceId}）`
          : result.message,
      );
      if (result.uncertain) {
        setUncertain(true);
        setReviewed(false);
        setOpen(false);
      } else setUncertain(false);
    }
  }
  async function validate() {
    try {
      return await form.validateFields();
    } catch (cause) {
      if (cause && typeof cause === "object" && "errorFields" in cause)
        return null;
      throw cause;
    }
  }
  async function save() {
    await mutate(
      editing ? "update" : "create",
      async () => {
        const values = await validate();
        if (!values) return null;
        return editing
          ? updateCatalogBody(values, editing, candidates)
          : createCatalogBody(values, candidates);
      },
      async (body, signal) =>
        parseCatalogNode(
          await apiRequest(
            editing
              ? `/admin/permissions/${editing.permissionId}`
              : "/admin/permissions",
            { method: editing ? "PATCH" : "POST", body, signal },
          ),
          editing?.permissionId,
        ),
      () => {
        message.success(editing ? "目录节点已更新" : "目录节点已创建");
        setOpen(false);
        form.resetFields();
      },
    );
  }
  async function disableNode(id: number) {
    await mutate(
      "delete",
      async (signal) => {
        const node = await readCatalogTarget(id, signal);
        if (node.permissionId !== id || !canDisableCatalogNode(node))
          throw new CatalogInputError("节点状态已变化，请刷新目录");
        return id;
      },
      async (value, signal) => {
        await apiRequest(`/admin/permissions/${value}`, {
          method: "DELETE",
          signal,
        });
      },
      () => {
        message.success("目录节点已停用");
      },
    );
  }
  async function syncRegistry() {
    let summary = "";
    await mutate(
      "sync",
      async () => ({}),
      async (body, signal) => {
        const result = parseCatalogSync(
          await apiRequest<unknown>("/admin/permissions/sync", {
            method: "POST",
            body,
            signal,
          }),
        );
        summary = `同步完成：新增 ${result.created}，更新 ${result.updated}，停用 ${result.disabled}`;
      },
      () => {
        message.success(summary);
      },
    );
  }
  async function reviewResults() {
    if (
      reviewLock.current ||
      saving ||
      detailLoading ||
      document.visibilityState !== "visible"
    )
      return;
    if (!gate.isActive())
      gate.activate(hasUnconfirmedCatalogWrite(user.userId));
    const version = ++reviewVersion.current;
    reviewLock.current = true;
    setReviewBusy(true);
    setReviewed(false);
    const success = await load();
    if (
      !gate.isActive() ||
      version !== reviewVersion.current ||
      document.visibilityState !== "visible"
    )
      return;
    setReviewed(success);
    setReviewBusy(false);
    reviewLock.current = false;
  }
  function acknowledgeReview() {
    if (
      !reviewed ||
      reviewBusy ||
      loading ||
      document.visibilityState !== "visible"
    )
      return;
    gate.acknowledgeReview();
    setUncertain(false);
    setReviewed(false);
    setOpen(false);
    setEditing(null);
    form.resetFields();
  }
  const columns: TableColumnsType<CatalogRow> = [
    {
      title: "名称",
      dataIndex: "permissionName",
      render: (name: string, row) => (
        <span style={{ paddingInlineStart: row.depth * 18 }}>{name}</span>
      ),
    },
    {
      title: "键",
      dataIndex: "permissionKey",
      render: (value: string) => <code>{value}</code>,
    },
    { title: "类型", dataIndex: "permissionType", width: 100 },
    {
      title: "来源",
      dataIndex: "source",
      width: 85,
      render: (value: string) => (value === "code" ? "代码" : "自定义"),
    },
    {
      title: "路由",
      dataIndex: "route",
      render: (value: string | null) => value || "-",
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (value: string) => (
        <Tag color={value === "active" ? "green" : "default"}>
          {value === "active" ? "启用" : "停用"}
        </Tag>
      ),
    },
    {
      title: "操作",
      width: 150,
      render: (_, row) => (
        <Space>
          {canUpdate && row.permissionType !== "api" ? (
            <Button
              type="link"
              disabled={busy || loading}
              onClick={() => void editNode(row.permissionId)}
            >
              编辑
            </Button>
          ) : null}
          {canDelete && canDisableCatalogNode(row) ? (
            <Popconfirm
              title={`停用“${row.permissionName}”？`}
              description="存在角色引用时，服务端会拒绝停用。"
              disabled={busy || loading || row.childCount > 0}
              onConfirm={() => void disableNode(row.permissionId)}
            >
              <Button
                type="link"
                danger
                disabled={busy || loading || row.childCount > 0}
              >
                停用
              </Button>
            </Popconfirm>
          ) : null}
        </Space>
      ),
    },
  ];
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1>权限目录</h1>
        <AdminParagraph className={styles.copy}>
          维护后台目录、菜单与按钮。API
          权限由注册表同步，角色授权在角色管理中设置。
        </AdminParagraph>
        <Space wrap>
          {canCreate
            ? (
                [
                  ["directory", "新建目录"],
                  ["menu", "新建菜单"],
                  ["button", "新建按钮"],
                ] as const
              ).map(([kind, label]) => (
                <Button
                  key={kind}
                  disabled={busy || loading || !!error}
                  onClick={() => createNode(kind)}
                >
                  {label}
                </Button>
              ))
            : null}
          {canSync ? (
            <Popconfirm
              title="同步 API 权限注册表？"
              description="将按当前代码定义更新 API 权限目录。"
              disabled={busy || loading || !!error}
              onConfirm={() => void syncRegistry()}
            >
              <Button disabled={busy || loading || !!error} loading={saving}>
                同步 API 权限
              </Button>
            </Popconfirm>
          ) : null}
          <Button
            disabled={busy || loading}
            onClick={() => setAttempt((value) => value + 1)}
          >
            刷新
          </Button>
          <Button
            disabled={saving || reviewBusy}
            onClick={() => {
              if (!gate.isRunning() && !reviewLock.current)
                void retryIdentity();
            }}
          >
            重新读取身份
          </Button>
        </Space>
      </header>
      {uncertain && !saving ? (
        <section className={styles.message} role="alert">
          <AdminParagraph>
            操作结果未确认。请刷新目录，核对节点及同步结果后再继续；不会自动重试写入。
          </AdminParagraph>
          <Space wrap>
            <Button
              disabled={reviewBusy || saving}
              loading={reviewBusy}
              onClick={() => void reviewResults()}
            >
              刷新核对
            </Button>
            <Button
              disabled={!reviewed || reviewBusy || loading}
              onClick={acknowledgeReview}
            >
              我已核对，继续操作
            </Button>
          </Space>
        </section>
      ) : null}
      {error ? (
        <section className={styles.message} role="alert">
          <AdminParagraph>{error}</AdminParagraph>
          <Button
            disabled={busy || loading}
            onClick={() => setAttempt((value) => value + 1)}
          >
            重试
          </Button>
        </section>
      ) : null}
      {detailLoading ? (
        <AdminParagraph role="status">正在读取最新节点</AdminParagraph>
      ) : null}
      {detailError ? (
        <AdminParagraph role="alert">{detailError}</AdminParagraph>
      ) : null}
      {!error && !loading && nodes.length === 0 ? (
        <AdminParagraph className={styles.message}>
          当前没有权限目录。
        </AdminParagraph>
      ) : null}
      <section className={styles.panel} aria-label="权限目录">
        <Table<CatalogRow>
          rowKey="permissionId"
          columns={columns}
          dataSource={rows}
          loading={loading}
          pagination={false}
          scroll={{ x: 900 }}
        />
      </section>
      <Modal
        title={editing ? "编辑目录节点" : "新建目录节点"}
        open={open}
        onCancel={() => {
          if (!busy && !gate.isLocked()) setOpen(false);
        }}
        onOk={() => void save()}
        confirmLoading={saving}
        okButtonProps={{ disabled: busy || loading || !!error }}
        cancelButtonProps={{ disabled: busy }}
        closable={!busy}
        maskClosable={!busy}
        destroyOnHidden
      >
        <Form<CatalogForm>
          form={form}
          layout="vertical"
          onFinish={() => void save()}
        >
          {!editing ? (
            <>
              <Form.Item
                name="permissionKey"
                label="唯一键"
                rules={[
                  {
                    required: true,
                    pattern: /^custom:[a-z0-9][a-z0-9._:-]{0,92}$/,
                    message: "请输入有效的 custom: 唯一键",
                  },
                ]}
                extra={
                  <FormHint>
                    必填，以 custom: 开头，后接小写字母、数字或 . _ :
                    -；总长不超过100字，创建后不可修改。
                  </FormHint>
                }
              >
                <Input maxLength={100} disabled={busy} />
              </Form.Item>
              <Form.Item
                name="permissionType"
                label="节点类型"
                rules={[{ required: true }]}
                extra={
                  <FormHint>
                    必选，目录用于分组，菜单表示页面入口，按钮表示具体操作权限；不会自动创建前端页面。
                  </FormHint>
                }
              >
                <Select
                  disabled={busy}
                  options={[
                    { value: "directory", label: "目录" },
                    { value: "menu", label: "菜单" },
                    { value: "button", label: "按钮" },
                  ]}
                  onChange={(value: CatalogType) => {
                    setType(value);
                    form.setFieldValue("parentId", null);
                  }}
                />
              </Form.Item>
            </>
          ) : (
            <AdminParagraph>
              <code>{editing.permissionKey}</code> · {editing.permissionType}
            </AdminParagraph>
          )}
          <Form.Item
            name="permissionName"
            label="显示名称"
            rules={[{ required: true, whitespace: true, max: 100 }]}
            extra={<FormHint>必填，用于权限目录展示，最多100字。</FormHint>}
          >
            <Input maxLength={100} disabled={busy} />
          </Form.Item>
          {type !== "directory" ? (
            <Form.Item
              name="parentId"
              label="活动父级"
              rules={[{ required: true, message: "请选择活动父级" }]}
              extra={
                <FormHint>
                  必选，选择符合节点类型规则的启用父级，不能选择自己或后代。
                </FormHint>
              }
            >
              <Select disabled={busy} allowClear options={candidates} />
            </Form.Item>
          ) : null}
          <Form.Item
            name="route"
            label="前端路由（可空）"
            rules={[
              {
                validator: (_, value: string | null | undefined) =>
                  type === "menu" &&
                  value?.trim() &&
                  !value.trim().startsWith("/")
                    ? Promise.reject(new Error("菜单路由必须以 / 开头"))
                    : Promise.resolve(),
              },
            ]}
            extra={
              <FormHint>
                选填，菜单路由以 /
                开头，最多200字；后台左侧入口由前端已实现页面的映射管理。
              </FormHint>
            }
          >
            <Input maxLength={200} disabled={busy} />
          </Form.Item>
          <Form.Item
            name="icon"
            label="图标键"
            extra={
              <FormHint>
                选填，填写图标标识，最多100字；不会自动安装或新增图标。
              </FormHint>
            }
          >
            <Input maxLength={100} disabled={busy} />
          </Form.Item>
          <Form.Item
            name="sortOrder"
            label="排序"
            rules={[{ required: true }]}
            extra={
              <FormHint>必填，−100000至100000的整数，较小的值优先。</FormHint>
            }
          >
            <InputNumber
              min={-100000}
              max={100000}
              precision={0}
              disabled={busy}
            />
          </Form.Item>
          <Form.Item
            name="visible"
            label="导航可见"
            valuePropName="checked"
            extra={
              <FormHint>
                控制该权限节点的导航可见标记；不会授予访问权限，前端仍按页面映射及账号权限筛选。
              </FormHint>
            }
          >
            <Switch disabled={busy} />
          </Form.Item>
          {editing?.source === "custom" &&
          editing.permissionType !== "directory" ? (
            <Form.Item
              name="status"
              label="状态"
              rules={[{ required: true }]}
              extra={
                <FormHint>
                  必选，停用后该权限节点不再作为有效授权配置使用。
                </FormHint>
              }
            >
              <Select
                disabled={busy}
                options={[
                  { value: "active", label: "启用" },
                  { value: "disabled", label: "停用" },
                ]}
              />
            </Form.Item>
          ) : editing ? (
            <AdminParagraph>系统节点与目录不能手动停用。</AdminParagraph>
          ) : null}
        </Form>
      </Modal>
    </main>
  );
}
