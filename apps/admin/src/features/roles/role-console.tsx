"use client";
import { ControlHint } from "@/components/control-hint";

import { FormHint } from "@/components/form-hint";
import { AdminParagraph } from "@/components/admin-paragraph";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  App,
  Button,
  Descriptions,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import type { TableColumnsType } from "antd";
import type { components } from "@common/api-contracts/openapi";
import { apiRequest } from "@/platform/api";
import { RequestLane } from "@/platform/api/request-lane";
import { useSession } from "@/platform/auth/session-provider";
import {
  managedRoleDetailRoute,
  roleAuthorizationRoute,
  routes,
} from "@/config/routes";
import {
  createRoleBody,
  updateRoleBody,
  type RoleFormValues,
} from "@/features/roles/role-form";
import {
  RoleSession,
  RoleRecovery,
  useRoleWrite,
} from "@/features/roles/role-session";
import {
  isRoleAdministrator,
  roleError,
  RoleInputError,
  type ManagedRole,
  type RoleUser,
} from "@/features/roles/role-workflow";
import {
  readRolePage,
  readRoleDetail,
  readRoleTarget,
} from "@/features/roles/role-queries";
import { parseManagedRole } from "@/features/roles/role-response";
import styles from "@/app/admin/system/roles/page.module.css";
type RolePage = components["schemas"]["ManagedRolePageVO"];
type Status = ManagedRole["status"];

export default function RoleConsole({ roleId }: { roleId?: number }) {
  return (
    <RoleSession target={String(roleId ?? "list")}>
      {(user) => <RoleWorkspace user={user} roleId={roleId} />}
    </RoleSession>
  );
}

function RoleWorkspace({ user, roleId }: { user: RoleUser; roleId?: number }) {
  const { retryRestore } = useSession(),
    { message } = App.useApp();
  const [form] = Form.useForm<RoleFormValues>();
  const [page, setPage] = useState(1),
    [keyword, setKeyword] = useState(""),
    [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>();
  const [data, setData] = useState<RolePage>(),
    [detail, setDetail] = useState<ManagedRole>();
  const [loading, setLoading] = useState(true),
    [error, setError] = useState<string>();
  const [detailLoading, setDetailLoading] = useState(false),
    [detailError, setDetailError] = useState<string>();
  const [attempt, setAttempt] = useState(0),
    [open, setOpen] = useState(false),
    [editing, setEditing] = useState<ManagedRole | null>(null);
  const [lane] = useState(() => new RequestLane()),
    [editLane] = useState(() => new RequestLane());
  const commands = useRoleWrite(user),
    admin = isRoleAdministrator(user);
  const busy = commands.saving || commands.pending || detailLoading;
  const has = (key: string) => user.permissionKeys.includes(key);
  const canAssign = admin && has("system:permission:assign");
  const currentRead = useRef({ user, roleId, page, keyword, status });
  currentRead.current = { user, roleId, page, keyword, status };
  const [editorLock] = useState(() => ({ busy: false }));
  const load = useCallback(async () => {
    const current = currentRead.current;
    if (
      document.visibilityState !== "visible" ||
      current.user !== user ||
      current.roleId !== roleId ||
      current.page !== page ||
      current.keyword !== keyword ||
      current.status !== status
    )
      return false;
    setLoading(true);
    setError(undefined);
    setData(undefined);
    setDetail(undefined);
    return lane.run(
      async (signal) => {
        if (roleId !== undefined) {
          const detail = await readRoleDetail(user, roleId, signal);
          return { detail };
        }
        return {
          data: await readRolePage(user, page, keyword, status, signal),
        };
      },
      (result) => {
        setData(result.data);
        setDetail(result.detail);
      },
      (cause) => setError(roleError(cause)),
      () => setLoading(false),
    );
  }, [lane, user, roleId, page, keyword, status]);
  useEffect(() => {
    void load();
    const clear = () => {
      lane.cancel();
      editLane.cancel();
      setData(undefined);
      setDetail(undefined);
      setLoading(false);
      setError("页面读取已暂停，请点击刷新重新读取角色");
      setOpen(false);
      setEditing(null);
      setDetailLoading(false);
      setDetailError(undefined);
      editorLock.busy = false;
      form.resetFields();
    };
    const hide = () => {
      if (document.visibilityState !== "visible") clear();
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", clear);
    return () => {
      lane.cancel();
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", clear);
    };
  }, [load, lane, attempt, editLane, editorLock, form]);
  useEffect(() => () => editLane.cancel(), [editLane]);
  useEffect(() => {
    if (commands.pending) setOpen(false);
  }, [commands.pending]);

  async function edit(id: number) {
    if (
      busy ||
      loading ||
      document.visibilityState !== "visible" ||
      editorLock.busy ||
      commands.gate.isLocked() ||
      !has("system:role:update")
    )
      return;
    editorLock.busy = true;
    setDetailLoading(true);
    setDetailError(undefined);
    setOpen(false);
    await editLane.run(
      async (signal) => {
        const role = await readRoleDetail(user, id, signal);
        if (role.roleId !== id || role.roleKey === "system_admin")
          throw new RoleInputError("此角色不能编辑，请刷新数据");
        return role;
      },
      (role) => {
        setEditing(role);
        form.resetFields();
        form.setFieldsValue({ ...role, description: role.description ?? "" });
        setOpen(true);
      },
      (cause) => setDetailError(roleError(cause)),
      () => {
        editorLock.busy = false;
        setDetailLoading(false);
      },
    );
  }
  function create() {
    if (
      busy ||
      loading ||
      document.visibilityState !== "visible" ||
      error ||
      commands.gate.isLocked() ||
      !has("system:role:create")
    )
      return;
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      roleKey: "",
      roleName: "",
      description: "",
      dataScope: "self",
      status: "active",
    });
    setOpen(true);
  }
  async function save() {
    await commands.run(
      editing ? "update" : "create",
      async () => {
        let values: RoleFormValues;
        try {
          values = await form.validateFields();
        } catch (cause) {
          if (cause && typeof cause === "object" && "errorFields" in cause)
            return null;
          throw cause;
        }
        return editing
          ? updateRoleBody(values, admin)
          : createRoleBody(values, admin);
      },
      async (body, signal) =>
        parseManagedRole(
          await apiRequest(
            editing ? `/admin/roles/${editing.roleId}` : "/admin/roles",
            { method: editing ? "PATCH" : "POST", body, signal },
          ),
          editing?.roleId,
        ),
      () => {
        setOpen(false);
        form.resetFields();
        setAttempt((n) => n + 1);
        message.success(editing ? "角色已更新" : "角色已创建");
      },
      admin,
    );
  }
  async function disable(id: number) {
    await commands.run(
      "delete",
      async (signal) => {
        const role = await readRoleTarget(id, signal);
        if (
          role.roleId !== id ||
          role.roleKey === "system_admin" ||
          role.status !== "active"
        )
          throw new RoleInputError("角色状态已变化，请刷新数据");
        return id;
      },
      (value, signal) =>
        apiRequest(`/admin/roles/${value}`, { method: "DELETE", signal }),
      () => {
        setAttempt((n) => n + 1);
        message.success("角色已停用");
      },
    );
  }
  function actions(role: ManagedRole) {
    return (
      <Space wrap>
        {!roleId ? (
          <Link href={managedRoleDetailRoute(role.roleId)}>详情</Link>
        ) : null}
        {canAssign && role.roleKey !== "system_admin" ? (
          <Link href={roleAuthorizationRoute(role.roleId)}>授权配置</Link>
        ) : null}
        {has("system:role:update") && role.roleKey !== "system_admin" ? (
          <Button
            type="link"
            disabled={busy || loading}
            onClick={() => void edit(role.roleId)}
          >
            编辑
          </Button>
        ) : null}
        {has("system:role:delete") && role.roleKey !== "system_admin" ? (
          <Popconfirm
            title="停用此角色？"
            description="停用后，该角色将不再参与权限计算。注册基础角色由服务端保护。"
            disabled={busy || loading || role.status === "disabled"}
            onConfirm={() => void disable(role.roleId)}
          >
            <Button
              type="link"
              danger
              disabled={busy || loading || role.status === "disabled"}
            >
              停用
            </Button>
          </Popconfirm>
        ) : null}
      </Space>
    );
  }
  const columns: TableColumnsType<ManagedRole> = [
    {
      title: "角色",
      key: "role",
      render: (_, role) => (
        <div className={styles.roleIdentity}>
          <Link href={managedRoleDetailRoute(role.roleId)}>
            {role.roleName}
          </Link>
          <code>{role.roleKey}</code>
        </div>
      ),
    },
    {
      title: "说明",
      dataIndex: "description",
      render: (value: string | null) => value || "未填写",
    },
    {
      title: "状态",
      dataIndex: "status",
      render: (value: Status) => (
        <Tag color={value === "active" ? "green" : "default"}>
          {value === "active" ? "启用" : "停用"}
        </Tag>
      ),
    },
    { title: "默认范围", dataIndex: "dataScope" },
    {
      title: "关联",
      render: (_, role) =>
        `${role.userCount} 账号 · ${role.permissionCount} 权限 · ${role.fieldPolicyCount} 字段策略`,
    },
    {
      title: "资源范围",
      render: (_, role) =>
        role.dataScopes
          .map((s) => `${s.resourceKey}: ${s.scopeType}`)
          .join("、") || "使用默认范围",
    },
    { title: "操作", render: (_, role) => actions(role) },
  ];
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div>
          <h1>{roleId ? "角色详情" : "角色管理"}</h1>
        </div>
        <Space wrap>
          {roleId ? (
            <Link href={routes.roles}>返回角色</Link>
          ) : has("system:role:create") ? (
            <Button
              type="primary"
              disabled={busy || loading || !!error}
              onClick={create}
            >
              新建角色
            </Button>
          ) : null}
          <Button
            disabled={busy || loading}
            onClick={() => setAttempt((n) => n + 1)}
          >
            刷新
          </Button>
          <Button
            disabled={commands.saving}
            onClick={() => {
              if (!commands.gate.isRunning()) void retryRestore();
            }}
          >
            重新读取身份
          </Button>
        </Space>
      </header>
      {!roleId ? (
        <section className={styles.filters} aria-label="角色筛选">
          <ControlHint hint="选填，按角色键或名称搜索，最多100字。">
            <Input.Search
              aria-label="搜索角色"
              maxLength={100}
              allowClear
              placeholder="搜索角色名称或键"
              disabled={busy}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (!e.target.value) {
                  setKeyword("");
                  setPage(1);
                }
              }}
              onSearch={(value) => {
                setKeyword(value.trim());
                setPage(1);
              }}
              style={{ width: 300, maxWidth: "100%" }}
            />
          </ControlHint>
          <ControlHint hint="选填，按角色启停状态筛选；清空表示全部状态。">
            <Select
              aria-label="角色状态"
              allowClear
              placeholder="全部状态"
              disabled={busy}
              value={status}
              onChange={(value: Status | undefined) => {
                setStatus(value);
                setPage(1);
              }}
              options={[
                { value: "active", label: "启用" },
                { value: "disabled", label: "停用" },
              ]}
              style={{ width: 150 }}
            />
          </ControlHint>
        </section>
      ) : null}
      <RoleRecovery
        pending={commands.pending}
        saving={commands.saving}
        reload={load}
        acknowledge={() => {
          commands.acknowledge();
          setOpen(false);
          setEditing(null);
          form.resetFields();
        }}
      />
      {error ? (
        <section className={styles.error} role="alert">
          <AdminParagraph>{error}</AdminParagraph>
          <Button
            disabled={busy || loading}
            onClick={() => setAttempt((n) => n + 1)}
          >
            重试
          </Button>
          {!roleId && page > 1 ? (
            <Button disabled={busy} onClick={() => setPage(1)}>
              返回第一页
            </Button>
          ) : null}
        </section>
      ) : null}
      {detailError ? (
        <AdminParagraph role="alert">{detailError}</AdminParagraph>
      ) : null}
      {detailLoading ? (
        <AdminParagraph role="status">正在读取最新角色</AdminParagraph>
      ) : null}
      {roleId ? (
        loading ? (
          <AdminParagraph role="status">正在读取角色详情</AdminParagraph>
        ) : detail ? (
          <>
            <Descriptions
              title={detail.roleName}
              bordered
              column={1}
              items={[
                { key: "key", label: "角色键", children: detail.roleKey },
                {
                  key: "description",
                  label: "说明",
                  children: detail.description || "未填写",
                },
                {
                  key: "status",
                  label: "状态",
                  children: detail.status === "active" ? "启用" : "停用",
                },
                {
                  key: "scope",
                  label: "默认数据范围",
                  children: detail.dataScope,
                },
                {
                  key: "counts",
                  label: "关联",
                  children: `${detail.userCount} 账号 · ${detail.permissionCount} 权限 · ${detail.fieldPolicyCount} 字段策略`,
                },
                {
                  key: "resources",
                  label: "资源范围",
                  children:
                    detail.dataScopes
                      .map((s) => `${s.resourceKey}: ${s.scopeType}`)
                      .join("、") || "使用默认范围",
                },
              ]}
            />
            {detail.roleKey === "system_admin" ? (
              <AdminParagraph>系统管理员角色受保护。</AdminParagraph>
            ) : (
              actions(detail)
            )}
          </>
        ) : null
      ) : (
        <Table<ManagedRole>
          rowKey="roleId"
          columns={columns}
          dataSource={data?.items ?? []}
          loading={loading}
          scroll={{ x: 1100 }}
          locale={{ emptyText: "暂无角色" }}
          pagination={{
            current: page,
            pageSize: 20,
            total: data?.total ?? 0,
            showSizeChanger: false,
            disabled: busy || loading,
            onChange: setPage,
          }}
        />
      )}
      {!roleId && !loading && !error && data?.items.length === 0 && page > 1 ? (
        <Button disabled={busy} onClick={() => setPage(page - 1)}>
          返回上一页
        </Button>
      ) : null}
      <Modal
        title={editing ? "编辑角色" : "新建角色"}
        open={open}
        onOk={() => void save()}
        onCancel={() => {
          if (!busy && !commands.gate.isLocked()) setOpen(false);
        }}
        confirmLoading={commands.saving}
        okButtonProps={{ disabled: busy }}
        cancelButtonProps={{ disabled: busy }}
        closable={!busy}
        maskClosable={!busy}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={() => void save()}>
          <Form.Item
            name="roleKey"
            label="角色键"
            rules={[
              {
                required: true,
                pattern: /^[a-z][a-z0-9._-]{0,49}$/,
                message: "使用小写字母开头的有效角色键",
              },
            ]}
            extra={
              <FormHint>
                必填，小写字母开头，可含小写字母、数字、点、下划线和短横线，最多50字；创建后不可修改。
              </FormHint>
            }
          >
            <Input maxLength={50} disabled={busy} />
          </Form.Item>
          <Form.Item
            name="roleName"
            label="角色名称"
            rules={[{ required: true, whitespace: true, max: 50 }]}
            extra={
              <FormHint>必填，用于管理端展示的角色名称，最多50字。</FormHint>
            }
          >
            <Input maxLength={50} disabled={busy} />
          </Form.Item>
          <Form.Item
            name="description"
            label="角色说明"
            extra={
              <FormHint>选填，说明角色的职责和适用对象，最多300字。</FormHint>
            }
          >
            <Input.TextArea
              maxLength={300}
              rows={3}
              showCount
              disabled={busy}
            />
          </Form.Item>
          <Form.Item
            name="dataScope"
            label="默认数据范围"
            rules={[{ required: true }]}
            extra={
              <FormHint>
                {admin
                  ? "选择本人、所属商家或全部，作为未单独配置资源时的默认范围；具体操作仍受业务权限约束。"
                  : "仅系统管理员可配置；新建角色默认本人范围。"}
              </FormHint>
            }
          >
            <Select
              disabled={busy || !admin}
              options={[
                { value: "self", label: "本人" },
                { value: "merchant", label: "所属商家" },
                { value: "all", label: "全部" },
              ]}
            />
          </Form.Item>
          {editing ? (
            <Form.Item
              name="status"
              label="状态"
              rules={[{ required: true }]}
              extra={
                <FormHint>
                  必选，停用将影响该角色的后续有效授权；操作前请核对关联账号。
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
          ) : null}
        </Form>
      </Modal>
    </main>
  );
}
