"use client";
import { ControlHint } from "@/components/control-hint";

import { FormHint } from "@/components/form-hint";
import { AdminParagraph } from "@/components/admin-paragraph";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { canResetPasswords } from "@/features/users/password-reset-run";
import {
  App,
  Button,
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
import { managedUserDetailRoute } from "@/config/routes";
import {
  AccountSession,
  AccountWriteRecovery,
  useAccountWrites,
} from "@/features/users/user-session";
import {
  createAccountBody,
  replaceAccountRoles,
  accountError,
  isAccountAdministrator,
  UserInputError,
  type Operator,
  type AccountRole,
  type ManagedAccount,
  type AccountCreateValues,
} from "@/features/users/user-model";
import {
  verifyAccountIdentity,
  readAccountTarget,
  readAccountRoleCatalog,
  readAccountPage,
} from "@/features/users/user-queries";
import styles from "@/app/admin/system/users/page.module.css";
type AccountPage = components["schemas"]["ManagedUserPageVO"];
export default function UserConsole() {
  return (
    <AccountSession>
      {(operator) => <AccountWorkspace operator={operator} />}
    </AccountSession>
  );
}
function AccountWorkspace({ operator }: { operator: Operator }) {
  const { message } = App.useApp(),
    { retryRestore } = useSession();
  const commands = useAccountWrites(operator);
  const [createForm] = Form.useForm<AccountCreateValues>(),
    [rolesForm] = Form.useForm<{ roleIds: number[] }>();
  const [page, setPage] = useState(1),
    [keyword, setKeyword] = useState(""),
    [input, setInput] = useState(""),
    [status, setStatus] = useState<"active" | "disabled">();
  const [data, setData] = useState<AccountPage>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string>(),
    [attempt, setAttempt] = useState(0);
  const [modal, setModal] = useState<"create" | "roles">(),
    [target, setTarget] = useState<ManagedAccount>(),
    [catalog, setCatalog] = useState<AccountRole[]>([]);
  const [opening, setOpening] = useState(false),
    [openingError, setOpeningError] = useState<string>();
  const [lane] = useState(() => new RequestLane()),
    [editorLane] = useState(() => new RequestLane());
  const [editorLock] = useState(() => ({ busy: false }));
  const busy = commands.saving || commands.pending || opening;
  const has = (key: string) => operator.permissionKeys.includes(key);
  const catalogAllowed = has("system:role:list"),
    administrator = isAccountAdministrator(operator);
  const currentRead = useRef({ operator, page, keyword, status });
  currentRead.current = { operator, page, keyword, status };
  const load = useCallback(async () => {
    const current = currentRead.current;
    if (
      document.visibilityState !== "visible" ||
      current.operator !== operator ||
      current.page !== page ||
      current.keyword !== keyword ||
      current.status !== status
    )
      return false;
    setLoading(true);
    setError(undefined);
    setData(undefined);
    return lane.run(
      async (signal) => {
        return readAccountPage(operator, page, keyword, status, signal);
      },
      setData,
      (cause) => setError(accountError(cause)),
      () => setLoading(false),
    );
  }, [lane, operator, page, keyword, status]);
  useEffect(() => {
    void load();
    const clear = () => {
      lane.cancel();
      editorLane.cancel();
      setData(undefined);
      setLoading(false);
      setError("页面读取已暂停，请点击刷新重新读取账号");
      setModal(undefined);
      setTarget(undefined);
      setCatalog([]);
      setOpening(false);
      setOpeningError(undefined);
      createForm.resetFields();
      rolesForm.resetFields();
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
  }, [lane, load, attempt, editorLane, createForm, rolesForm]);
  useEffect(
    () => () => {
      editorLane.cancel();
      createForm.resetFields();
      rolesForm.resetFields();
    },
    [editorLane, createForm, rolesForm],
  );
  useEffect(() => {
    if (commands.pending) {
      setModal(undefined);
      createForm.resetFields();
      rolesForm.resetFields();
    }
  }, [commands.pending, createForm, rolesForm]);
  function close() {
    if (commands.gate.isLocked() || editorLock.busy) return;
    setModal(undefined);
    setTarget(undefined);
    createForm.resetFields();
    rolesForm.resetFields();
  }
  async function openEditor(kind: "create" | "roles", userId?: number) {
    if (
      busy ||
      document.visibilityState !== "visible" ||
      loading ||
      commands.gate.isLocked() ||
      editorLock.busy ||
      !has(kind === "create" ? "system:user:create" : "system:user:assign-role")
    )
      return;
    if (kind === "roles" && !catalogAllowed) return;
    editorLock.busy = true;
    setOpening(true);
    setOpeningError(undefined);
    setModal(undefined);
    setTarget(undefined);
    setCatalog([]);
    createForm.resetFields();
    rolesForm.resetFields();
    try {
      await editorLane.run(
        async (signal) => {
          await verifyAccountIdentity(operator, signal);
          const roles = catalogAllowed
            ? await readAccountRoleCatalog(operator, signal)
            : [];
          signal.throwIfAborted();
          const account =
            kind === "roles"
              ? await readAccountTarget(userId!, signal)
              : undefined;
          await verifyAccountIdentity(operator, signal);
          return { roles, account };
        },
        ({ roles, account }) => {
          setCatalog(roles);
          setTarget(account);
          if (kind === "create")
            createForm.setFieldsValue({
              account: "",
              nickname: "",
              password: "",
              roleIds: [],
            });
          else
            rolesForm.setFieldsValue({
              roleIds: account!.roles.map((role) => role.roleId),
            });
          setModal(kind);
        },
        (cause) => setOpeningError(accountError(cause)),
        () => setOpening(false),
      );
    } finally {
      editorLock.busy = false;
    }
  }
  async function create() {
    if (modal !== "create" || opening) return;
    await commands.run(
      "create",
      async () => {
        let values: AccountCreateValues;
        try {
          values = await createForm.validateFields();
        } catch (cause) {
          if (cause && typeof cause === "object" && "errorFields" in cause)
            return null;
          throw cause;
        }
        const body = createAccountBody(values, catalog, operator);
        return { body, mutation: { action: "create", account: body.account } };
      },
      (body, signal) =>
        apiRequest("/admin/users", { method: "POST", body, signal }),
      () => {
        setModal(undefined);
        createForm.resetFields();
        setAttempt((n) => n + 1);
        message.success("账号已创建，用户可自行修改密码");
      },
    );
  }
  async function assign() {
    if (modal !== "roles" || !target || opening) return;
    const userId = target.userId;
    await commands.run(
      "roles",
      async (signal) => {
        let values: { roleIds: number[] };
        try {
          values = await rolesForm.validateFields();
        } catch (cause) {
          if (cause && typeof cause === "object" && "errorFields" in cause)
            return null;
          throw cause;
        }
        const body = replaceAccountRoles(values.roleIds, catalog, operator);
        await readAccountTarget(userId, signal);
        return { body, mutation: { action: "roles", userId } };
      },
      (body, signal) =>
        apiRequest(`/admin/users/${userId}/roles`, {
          method: "PUT",
          body,
          signal,
        }),
      () => {
        setModal(undefined);
        setTarget(undefined);
        rolesForm.resetFields();
        setAttempt((n) => n + 1);
        message.success("账号角色已全量替换");
        if (userId === operator.userId) void retryRestore();
      },
    );
  }
  async function setStatusFor(
    account: ManagedAccount,
    next: "active" | "disabled",
  ) {
    if (editorLock.busy || modal) return;
    await commands.run(
      "status",
      async (signal) => {
        const current = await readAccountTarget(account.userId, signal);
        if (current.status !== account.status)
          throw new UserInputError("账号状态已变化，请刷新后操作");
        return {
          body: { status: next },
          mutation: { action: "status", userId: account.userId },
        };
      },
      (body, signal) =>
        apiRequest(`/admin/users/${account.userId}/status`, {
          method: "PATCH",
          body,
          signal,
        }),
      () => {
        setAttempt((n) => n + 1);
        message.success(next === "active" ? "账号已启用" : "账号已停用");
        if (account.userId === operator.userId) void retryRestore();
      },
    );
  }
  const columns: TableColumnsType<ManagedAccount> = [
    {
      title: "账号",
      key: "account",
      render: (_, account) => (
        <div className={styles.identity}>
          <Link href={managedUserDetailRoute(account.userId)}>
            {account.account}
          </Link>
          <span>{account.nickname}</span>
          {canResetPasswords(operator) ? (
            <Link href={managedUserDetailRoute(account.userId)}>重置密码</Link>
          ) : null}
        </div>
      ),
    },
    {
      title: "角色",
      render: (_, account) =>
        account.roles
          .map(
            (role) =>
              `${role.roleName}${role.status === "active" ? "" : "（停用）"}`,
          )
          .join("、") || "未分配",
    },
    {
      title: "商家资料",
      render: (_, account) =>
        account.merchant
          ? `${account.merchant.businessName}（${account.merchant.status === "active" ? "启用" : "停用"}）`
          : "未关联",
    },
    {
      title: "状态",
      render: (_, account) => (
        <Tag color={account.status === "active" ? "green" : "default"}>
          {account.status === "active" ? "启用" : "停用"}
        </Tag>
      ),
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      render: (value: string) => new Date(value).toLocaleString("zh-CN"),
    },
    {
      title: "操作",
      render: (_, account) => (
        <Space wrap>
          {has("system:user:assign-role") ? (
            <Button
              type="link"
              disabled={busy || loading || !!modal || !catalogAllowed}
              onClick={() => void openEditor("roles", account.userId)}
            >
              分配角色
            </Button>
          ) : null}
          {has("system:user:update") ? (
            <Popconfirm
              title={
                account.status === "active" ? "停用此账号？" : "启用此账号？"
              }
              description="最后一名有效系统管理员由后端保护。"
              disabled={busy || loading || !!modal}
              onConfirm={() =>
                void setStatusFor(
                  account,
                  account.status === "active" ? "disabled" : "active",
                )
              }
            >
              <Button
                type="link"
                danger={account.status === "active"}
                disabled={busy || loading || !!modal}
              >
                {account.status === "active" ? "停用" : "启用"}
              </Button>
            </Popconfirm>
          ) : null}
        </Space>
      ),
    },
  ];
  const roleOptions = catalog
    .filter((role) => administrator || role.roleKey !== "system_admin")
    .map((role) => ({
      value: role.roleId,
      label: `${role.roleName} (${role.roleKey})`,
    }));
  const unavailable =
    target?.roles.filter(
      (role) => !roleOptions.some((option) => option.value === role.roleId),
    ) ?? [];
  const options = [
    ...roleOptions,
    ...unavailable.map((role) => ({
      value: role.roleId,
      label: `${role.roleName} (${role.roleKey})：不可授予，请移除`,
    })),
  ];
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div>
          <h1>账号管理</h1>
        </div>
        <Space wrap>
          {has("system:user:create") ? (
            <Button
              type="primary"
              disabled={busy || loading || !!modal || !!error}
              onClick={() => void openEditor("create")}
            >
              新建账号
            </Button>
          ) : null}
          <Button
            disabled={busy || loading || !!modal}
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
      {has("system:user:assign-role") && !catalogAllowed ? (
        <AdminParagraph>
          配置角色需要角色目录查询权限；现有账号列表仍可读取。
        </AdminParagraph>
      ) : null}
      <section className={styles.filters} aria-label="账号筛选">
        <ControlHint hint="选填，按账号或昵称搜索，最多100字；按回车或搜索按钮应用。">
          <Input.Search
            aria-label="搜索账号或昵称"
            maxLength={100}
            allowClear
            value={input}
            disabled={busy || !!modal}
            placeholder="搜索账号或昵称"
            onChange={(event) => {
              setInput(event.target.value);
              if (!event.target.value) {
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
        <ControlHint hint="选填，按账号启停状态筛选；清空表示全部状态。">
          <Select
            aria-label="账号状态"
            allowClear
            placeholder="全部状态"
            value={status}
            disabled={busy || !!modal}
            onChange={(value) => {
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
      <AccountWriteRecovery
        operator={operator}
        pending={commands.pending}
        saving={commands.saving}
        reload={load}
        acknowledge={() => {
          commands.acknowledge();
          setModal(undefined);
          setTarget(undefined);
          createForm.resetFields();
          rolesForm.resetFields();
        }}
      />
      {opening ? (
        <AdminParagraph role="status">
          正在读取最新账号和角色目录
        </AdminParagraph>
      ) : null}
      {openingError ? (
        <AdminParagraph role="alert">
          {openingError}。请重新打开操作。
        </AdminParagraph>
      ) : null}
      {error ? (
        <section className={styles.error} role="alert">
          <AdminParagraph>{error}</AdminParagraph>
          <Button
            disabled={busy || loading}
            onClick={() => setAttempt((n) => n + 1)}
          >
            重试
          </Button>
          {page > 1 ? (
            <Button disabled={busy} onClick={() => setPage(1)}>
              返回第一页
            </Button>
          ) : null}
        </section>
      ) : null}
      <Table<ManagedAccount>
        rowKey="userId"
        columns={columns}
        dataSource={data?.items ?? []}
        loading={loading}
        locale={{ emptyText: "暂无账号" }}
        scroll={{ x: 1000 }}
        pagination={{
          current: page,
          pageSize: 20,
          total: data?.total ?? 0,
          showSizeChanger: false,
          disabled: busy || loading || !!modal,
          onChange: setPage,
        }}
      />
      {!loading && !error && data?.items.length === 0 && page > 1 ? (
        <Button disabled={busy} onClick={() => setPage(page - 1)}>
          返回上一页
        </Button>
      ) : null}
      <Modal
        title="新建账号"
        open={modal === "create"}
        onCancel={close}
        onOk={() => void create()}
        confirmLoading={commands.saving}
        okButtonProps={{ disabled: busy }}
        cancelButtonProps={{ disabled: busy }}
        closable={!busy}
        maskClosable={!busy}
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" preserve={false}>
          <Form.Item
            label="账号"
            name="account"
            rules={[{ required: true, whitespace: true }]}
            extra={
              <FormHint>
                必填，填写唯一登录账号，最多50字；保存时转为小写并去除首尾空格。
              </FormHint>
            }
          >
            <Input disabled={busy} maxLength={50} autoComplete="off" />
          </Form.Item>
          <Form.Item
            label="昵称"
            name="nickname"
            rules={[{ required: true, whitespace: true }]}
            extra={
              <FormHint>必填，填写展示昵称，最多50字，不能只含空格。</FormHint>
            }
          >
            <Input disabled={busy} maxLength={50} />
          </Form.Item>
          <Form.Item
            label="初始密码"
            name="password"
            rules={[
              { required: true },
              {
                validator: async (_, value: string) => {
                  const bytes = new TextEncoder().encode(value ?? "").length;
                  if (bytes < 8 || bytes > 72)
                    throw new Error("密码必须为 8–72 UTF-8 字节");
                },
              },
            ]}
            extra={
              <FormHint>
                {"必填，8–72个UTF-8字节，不去除空格；用户创建后可自行修改。"}
              </FormHint>
            }
          >
            <Input.Password disabled={busy} autoComplete="new-password" />
          </Form.Item>
          {catalogAllowed ? (
            <Form.Item
              label="角色（不选使用默认注册角色）"
              name="roleIds"
              extra={
                <FormHint>
                  选择已有角色，可多选；新建时留空使用默认注册角色，分配角色时以本次完整选择为准。
                </FormHint>
              }
            >
              <Select mode="multiple" disabled={busy} options={roleOptions} />
            </Form.Item>
          ) : (
            <AdminParagraph>
              未授权读取角色目录，本次创建使用默认注册角色。
            </AdminParagraph>
          )}
        </Form>
      </Modal>
      <Modal
        title={target ? `分配角色 · ${target.account}` : "分配角色"}
        open={modal === "roles"}
        onCancel={close}
        onOk={() => void assign()}
        confirmLoading={commands.saving}
        okButtonProps={{ disabled: busy }}
        cancelButtonProps={{ disabled: busy }}
        closable={!busy}
        maskClosable={!busy}
        destroyOnHidden
      >
        <AdminParagraph>
          保存会完整替换该账号的角色；清空表示移除全部角色。
        </AdminParagraph>
        {unavailable.length ? (
          <AdminParagraph role="alert">
            部分原有角色已停用、不可见或不可授予；请显式移除后再保存，不会自动丢弃。
          </AdminParagraph>
        ) : null}
        <Form form={rolesForm} layout="vertical" preserve={false}>
          <Form.Item
            name="roleIds"
            label="账号角色"
            rules={[{ type: "array" }]}
            extra={
              <FormHint>
                选择已有角色，可多选；新建时留空使用默认注册角色，分配角色时以本次完整选择为准。
              </FormHint>
            }
          >
            <Select mode="multiple" disabled={busy} options={options} />
          </Form.Item>
        </Form>
      </Modal>
    </main>
  );
}
