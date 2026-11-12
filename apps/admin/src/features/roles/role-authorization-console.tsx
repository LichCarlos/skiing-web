"use client";
import { ControlHint } from "@/components/control-hint";

import { AdminParagraph } from "@/components/admin-paragraph";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  App,
  Button,
  Checkbox,
  Input,
  Select,
  Space,
  Spin,
  Tree,
  Typography,
} from "antd";
import type { DataNode } from "antd/es/tree";
import type { components } from "@common/api-contracts/openapi";
import { apiRequest } from "@/platform/api";
import { routes, managedRoleDetailRoute } from "@/config/routes";
import { useSession } from "@/platform/auth/session-provider";
import { RequestLane } from "@/platform/api/request-lane";
import {
  RoleSession,
  RoleRecovery,
  useRoleWrite,
} from "@/features/roles/role-session";
import { roleError, type RoleUser } from "@/features/roles/role-workflow";
import { readRoleAuthorization } from "@/features/roles/role-queries";
import { parseRoleAuthorization } from "@/features/roles/role-response";
import {
  buildAuthorizationBody,
  permissionTreeIds,
  reconcilePermissionSelection,
  type FieldPolicyRow,
} from "@/features/roles/authorization-form";
import { RoleResourceScopeEditor } from "@/features/roles/role-resource-scope-editor";
import {
  type AuthorizationResource,
  type ScopeRow,
} from "@/features/roles/role-resource-scopes";
import styles from "@/app/admin/system/roles/[id]/permissions/page.module.css";

type PermissionNode = components["schemas"]["PermissionNodeVO"];
type AuthorizationSnapshot =
  components["schemas"]["RoleAuthorizationSnapshotVO"];
type EntityType =
  components["schemas"]["RoleAuthorizationFieldPolicyDto"]["entityType"];

type ViewState =
  | { status: "loading" }
  | { status: "error"; title: string; traceId: string | null }
  | {
      status: "ready";
      role: AuthorizationSnapshot;
      permissions: PermissionNode[];
      resources: AuthorizationResource[];
    };

const entityTypes: { value: EntityType; label: string }[] = [
  { value: "ski_resort", label: "雪场" },
  { value: "article", label: "知识文章" },
  { value: "dynamic", label: "社区动态" },
  { value: "merchant_profile", label: "商家资料" },
];

function isEntityType(value: string): value is EntityType {
  return entityTypes.some((entity) => entity.value === value);
}

function toTreeNodes(nodes: PermissionNode[]): DataNode[] {
  return nodes.map((node) => ({
    key: node.permissionId,
    title: (
      <span className={styles.permissionTitle}>
        <span>{node.permissionName}</span>
        <code>{node.permissionKey}</code>
      </span>
    ),
    children: node.children.length ? toTreeNodes(node.children) : undefined,
  }));
}

export default function RoleAuthorizationConsole({
  roleId,
}: {
  roleId: number;
}) {
  return (
    <RoleSession authorization target={`authorization:${roleId}`}>
      {(user) => <RoleAuthorizationWorkspace user={user} roleId={roleId} />}
    </RoleSession>
  );
}
function RoleAuthorizationWorkspace({
  user,
  roleId,
}: {
  user: RoleUser;
  roleId: number;
}) {
  const { message } = App.useApp();
  const [view, setView] = useState<ViewState>({ status: "loading" });
  const [permissionIds, setPermissionIds] = useState<number[]>([]);
  const [scopes, setScopes] = useState<ScopeRow[]>([]);
  const [fieldPolicies, setFieldPolicies] = useState<FieldPolicyRow[]>([]);
  const commands = useRoleWrite(user);
  const saving = commands.saving;
  const [lane] = useState(() => new RequestLane());
  const [attempt, setAttempt] = useState(0);
  const { retryRestore } = useSession();
  const currentRead = useRef({ user, roleId });
  currentRead.current = { user, roleId };
  const canEdit =
    view.status === "ready" &&
    view.role.roleKey !== "system_admin" &&
    user.permissionKeys.includes("system:role:update") &&
    user.permissionKeys.includes("system:permission:assign") &&
    !saving &&
    !commands.pending;
  const load = useCallback(async () => {
    if (
      document.visibilityState !== "visible" ||
      currentRead.current.user !== user ||
      currentRead.current.roleId !== roleId
    )
      return false;
    setView({ status: "loading" });
    setPermissionIds([]);
    setScopes([]);
    setFieldPolicies([]);
    return lane.run(
      async (signal) => {
        const { role, permissions, resources } = await readRoleAuthorization(
          user,
          roleId,
          signal,
        );
        const policies = role.fieldPolicies.map((policy) => {
          if (!isEntityType(policy.entityType))
            throw new Error("Unsupported field entity");
          return {
            ...policy,
            entityType: policy.entityType,
            localKey: `field-${policy.entityType}-${policy.fieldKey}`,
          };
        });
        permissionTreeIds(permissions);
        if (role.roleId !== roleId) throw new Error("Role identity mismatch");
        return { role, permissions, resources, policies };
      },
      ({ role, permissions, resources, policies }) => {
        setView({ status: "ready", role, permissions, resources });
        setPermissionIds(role.permissionIds);
        setScopes(
          role.dataScopes.map((scope) => ({
            localKey: `scope-${scope.resourceKey}`,
            resourceKey: scope.resourceKey,
            scopeType: scope.scopeType,
            selectedIds: scope.selectedIds?.join(", ") ?? "",
          })),
        );
        setFieldPolicies(policies);
      },
      (cause) =>
        setView({ status: "error", title: roleError(cause), traceId: null }),
      () => {},
    );
  }, [lane, roleId, user]);
  useEffect(() => {
    void load();
    const clear = () => {
      lane.cancel();
      setView({
        status: "error",
        title: "页面读取已暂停，请重新读取授权配置",
        traceId: null,
      });
      setPermissionIds([]);
      setScopes([]);
      setFieldPolicies([]);
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
  }, [load, lane, attempt]);

  const treeData = useMemo(
    () => (view.status === "ready" ? toTreeNodes(view.permissions) : []),
    [view],
  );
  const knownPermissionIds = useMemo(
    () =>
      view.status === "ready"
        ? permissionTreeIds(view.permissions)
        : new Set<number>(),
    [view],
  );

  function addFieldPolicy() {
    if (!canEdit || commands.gate.isLocked()) return;
    setFieldPolicies((current) => [
      ...current,
      {
        localKey: `new-field-${crypto.randomUUID()}`,
        entityType: "ski_resort",
        fieldKey: "",
        canRead: false,
        canWrite: false,
      },
    ]);
  }

  async function saveAuthorization() {
    if (view.status !== "ready" || !canEdit) return;
    await commands.run(
      "authorize",
      async () =>
        buildAuthorizationBody(
          permissionIds,
          scopes,
          fieldPolicies,
          view.resources,
          view.role,
        ),
      async (body, signal) =>
        parseRoleAuthorization(
          await apiRequest<unknown>(`/admin/roles/${roleId}/permissions`, {
            method: "PUT",
            body,
            signal,
          }),
          roleId,
        ),
      () => {
        message.success("授权快照已保存");
        setAttempt((n) => n + 1);
      },
    );
  }

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div>
          <h1>角色授权</h1>
          {view.status === "ready" ? (
            <AdminParagraph className={styles.subtitle}>
              {view.role.roleName} <code>{view.role.roleKey}</code>
            </AdminParagraph>
          ) : null}
        </div>
        <Space wrap>
          <Link href={managedRoleDetailRoute(roleId)}>角色详情</Link>
          <Button
            disabled={saving}
            onClick={() => {
              if (!commands.gate.isRunning()) void retryRestore();
            }}
          >
            重新读取身份
          </Button>
          <Link href={routes.roles}>返回角色</Link>
          {view.status === "ready" && canEdit ? (
            <Button
              type="primary"
              onClick={() => void saveAuthorization()}
              loading={saving}
            >
              保存授权
            </Button>
          ) : null}
        </Space>
      </header>

      <RoleRecovery
        pending={commands.pending}
        saving={saving}
        reload={load}
        acknowledge={commands.acknowledge}
      />
      {view.status === "loading" ? (
        <div className={styles.loading} role="status">
          <Spin />
          <span>正在读取授权快照...</span>
        </div>
      ) : null}
      {view.status === "error" ? (
        <section className={styles.error} role="alert">
          <strong>{view.title}</strong>
          {view.traceId ? <code>traceId: {view.traceId}</code> : null}
          <Button
            disabled={saving || commands.pending}
            onClick={() => setAttempt((value) => value + 1)}
          >
            重试
          </Button>
        </section>
      ) : null}

      {view.status === "ready" ? (
        <>
          {view.role.roleKey === "system_admin" ? (
            <Typography.Paragraph type="secondary">
              系统管理员角色受保护，不能修改其授权快照。
            </Typography.Paragraph>
          ) : null}

          <section
            className={styles.section}
            aria-labelledby="permissions-title"
          >
            <div className={styles.sectionHeader}>
              <div>
                <h2 id="permissions-title">功能权限</h2>
                <AdminParagraph>
                  菜单、按钮与 API 权限均由后端按权限键执行。
                </AdminParagraph>
              </div>
              <Typography.Text type="secondary">
                已选 {permissionIds.length} 项
              </Typography.Text>
            </div>
            <Tree
              checkable
              checkStrictly
              defaultExpandAll
              disabled={!canEdit}
              checkedKeys={permissionIds}
              treeData={treeData}
              onCheck={(checked) => {
                if (!canEdit || commands.gate.isLocked()) return;
                const keys = Array.isArray(checked) ? checked : checked.checked;
                setPermissionIds((current) =>
                  reconcilePermissionSelection(
                    keys,
                    current,
                    knownPermissionIds,
                  ),
                );
              }}
            />
            {permissionIds
              .filter((id) => !knownPermissionIds.has(id))
              .map((id) => (
                <div key={id}>
                  <span>不在当前目录中的已授权编号：{id}</span>
                  <Button
                    disabled={!canEdit}
                    onClick={() => {
                      if (!commands.gate.isLocked())
                        setPermissionIds((current) =>
                          current.filter((value) => value !== id),
                        );
                    }}
                  >
                    移除此授权
                  </Button>
                </div>
              ))}
          </section>

          <section className={styles.section} aria-labelledby="scopes-title">
            <RoleResourceScopeEditor
              rows={scopes}
              catalog={view.resources}
              disabled={!canEdit}
              onChange={setScopes}
            />
          </section>

          <section className={styles.section} aria-labelledby="fields-title">
            <div className={styles.sectionHeader}>
              <div>
                <h2 id="fields-title">字段读写策略</h2>
                <AdminParagraph>
                  字段键及实体定义由服务端校验；读写策略按有效角色合并。
                </AdminParagraph>
              </div>
              <Button onClick={addFieldPolicy} disabled={!canEdit}>
                添加字段策略
              </Button>
            </div>
            {fieldPolicies.length === 0 ? (
              <AdminParagraph className={styles.empty}>
                未配置字段级策略。
              </AdminParagraph>
            ) : (
              <div className={styles.rows}>
                {fieldPolicies.map((policy, index) => (
                  <div className={styles.fieldRow} key={policy.localKey}>
                    <ControlHint
                      hint="必选，选择扩展字段所属的真实业务实体。"
                      fluid
                    >
                      <Select
                        aria-label={`实体类型 ${index + 1}`}
                        value={policy.entityType}
                        disabled={!canEdit}
                        onChange={(value: EntityType) =>
                          setFieldPolicies((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, entityType: value }
                                : item,
                            ),
                          )
                        }
                        options={entityTypes}
                      />
                    </ControlHint>
                    <ControlHint
                      hint="必填，填写该实体已存在的扩展字段键；可读、可写分别授权，保存时校验字段是否存在。"
                      fluid
                    >
                      <Input
                        aria-label={`字段键 ${index + 1}`}
                        placeholder="field_key"
                        value={policy.fieldKey}
                        disabled={!canEdit}
                        onChange={(event) =>
                          setFieldPolicies((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, fieldKey: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </ControlHint>
                    <Checkbox
                      checked={policy.canRead}
                      disabled={!canEdit}
                      onChange={(event) =>
                        setFieldPolicies((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, canRead: event.target.checked }
                              : item,
                          ),
                        )
                      }
                    >
                      可读
                    </Checkbox>
                    <Checkbox
                      checked={policy.canWrite}
                      disabled={!canEdit}
                      onChange={(event) =>
                        setFieldPolicies((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, canWrite: event.target.checked }
                              : item,
                          ),
                        )
                      }
                    >
                      可写
                    </Checkbox>
                    <Button
                      danger
                      type="text"
                      disabled={!canEdit}
                      onClick={() =>
                        setFieldPolicies((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      移除
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
