import { writeFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import {
  readDynamic as readModeratedDynamic,
  readDynamicPage as readModeratedDynamics,
  readCommentPage as readModeratedComments,
  prepareModeration,
  sendModeration,
} from "@/features/community/moderation-queries";
import {
  mutationFor,
  type ModerationTarget,
} from "@/features/community/moderation-model";
import type { components } from "@common/api-contracts/openapi";
import { apiRequest } from "@/platform/api";
import {
  readAdminAsset,
  readAssetInventory,
  prepareAssetDeletion,
  sendAssetDeletion,
} from "@/features/assets/asset-admin-queries";
import { getApiBaseUrl } from "@/platform/config";
import { login, logout, getCurrentUser } from "@/platform/auth/session";
import { createRoleBody } from "@/features/roles/role-form";
import {
  readCatalog,
  readCatalogDetail,
  parseCatalogNode,
} from "@/features/permissions/catalog-queries";
import {
  CatalogWriteGate,
  createCatalogBody,
  updateCatalogBody,
  flattenCatalog,
  parentCandidates,
  type CatalogNode,
  type CatalogForm,
} from "@/features/permissions/catalog-model";
import {
  readRolePage,
  readRoleDetail,
  readRoleAuthorization,
} from "@/features/roles/role-queries";
import {
  buildAuthorizationBody,
  type AuthorizationSnapshot,
} from "@/features/roles/authorization-form";
import type { AuthorizationResource } from "@/features/roles/role-resource-scopes";
import {
  readAccountRoleCatalog,
  readAccountTarget,
  readAccountPage,
  readAccountDetail,
} from "@/features/users/user-queries";
import { replaceAccountRoles } from "@/features/users/user-model";
import {
  readAuditPage,
  readAuditSummary,
  readAuditContent,
} from "@/features/ai-operations/audit-queries";
import {
  readRagPage,
  readRagSource,
  writeRagCommand,
  type RagRequest,
} from "@/features/ai-operations/rag-queries";
import {
  RagCommandSession,
  RagRecoveryLedger,
} from "@/features/ai-operations/rag-workflow";
import type { RagCommand } from "@/features/ai-operations/rag-model";
import {
  readKnowledge,
  readKnowledgePage,
  prepareKnowledgeSave,
  saveKnowledge,
  prepareKnowledgeCommand,
  sendKnowledgeCommand,
} from "@/features/project-knowledge/knowledge-queries";
import {
  KnowledgeWriteGate,
  KnowledgeRecoveryLedger,
} from "@/features/project-knowledge/knowledge-workflow";
import type {
  Knowledge,
  KnowledgeInput,
  KnowledgeCommand,
} from "@/features/project-knowledge/knowledge-model";
import {
  readEventPage,
  readEventTarget,
  prepareEventRetry,
  writeEventRetry,
} from "@/features/events/event-queries";
import {
  EventWriteGate,
  EventRecoveryLedger,
} from "@/features/events/event-workflow";
import { eventMutation } from "@/features/events/event-model";
import type { OutboxEvent } from "@/features/events/event-api";
import { readSummary } from "@/features/dashboard/summary-queries";
import type { DashboardSummary } from "@/features/dashboard/summary-response";
import { readMerchantDashboard } from "@/features/merchant-dashboard/dashboard-queries";
import type { DashboardFilters } from "@/features/merchant-dashboard/dashboard-model";
import { readMerchantRevenue } from "@/features/revenue/merchant-revenue-queries";
import {
  operationLogQuery,
  readOperationLogPage,
} from "@/features/operation-logs/operation-log-api";
import {
  readDictionaryPage,
  readDictionaryDetail,
} from "@/features/dictionaries/dictionary-queries";
import {
  saveDictionaryType,
  saveDictionaryItem,
  disableDictionary,
} from "@/features/dictionaries/dictionary-commands";
import { DictionaryWriteGate } from "@/features/dictionaries/dictionary-model";
import { DictionaryRecoveryLedger } from "@/features/dictionaries/dictionary-recovery";
import {
  readConfigPage,
  readConfigItem,
  prepareConfigSave,
  writeConfig,
  reviewConfigWrites,
} from "@/features/system-config/config-queries";
import {
  ConfigWriteGate,
  ConfigRecoveryLedger,
} from "@/features/system-config/config-workflow";
import {
  parseFieldReceipt,
  parseGroupReceipt,
} from "@/features/custom-fields/field-responses";
import {
  createFieldBody,
  groupBody,
} from "@/features/custom-fields/field-model";
import {
  readArticle,
  readArticlePage,
  readArticleForm,
  prepareArticleSave,
  saveManagedArticle,
  prepareArticleCommand,
  sendArticleCommand,
} from "@/features/articles/article-queries";
import type { ArticleInput } from "@/features/articles/article-model";
import {
  readFieldPage,
  readFieldGroups,
  readFieldDetail,
  readFieldGroupDetail,
} from "@/features/custom-fields/field-queries";
import {
  readResortPage,
  readResort,
  readResortForm,
  prepareResortSave,
  saveResort,
  prepareResortCommand,
  runResortCommand,
} from "@/features/merchant-resorts/resort-queries";
import {
  initialResortInput,
  type ResortSchema,
} from "@/features/merchant-resorts/resort-model";
import {
  readGlobalResort,
  readGlobalResortPage,
  prepareGlobalCommand,
  runGlobalCommand,
} from "@/features/admin-resorts/global-resort-api";
import {
  readGlobalResortForm,
  initialGlobalResortInput,
  prepareGlobalResortSave,
  saveGlobalResort,
} from "@/features/admin-resorts/global-resort-form-api";

// Only the cookie transport is adapted for Node; all HTTP/DTO/model functions are production code.
const api = new URL(getApiBaseUrl());
const fixture = JSON.parse(
  process.env.ADMIN_AUTH_HTTP_FIXTURE_JSON ?? "null",
) as {
  databaseName: string;
  adminAccount: string;
  audit: { activeId: string; deletedId: string; foreignId: string };
  retryEventId: string;
  assets: { ownId: string; removableId: string; foreignId: string };
  rag: {
    documentId: number;
    failedDocumentId: number;
    excludedDocumentId: number;
    projectKnowledgeId: number;
  };
  actors: Array<{
    userId: number;
    account: string;
    merchantId: number;
    resortId: number;
  }>;
};
const password = process.env.ADMIN_AUTH_HTTP_PASSWORD;
const resultPath = process.env.ADMIN_AUTH_HTTP_RESULT_PATH;
if (
  api.protocol !== "http:" ||
  api.hostname !== "127.0.0.1" ||
  api.pathname !== "/api/v1" ||
  api.username ||
  api.password ||
  api.search ||
  api.hash ||
  fixture?.databaseName !== "linji_admin_authorization_validation" ||
  fixture.adminAccount !== "admin_http_root" ||
  !Array.isArray(fixture.actors) ||
  !fixture.audit ||
  !fixture.rag ||
  typeof fixture.retryEventId !== "string" ||
  !/^[0-9a-f-]{36}$/.test(fixture.retryEventId) ||
  !Object.values(fixture.rag).every(
    (id) => Number.isSafeInteger(id) && id > 0,
  ) ||
  ![
    fixture.audit.activeId,
    fixture.audit.deletedId,
    fixture.audit.foreignId,
  ].every((id) => typeof id === "string" && /^[0-9a-f-]{36}$/.test(id)) ||
  fixture.actors.length !== 2 ||
  !fixture.actors.every(
    (actor) =>
      actor.account.startsWith("admin_http_operator_") &&
      [actor.userId, actor.merchantId, actor.resortId].every(
        (id) => Number.isSafeInteger(id) && id > 0,
      ),
  ) ||
  !password ||
  !resultPath
)
  throw new Error(
    "Explicit disposable loopback authorization API/fixture and synthetic credentials required",
  );

type User = components["schemas"]["CurrentUserVO"];
type Role = components["schemas"]["ManagedRoleVO"];
type Permission = components["schemas"]["PermissionNodeVO"];
interface Cookie {
  value: string;
  path: string;
}
const jars = {
  admin: new Map<string, Cookie>(),
  actor: new Map<string, Cookie>(),
};
let active: keyof typeof jars = "admin";
const originalFetch = globalThis.fetch;
const requests: Array<{
  actor: string;
  method: string;
  path: string;
  status: number;
  csrf: boolean;
  csrfRejected: boolean;
}> = [];
const rejectedTraceIds: string[] = [];
const rag = { eventIds: [] as string[], concurrentWinnerReason: "" };
const knowledge = { id: 0, firstPublishTime: "" };
const dashboard: {
  admin?: DashboardSummary;
  merchant?: DashboardSummary;
  portalOnly?: DashboardSummary;
} = {};
const summaryBaseGrants = ["management:portal:enter", "account:profile:read"];
const overviewGrants = [
  ...summaryBaseGrants,
  "merchant:dashboard:read",
  "resort:merchant:list",
  "revenue:merchant:list",
];
const overviewFilters: DashboardFilters = {
  fromDate: "2026-11-01",
  toDate: "2026-11-03",
  resortId: "",
  status: "draft",
};
const merchantOverview: {
  resortIds?: number[];
  amount?: string;
  recordResortIds?: number[];
  foreignDenied?: boolean;
  revocationRejected?: boolean;
  independentPanels?: boolean;
} = {};
const merchantRevenue: {
  amount?: string;
  total?: number;
  recordResortIds?: number[];
  emptyPage?: boolean;
  emptyRange?: boolean;
  foreignDenied?: boolean;
  revocationRejected?: boolean;
  scopeConflictDenied?: boolean;
} = {};
const revenueGrants = [...summaryBaseGrants, "revenue:merchant:list"];
const accountReads = {
  userId: 0,
  rawProjection: false,
  emptyPage: false,
  selfScope: false,
  foreignDenied: false,
  revocationRejected: false,
};
const roleReads = {
  rawProjection: false,
  emptyPage: false,
  selectedScope: false,
  foreignDenied: false,
  revocationRejected: false,
};
const articleReads = {
  managedId: 0,
  ownedId: 0,
  firstPublishTime: "",
  lifecycle: false,
  scopeRules: false,
  revocationRejected: false,
  deleted: false,
};
const resortReads = {
  resortId: 0,
  lifecycle: false,
  republished: false,
  scopeRules: false,
  revocationRejected: false,
  deleted: false,
};
const globalResortReads = {
  resortId: 0,
  lifecycle: false,
  reassigned: false,
  fieldsFiltered: false,
  scopeRejected: false,
  revocationRejected: false,
  deleted: false,
};
const communityReads = {
  dynamicId: 0,
  commentId: 0,
  published: false,
  reapproved: false,
  commentsModerated: false,
  revocationRejected: false,
  deleted: false,
};
const assetReads = {
  scopeIsolation: false,
  referencesProtected: false,
  deleted: false,
  revocationRejected: false,
};
const knowledgeReads = {
  rawProjection: false,
  emptyPage: false,
  sessionRevocationRejected: false,
  sessionRestored: false,
};
const dictionaryWrites = {
  rootId: 0,
  childId: 0,
  lifecycle: false,
  cycleRejected: false,
  revocationRejected: false,
};
const configChecks = {
  defaults: false,
  versionConflict: false,
  unknownRecovered: false,
  publicProjection: false,
  roleDenied: false,
  sessionRevocationRejected: false,
  sessionRestored: false,
};
const fieldReads = {
  fieldId: 0,
  lifecycle: false,
  staleRejected: false,
  groupProtected: false,
  revocationRejected: false,
};
const catalogReads = {
  rawProjection: false,
  customHierarchy: false,
  syncDenied: false,
  revocationRejected: false,
  ids: [] as number[],
};
let managedKnowledge: Knowledge;
let failedEvent: OutboxEvent;
const knowledgeValues: KnowledgeInput = {
  title: "HTTP知识联调草稿",
  content: "HTTP项目知识草稿正文，介绍滑雪服务。",
  category: "platform",
  sourceUrl: "https://example.com/ski-project",
};
let admin: User,
  actor: User,
  resources: AuthorizationResource[],
  readRole: Role,
  writeRole: Role,
  conflictRole: Role,
  dashboardRole: Role;
let completed = false;
let passed = 0;
function check(name: string, run: () => Promise<void>) {
  it(name, async () => {
    await run();
    passed++;
  });
}
const signal = () => AbortSignal.timeout(15000);
const [owner, other] = fixture.actors;
const call = <T>(
  path: string,
  options: Parameters<typeof apiRequest>[1] = {},
) => apiRequest<T>(path, { ...options, signal: signal(), cache: "no-store" });

async function denied(action: Promise<unknown>, status: number) {
  try {
    await action;
    throw new Error("Expected request denial");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    const failure = error as ApiError;
    expect(failure.status).toBe(status);
    expect(failure.traceId).toBeTruthy();
    rejectedTraceIds.push(failure.traceId!);
  }
}
async function bind(ids: number[]) {
  active = "admin";
  const catalog = await readAccountRoleCatalog(admin, signal());
  await call(`/admin/users/${owner!.userId}/roles`, {
    method: "PUT",
    body: replaceAccountRoles(ids, catalog, admin),
  });
}
async function saveManagedKnowledge(values: KnowledgeInput, item?: Knowledge) {
  const ledger = new KnowledgeRecoveryLedger();
  const gate = new KnowledgeWriteGate(
    admin,
    (signal) => apiRequest<User>("/auth/me", { signal, cache: "no-store" }),
    ledger,
    () => {},
  );
  gate.activate();
  let saved: Knowledge | undefined;
  try {
    const result = await gate.run(
      item
        ? { action: "update", projectKnowledgeId: item.projectKnowledgeId }
        : { action: "create", title: values.title },
      (signal) => prepareKnowledgeSave(apiRequest, admin, values, item, signal),
      (body, signal) =>
        saveKnowledge(apiRequest, item?.projectKnowledgeId, body, signal),
      (value) => {
        saved = value;
      },
    );
    expect(result.status).toBe("success");
    expect(ledger.entries(admin.userId)).toHaveLength(0);
    expect(saved).toBeDefined();
    return saved!;
  } finally {
    gate.dispose();
  }
}
async function commandManagedKnowledge(
  item: Knowledge,
  action: KnowledgeCommand,
) {
  const ledger = new KnowledgeRecoveryLedger();
  const gate = new KnowledgeWriteGate(
    admin,
    (signal) => apiRequest<User>("/auth/me", { signal, cache: "no-store" }),
    ledger,
    () => {},
  );
  gate.activate();
  let receipt: unknown;
  try {
    const result = await gate.run(
      { action, projectKnowledgeId: item.projectKnowledgeId },
      (signal) =>
        prepareKnowledgeCommand(
          apiRequest,
          admin,
          item.projectKnowledgeId,
          action,
          item.version,
          signal,
        ),
      (id, signal) => sendKnowledgeCommand(apiRequest, id, action, signal),
      (value) => {
        receipt = value;
      },
    );
    expect(result.status).toBe("success");
    expect(ledger.entries(admin.userId)).toHaveLength(0);
    if (action === "delete") {
      expect(receipt).toBeUndefined();
      return undefined;
    }
    const current = await readKnowledge(
      apiRequest,
      admin,
      item.projectKnowledgeId,
      signal(),
    );
    expect(receipt).toEqual(current);
    return current;
  } finally {
    gate.dispose();
  }
}
async function authorize(
  role: Role,
  keys: string[],
  scope: "merchant" | "all",
  read: boolean,
  write: boolean,
) {
  active = "admin";
  const previous = await call<AuthorizationSnapshot>(
    `/admin/roles/${role.roleId}/permissions`,
  );
  const tree = await call<Permission[]>("/admin/permissions/tree");
  const flat = (nodes: Permission[]): Permission[] =>
    nodes.flatMap((node) => [node, ...flat(node.children)]);
  const ids = keys.map((key) => {
    const p = flat(tree).find((p) => p.permissionKey === key);
    expect(p, key).toBeDefined();
    return p!.permissionId;
  });
  const body = buildAuthorizationBody(
    ids,
    [
      {
        localKey: "resort",
        resourceKey: "resort",
        scopeType: scope,
        selectedIds: "",
      },
      {
        localKey: "role",
        resourceKey: "role",
        scopeType: "all",
        selectedIds: "",
      },
      {
        localKey: "user",
        resourceKey: "user",
        scopeType: "self",
        selectedIds: "",
      },
    ],
    read || write
      ? [
          {
            localKey: "note",
            entityType: "ski_resort",
            fieldKey: "http_note",
            canRead: read,
            canWrite: write,
          },
        ]
      : [],
    resources,
    previous,
  );
  const saved = await call<AuthorizationSnapshot>(
    `/admin/roles/${role.roleId}/permissions`,
    { method: "PUT", body },
  );
  expect(saved.permissionIds).toEqual(body.permissionIds);
  expect(saved.dataScopes).toEqual(
    [...body.dataScopes].sort((a, b) =>
      a.resourceKey.localeCompare(b.resourceKey),
    ),
  );
  expect(saved.fieldPolicies).toEqual(body.fieldPolicies);
  return saved;
}
async function articleAccess(
  scope: "all" | "self" | "selected",
  ids: number[] = [],
) {
  const previous = await authorize(
    dashboardRole,
    [...summaryBaseGrants, "system:dict:list", "content:article:manage"],
    "merchant",
    false,
    false,
  );
  const body = buildAuthorizationBody(
    previous.permissionIds,
    [
      {
        localKey: "article",
        resourceKey: "article",
        scopeType: scope,
        selectedIds: ids.join(","),
      },
    ],
    [],
    resources,
    previous,
  );
  await call(`/admin/roles/${dashboardRole.roleId}/permissions`, {
    method: "PUT",
    body,
  });
  await bind([dashboardRole.roleId]);
  active = "actor";
  return getCurrentUser();
}
const resortLifecycleGrants = [
  ...summaryBaseGrants,
  "system:dict:list",
  ...["list", "create", "update", "delete", "submit-review"].map(
    (action) => `resort:merchant:${action}`,
  ),
];
async function resortAccess() {
  await authorize(dashboardRole, resortLifecycleGrants, "merchant", true, true);
  await bind([dashboardRole.roleId]);
  active = "actor";
  return getCurrentUser();
}
const globalResortGrants = [
  ...summaryBaseGrants,
  "system:dict:list",
  ...[
    "list-all",
    "create-all",
    "update-all",
    "delete-all",
    "publish",
    "offline",
  ].map((action) => `content:resort:${action}`),
];
async function globalResortAccess(scope: "all" | "merchant" = "all") {
  await authorize(dashboardRole, globalResortGrants, scope, true, true);
  await bind([dashboardRole.roleId]);
  active = "actor";
  return getCurrentUser();
}
const communityGrants = [
  ...summaryBaseGrants,
  "content:dynamic:moderate",
  "community:dynamic:create",
  "community:dynamic:update-own",
  "community:comment:create",
];
async function communityAccess() {
  await authorize(dashboardRole, communityGrants, "all", false, false);
  await bind([dashboardRole.roleId]);
  active = "actor";
  return getCurrentUser();
}
async function assetAccess(
  scope: "all" | "self" | "selected" | "merchant",
  ids: string[] = [],
) {
  const previous = await authorize(
    dashboardRole,
    [
      ...summaryBaseGrants,
      "content:asset:list",
      "content:asset:delete",
      "account:profile:update",
    ],
    "all",
    false,
    false,
  );
  const body = buildAuthorizationBody(
    previous.permissionIds,
    [
      {
        localKey: "asset",
        resourceKey: "asset",
        scopeType: scope,
        selectedIds: ids.join(","),
      },
    ],
    [],
    resources,
    previous,
  );
  await call(`/admin/roles/${dashboardRole.roleId}/permissions`, {
    method: "PUT",
    body,
  });
  await bind([dashboardRole.roleId]);
  active = "actor";
  return getCurrentUser();
}
async function moderate(
  current: User,
  target: ModerationTarget,
  reason: string,
) {
  const body = await prepareModeration(
    apiRequest,
    current,
    target,
    reason,
    signal(),
  );
  await sendModeration(apiRequest, mutationFor(target), body, signal());
}
beforeAll(async () => {
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== api.origin || !url.pathname.startsWith("/api/v1/"))
      throw new Error("HTTP harness only accepts its disposable API");
    const jar = jars[active];
    const identity = active;
    const headers = new Headers(init.headers);
    expect(init.credentials).toBe("include");
    headers.set("Origin", "http://127.0.0.1:3001");
    const cookies = [...jar].filter(
      ([, cookie]) =>
        url.pathname === cookie.path ||
        url.pathname.startsWith(
          cookie.path.endsWith("/") ? cookie.path : `${cookie.path}/`,
        ),
    );
    if (cookies.length)
      headers.set(
        "Cookie",
        cookies.map(([name, cookie]) => `${name}=${cookie.value}`).join("; "),
      );
    const response = await originalFetch(url, {
      ...init,
      headers,
      redirect: "error",
      signal: init.signal ?? signal(),
    });
    for (const raw of response.headers.getSetCookie()) {
      const [pair, ...attributes] = raw.split(";");
      const index = pair!.indexOf("=");
      const name = pair!.slice(0, index),
        value = pair!.slice(index + 1);
      const path =
        attributes
          .find((attribute) =>
            attribute.trim().toLowerCase().startsWith("path="),
          )
          ?.trim()
          .slice(5) ?? "/";
      if (
        !value ||
        attributes.some((attribute) => /^\s*max-age=0\s*$/i.test(attribute))
      )
        jar.delete(name);
      else jar.set(name, { value, path });
      if (["linji_access", "linji_refresh"].includes(name) && value) {
        expect(/; HttpOnly/i.test(raw)).toBe(true);
        expect(/; Secure/i.test(raw)).toBe(true);
        expect(/; SameSite=Lax/i.test(raw)).toBe(true);
      }
    }
    requests.push({
      actor: identity,
      path: url.pathname,
      method: init.method ?? "GET",
      status: response.status,
      csrf: headers.has("X-CSRF-Token"),
      csrfRejected:
        response.status === 403 &&
        ((await response.clone().json()) as { msg?: unknown }).msg ===
          "CSRF validation failed",
    });
    return response;
  };
  admin = await login({ account: fixture.adminAccount, password: password! });
  expect(admin.roles.map((role) => role.roleKey)).toEqual(["system_admin"]);
  resources = await call<AuthorizationResource[]>(
    "/admin/authorization/resources",
  );
  const create = (suffix: string) =>
    call<Role>("/admin/roles", {
      method: "POST",
      body: createRoleBody(
        {
          roleKey: `http_auth_${suffix}`,
          roleName: `联调角色${suffix}`,
          dataScope: "merchant",
          status: "active",
        },
        true,
      ),
    });
  readRole = await create("read");
  writeRole = await create("write");
  conflictRole = await create("conflict");
  dashboardRole = await create("dashboard");
  await authorize(dashboardRole, summaryBaseGrants, "merchant", false, false);
  await authorize(
    readRole,
    [
      "management:portal:enter",
      "resort:merchant:list",
      "account:profile:read",
      "system:dict:list",
      "system:role:list",
      "system:role:update",
      "system:permission:assign",
      "system:ai-conversation:list",
      "system:ai-conversation:read-content",
      "ai:knowledge:list",
      "ai:knowledge:reindex",
      "ai:knowledge:disable",
      ...["list", "create", "update", "publish", "withdraw", "delete"].map(
        (action) => `content:project-knowledge:${action}`,
      ),
      "system:event:list",
      "system:event:retry",
    ],
    "merchant",
    true,
    false,
  );
  await authorize(
    writeRole,
    [
      "management:portal:enter",
      "resort:merchant:list",
      "resort:merchant:update",
    ],
    "merchant",
    false,
    true,
  );
  await authorize(
    conflictRole,
    ["management:portal:enter", "resort:merchant:list"],
    "all",
    false,
    false,
  );
  await bind([readRole.roleId, writeRole.roleId]);
  active = "actor";
  actor = await login({ account: owner!.account, password: password! });
});
afterAll(async () => {
  completed = passed === 77;
  try {
    for (const name of ["actor", "admin"] as const) {
      active = name;
      if (jars[name].has("linji_access") || jars[name].has("linji_refresh"))
        await logout();
      expect(jars[name].has("linji_access")).toBe(false);
      expect(jars[name].has("linji_refresh")).toBe(false);
    }
    await writeFile(
      resultPath!,
      JSON.stringify(
        {
          completed,
          rejectedTraceIds,
          readRoleId: readRole?.roleId,
          writeRoleId: writeRole?.roleId,
          conflictRoleId: conflictRole?.roleId,
          rag,
          knowledge,
          dashboard,
          merchantOverview,
          merchantRevenue,
          accountReads,
          roleReads,
          catalogReads,
          fieldReads,
          articleReads,
          resortReads,
          globalResortReads,
          communityReads,
          assetReads,
          knowledgeReads,
          dictionaryWrites,
          configChecks,
          requests,
        },
        null,
        2,
      ),
      { flag: "wx" },
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const jar of Object.values(jars)) jar.clear();
  }
});

describe.sequential(
  "Admin production models / compiled Nest / PostgreSQL authorization workflow",
  () => {
    check(
      "reads complete account projections and a later empty page from the actual backend",
      async () => {
        active = "admin";
        const page = await readAccountPage(
          admin,
          1,
          owner!.account,
          "active",
          signal(),
        );
        expect(page.total).toBe(1);
        expect(page.items.map((item) => item.userId)).toEqual([owner!.userId]);
        const detail = await readAccountDetail(admin, owner!.userId, signal());
        expect(detail).toEqual(page.items[0]);
        expect(detail.merchant).toMatchObject({
          merchantId: owner!.merchantId,
          status: "active",
        });
        const raw = await call<Record<string, unknown>>(
          `/admin/users/${owner!.userId}`,
        );
        expect(Object.keys(raw).sort()).toEqual(
          [
            "userId",
            "account",
            "nickname",
            "status",
            "roles",
            "merchant",
            "createdAt",
          ].sort(),
        );
        expect(JSON.stringify(raw)).not.toMatch(
          /passwordHash|refreshToken|contactPhone|dataScopes/,
        );
        const empty = await readAccountPage(
          admin,
          2,
          owner!.account,
          "active",
          signal(),
        );
        expect(empty).toEqual({
          page: 2,
          pageSize: 20,
          total: 1,
          hasNext: false,
          items: [],
        });
        accountReads.userId = detail.userId;
        accountReads.rawProjection = true;
        accountReads.emptyPage = true;
        active = "actor";
      },
    );
    check(
      "applies a custom role user self scope and rejects a different merchant account",
      async () => {
        try {
          await authorize(
            dashboardRole,
            [...summaryBaseGrants, "system:user:list"],
            "merchant",
            false,
            false,
          );
          await bind([dashboardRole.roleId]);
          active = "actor";
          const current = await getCurrentUser();
          const page = await readAccountPage(
            current,
            1,
            "",
            undefined,
            signal(),
          );
          expect(page.total).toBe(1);
          expect(page.items.map((item) => item.userId)).toEqual([
            owner!.userId,
          ]);
          expect(
            await readAccountDetail(current, owner!.userId, signal()),
          ).toEqual(page.items[0]);
          await denied(
            readAccountDetail(current, other!.userId, signal()),
            404,
          );
          accountReads.selfScope = true;
          accountReads.foreignDenied = true;
        } finally {
          await bind([readRole.roleId, writeRole.roleId]);
          active = "actor";
          actor = await getCurrentUser();
        }
      },
    );
    check(
      "rejects account detail when real user-list permission is revoked during the read",
      async () => {
        const transport = globalThis.fetch;
        try {
          await authorize(
            dashboardRole,
            [...summaryBaseGrants, "system:user:list"],
            "merchant",
            false,
            false,
          );
          await bind([dashboardRole.roleId]);
          active = "actor";
          const current = await getCurrentUser();
          let revoked = false;
          globalThis.fetch = async (input, init) => {
            const response = await transport(input, init);
            const url = new URL(
              input instanceof Request ? input.url : String(input),
            );
            if (
              !revoked &&
              url.pathname === `/api/v1/admin/users/${owner!.userId}`
            ) {
              revoked = true;
              await authorize(
                dashboardRole,
                summaryBaseGrants,
                "merchant",
                false,
                false,
              );
              active = "actor";
            }
            return response;
          };
          await expect(
            readAccountDetail(current, owner!.userId, signal()),
          ).rejects.toThrow("变化");
          expect(revoked).toBe(true);
          accountReads.revocationRejected = true;
        } finally {
          globalThis.fetch = transport;
          await bind([readRole.roleId, writeRole.roleId]);
          active = "actor";
          actor = await getCurrentUser();
        }
      },
    );
    check(
      "reads complete roles and authorization projections and later empty role page",
      async () => {
        active = "admin";
        const page = await readRolePage(
          admin,
          1,
          readRole.roleKey,
          "active",
          signal(),
        );
        expect(page.items.map((r) => r.roleId)).toEqual([readRole.roleId]);
        const detail = await readRoleDetail(admin, readRole.roleId, signal());
        expect(detail).toEqual(page.items[0]);
        const raw = await call<Record<string, unknown>>(
          `/admin/roles/${readRole.roleId}`,
        );
        expect(Object.keys(raw).sort()).toEqual(
          [
            "roleId",
            "roleKey",
            "roleName",
            "description",
            "dataScope",
            "status",
            "userCount",
            "permissionCount",
            "fieldPolicyCount",
            "dataScopes",
          ].sort(),
        );
        expect(detail).toEqual(raw);
        const bundle = await readRoleAuthorization(
          admin,
          readRole.roleId,
          signal(),
        );
        expect(bundle.role).toEqual(
          await call(`/admin/roles/${readRole.roleId}/permissions`),
        );
        expect(bundle.permissions).toEqual(
          await call("/admin/permissions/tree"),
        );
        expect(bundle.resources).toEqual(resources);
        expect(bundle.role.fieldPolicies).toEqual([
          {
            entityType: "ski_resort",
            fieldKey: "http_note",
            canRead: true,
            canWrite: false,
          },
        ]);
        expect(
          await readRolePage(admin, 2, readRole.roleKey, "active", signal()),
        ).toEqual({
          page: 2,
          pageSize: 20,
          total: 1,
          hasNext: false,
          items: [],
        });
        roleReads.rawProjection = true;
        roleReads.emptyPage = true;
        active = "actor";
      },
    );
    check(
      "applies configurable selected role scope and refuses a role outside it",
      async () => {
        try {
          await authorize(
            dashboardRole,
            [...summaryBaseGrants, "system:role:list"],
            "merchant",
            false,
            false,
          );
          active = "admin";
          const before = await call<AuthorizationSnapshot>(
            `/admin/roles/${dashboardRole.roleId}/permissions`,
          );
          await call(`/admin/roles/${dashboardRole.roleId}/permissions`, {
            method: "PUT",
            body: {
              permissionIds: before.permissionIds,
              dataScopes: [
                {
                  resourceKey: "role",
                  scopeType: "selected",
                  selectedIds: [readRole.roleId],
                },
              ],
              fieldPolicies: [],
            },
          });
          await bind([dashboardRole.roleId]);
          active = "actor";
          const current = await getCurrentUser();
          const page = await readRolePage(current, 1, "", "active", signal());
          expect(page.total).toBe(1);
          expect(page.items.map((r) => r.roleId)).toEqual([readRole.roleId]);
          expect(
            await readRoleDetail(current, readRole.roleId, signal()),
          ).toEqual(page.items[0]);
          await denied(
            readRoleDetail(current, writeRole.roleId, signal()),
            403,
          );
          roleReads.selectedScope = true;
          roleReads.foreignDenied = true;
        } finally {
          await bind([readRole.roleId, writeRole.roleId]);
          active = "actor";
          actor = await getCurrentUser();
        }
      },
    );
    check(
      "rejects role detail when the real list grant changes during the read",
      async () => {
        const transport = globalThis.fetch;
        try {
          await authorize(
            dashboardRole,
            [...summaryBaseGrants, "system:role:list"],
            "merchant",
            false,
            false,
          );
          await bind([dashboardRole.roleId]);
          active = "actor";
          const current = await getCurrentUser();
          let revoked = false;
          globalThis.fetch = async (input, init) => {
            const response = await transport(input, init);
            const url = new URL(
              input instanceof Request ? input.url : String(input),
            );
            if (
              !revoked &&
              url.pathname === `/api/v1/admin/roles/${readRole.roleId}`
            ) {
              revoked = true;
              await authorize(
                dashboardRole,
                summaryBaseGrants,
                "merchant",
                false,
                false,
              );
              active = "actor";
            }
            return response;
          };
          await expect(
            readRoleDetail(current, readRole.roleId, signal()),
          ).rejects.toThrow("变化");
          expect(revoked).toBe(true);
          roleReads.revocationRejected = true;
        } finally {
          globalThis.fetch = transport;
          await bind([readRole.roleId, writeRole.roleId]);
          active = "actor";
          actor = await getCurrentUser();
        }
      },
    );
    check(
      "reads a merchant revenue page and later empty page through the production reader without a dashboard grant",
      async () => {
        try {
          await authorize(
            dashboardRole,
            revenueGrants,
            "merchant",
            false,
            false,
          );
          await bind([dashboardRole.roleId]);
          active = "actor";
          const current = await getCurrentUser();
          expect(current.permissionKeys).not.toContain(
            "merchant:dashboard:read",
          );
          const data = await readMerchantRevenue(
            apiRequest,
            current,
            overviewFilters,
            1,
            1,
            signal(),
          );
          expect(data.records.total).toBe(1);
          expect(data.records.items.map((item) => item.resortId)).toEqual([
            owner!.resortId,
          ]);
          expect(data.records.items[0]).toMatchObject({
            revenueAmount: "123.45",
            source: "manual",
            note: "合成工作台联调数据",
            createdBy: { userId: admin.userId, nickname: admin.nickname },
          });
          expect(data.summary.totalAmount).toBe("123.45");
          expect(JSON.stringify(data)).not.toContain("678.90");
          const next = await readMerchantRevenue(
            apiRequest,
            current,
            overviewFilters,
            2,
            1,
            signal(),
          );
          expect(next.records).toEqual({
            page: 2,
            pageSize: 1,
            total: 1,
            hasNext: false,
            items: [],
          });
          expect(next.summary).toEqual(data.summary);
          merchantRevenue.amount = data.summary.totalAmount;
          merchantRevenue.total = data.records.total;
          merchantRevenue.recordResortIds = data.records.items.map(
            (item) => item.resortId,
          );
          merchantRevenue.emptyPage = true;
        } finally {
          await bind([readRole.roleId, writeRole.roleId]);
          active = "actor";
          actor = await getCurrentUser();
        }
      },
    );
    check(
      "rejects another merchant resort and applies an empty date range without retaining old revenue",
      async () => {
        try {
          await authorize(
            dashboardRole,
            revenueGrants,
            "merchant",
            false,
            false,
          );
          await bind([dashboardRole.roleId]);
          active = "actor";
          const current = await getCurrentUser();
          await denied(
            readMerchantRevenue(
              apiRequest,
              current,
              {
                ...overviewFilters,
                resortId: String(fixture.actors[1]!.resortId),
              },
              1,
              20,
              signal(),
            ),
            404,
          );
          const empty = await readMerchantRevenue(
            apiRequest,
            current,
            {
              ...overviewFilters,
              fromDate: "2026-10-01",
              toDate: "2026-10-02",
            },
            1,
            20,
            signal(),
          );
          expect(empty.records).toMatchObject({ items: [], total: 0 });
          expect(empty.summary).toMatchObject({
            totalAmount: "0.00",
            daily: [],
          });
          merchantRevenue.foreignDenied = true;
          merchantRevenue.emptyRange = true;
        } finally {
          await bind([readRole.roleId, writeRole.roleId]);
          active = "actor";
          actor = await getCurrentUser();
        }
      },
    );
    check(
      "refuses actual role revocation observed after both revenue responses",
      async () => {
        try {
          await authorize(
            dashboardRole,
            revenueGrants,
            "merchant",
            false,
            false,
          );
          await bind([dashboardRole.roleId]);
          active = "actor";
          const current = await getCurrentUser();
          let business = 0;
          const request: typeof apiRequest = async <T>(
            path: string,
            options?: Parameters<typeof apiRequest>[1],
          ) => {
            const value = await apiRequest<T>(path, options);
            if (path.startsWith("/merchant/revenue") && ++business === 2) {
              await authorize(
                dashboardRole,
                summaryBaseGrants,
                "merchant",
                false,
                false,
              );
              active = "actor";
            }
            return value;
          };
          await expect(
            readMerchantRevenue(
              request,
              current,
              overviewFilters,
              1,
              20,
              signal(),
            ),
          ).rejects.toThrow("变化");
          expect(business).toBe(2);
          merchantRevenue.revocationRejected = true;
        } finally {
          await bind([readRole.roleId, writeRole.roleId]);
          active = "actor";
          actor = await getCurrentUser();
        }
      },
    );
    check(
      "rejects conflicting revenue resource scopes rather than broadening the current merchant",
      async () => {
        try {
          await authorize(
            dashboardRole,
            revenueGrants,
            "merchant",
            false,
            false,
          );
          await authorize(
            conflictRole,
            [
              "management:portal:enter",
              "resort:merchant:list",
              "revenue:merchant:list",
            ],
            "all",
            false,
            false,
          );
          await bind([dashboardRole.roleId, conflictRole.roleId]);
          active = "actor";
          await denied(
            readMerchantRevenue(
              apiRequest,
              await getCurrentUser(),
              overviewFilters,
              1,
              20,
              signal(),
            ),
            403,
          );
          merchantRevenue.scopeConflictDenied = true;
        } finally {
          await authorize(
            conflictRole,
            ["management:portal:enter", "resort:merchant:list"],
            "all",
            false,
            false,
          );
          await bind([readRole.roleId, writeRole.roleId]);
          active = "actor";
          actor = await getCurrentUser();
        }
      },
    );
    check(
      "reads merchant overview through production projections with exact own-only revenue",
      async () => {
        try {
          await authorize(
            dashboardRole,
            overviewGrants,
            "merchant",
            false,
            false,
          );
          await bind([dashboardRole.roleId]);
          active = "actor";
          const current = await getCurrentUser();
          const data = await readMerchantDashboard(
            apiRequest,
            current,
            overviewFilters,
            signal(),
          );
          expect(data.resorts.status).toBe("ready");
          expect(data.revenue.status).toBe("ready");
          if (
            data.resorts.status !== "ready" ||
            data.revenue.status !== "ready"
          )
            throw new Error("Missing overview panels");
          expect(data.resorts.data.total).toBe(1);
          expect(data.resorts.data.items.map((item) => item.resortId)).toEqual([
            owner!.resortId,
          ]);
          expect(Object.keys(data.resorts.data.items[0]!).sort()).toEqual(
            [
              "resortId",
              "name",
              "province",
              "city",
              "district",
              "status",
              "updatedAt",
            ].sort(),
          );
          expect(data.revenue.data.summary.totalAmount).toBe("123.45");
          expect(
            data.revenue.data.records.items.map((item) => item.resortId),
          ).toEqual([owner!.resortId]);
          expect(JSON.stringify(data)).not.toContain("678.90");
          merchantOverview.resortIds = data.resorts.data.items.map(
            (item) => item.resortId,
          );
          merchantOverview.amount = data.revenue.data.summary.totalAmount;
          merchantOverview.recordResortIds =
            data.revenue.data.records.items.map((item) => item.resortId);
        } finally {
          await bind([readRole.roleId, writeRole.roleId]);
          active = "actor";
          actor = await getCurrentUser();
        }
      },
    );
    check(
      "isolates foreign resort revenue as a local panel denial while retaining the own resort list",
      async () => {
        try {
          await authorize(
            dashboardRole,
            overviewGrants,
            "merchant",
            false,
            false,
          );
          await bind([dashboardRole.roleId]);
          active = "actor";
          const request: typeof apiRequest = async <T>(
            path: string,
            options?: Parameters<typeof apiRequest>[1],
          ) => {
            try {
              return await apiRequest<T>(path, options);
            } catch (cause) {
              if (cause instanceof ApiError && cause.traceId)
                rejectedTraceIds.push(cause.traceId);
              throw cause;
            }
          };
          const data = await readMerchantDashboard(
            request,
            await getCurrentUser(),
            {
              ...overviewFilters,
              resortId: String(fixture.actors[1]!.resortId),
            },
            signal(),
          );
          expect(data.resorts.status).toBe("ready");
          expect(data.revenue).toMatchObject({
            status: "error",
            message: "指定雪场不存在或不属于当前可见范围",
          });
          expect(JSON.stringify(data)).not.toContain("678.90");
          merchantOverview.foreignDenied = true;
        } finally {
          await bind([readRole.roleId, writeRole.roleId]);
          active = "actor";
          actor = await getCurrentUser();
        }
      },
    );
    check(
      "independently gates merchant overview panels using configurable grants",
      async () => {
        try {
          for (const resource of [
            "resort:merchant:list",
            "revenue:merchant:list",
          ]) {
            await authorize(
              dashboardRole,
              [...summaryBaseGrants, "merchant:dashboard:read", resource],
              "merchant",
              false,
              false,
            );
            await bind([dashboardRole.roleId]);
            active = "actor";
            const data = await readMerchantDashboard(
              apiRequest,
              await getCurrentUser(),
              overviewFilters,
              signal(),
            );
            expect(data.resorts.status).toBe(
              resource.startsWith("resort:") ? "ready" : "blocked",
            );
            expect(data.revenue.status).toBe(
              resource.startsWith("revenue:") ? "ready" : "blocked",
            );
          }
          merchantOverview.independentPanels = true;
        } finally {
          await bind([readRole.roleId, writeRole.roleId]);
          active = "actor";
          actor = await getCurrentUser();
        }
      },
    );
    check(
      "rejects actual grant revocation before the merchant overview final identity read",
      async () => {
        try {
          await authorize(
            dashboardRole,
            overviewGrants,
            "merchant",
            false,
            false,
          );
          await bind([dashboardRole.roleId]);
          active = "actor";
          const current = await getCurrentUser();
          let businessReads = 0;
          const request: typeof apiRequest = async <T>(
            path: string,
            options?: Parameters<typeof apiRequest>[1],
          ) => {
            const value = await apiRequest<T>(path, options);
            if (path.startsWith("/merchant/") && ++businessReads === 3) {
              await authorize(
                dashboardRole,
                [...summaryBaseGrants, "merchant:dashboard:read"],
                "merchant",
                false,
                false,
              );
              active = "actor";
            }
            return value;
          };
          await expect(
            readMerchantDashboard(request, current, overviewFilters, signal()),
          ).rejects.toThrow("身份");
          expect(businessReads).toBe(3);
          merchantOverview.revocationRejected = true;
        } finally {
          await bind([readRole.roleId, writeRole.roleId]);
          active = "actor";
          actor = await getCurrentUser();
        }
      },
    );
    check(
      "reads all seven system administrator panels through the production summary reader",
      async () => {
        active = "admin";
        const data = await readSummary(apiRequest, admin, signal());
        expect(data.users).toEqual({ total: 3, active: 3, disabled: 0 });
        expect(data.merchants).toEqual({ total: 2, active: 2, disabled: 0 });
        expect(data.resorts).toEqual({
          total: 2,
          draft: 2,
          pendingReview: 0,
          published: 0,
          offline: 0,
        });
        expect(data.articles).toEqual({
          total: 0,
          draft: 0,
          published: 0,
          withdrawn: 0,
        });
        expect(data.dynamics).toEqual({
          total: 0,
          pending: 0,
          published: 0,
          hidden: 0,
        });
        expect(data.rag).toEqual({ failed: 1 });
        expect(data.revenue).toEqual({
          amount: "802.35",
          currency: "CNY",
          period: "all-time",
          scope: "all",
        });
        dashboard.admin = data;
      },
    );
    check(
      "returns null business panels with only portal and self-profile access",
      async () => {
        try {
          await bind([dashboardRole.roleId]);
          active = "actor";
          const current = await getCurrentUser();
          dashboard.portalOnly = await readSummary(
            apiRequest,
            current,
            signal(),
          );
          for (const [key, value] of Object.entries(dashboard.portalOnly))
            if (key !== "generatedAt") expect(value).toBeNull();
        } finally {
          await bind([readRole.roleId, writeRole.roleId]);
          active = "actor";
          actor = await getCurrentUser();
        }
      },
    );
    check(
      "isolates merchant totals and rejects the same session after grants are revoked during the summary read",
      async () => {
        try {
          await authorize(
            dashboardRole,
            [
              ...summaryBaseGrants,
              "system:user:list",
              "resort:merchant:list",
              "revenue:merchant:list",
              "revenue:system:summary",
              "ai:knowledge:list",
            ],
            "merchant",
            false,
            false,
          );
          await bind([dashboardRole.roleId]);
          active = "actor";
          const current = await getCurrentUser();
          const data = await readSummary(apiRequest, current, signal());
          expect(data.users).toEqual({ total: 1, active: 1, disabled: 0 });
          expect(data.merchants).toEqual({ total: 1, active: 1, disabled: 0 });
          expect(data.resorts).toEqual({
            total: 1,
            draft: 1,
            pendingReview: 0,
            published: 0,
            offline: 0,
          });
          expect(data.rag).toBeNull();
          expect(data.articles).toBeNull();
          expect(data.dynamics).toBeNull();
          expect(data.revenue).toEqual({
            amount: "123.45",
            currency: "CNY",
            period: "all-time",
            scope: "merchant",
          });
          dashboard.merchant = data;
          const revokingRequest: typeof apiRequest = async <T>(
            path: string,
            options?: Parameters<typeof apiRequest>[1],
          ) => {
            const value = await apiRequest<T>(path, options);
            if (path === "/admin/dashboard/summary") {
              await authorize(
                dashboardRole,
                summaryBaseGrants,
                "merchant",
                false,
                false,
              );
              active = "actor";
            }
            return value;
          };
          await expect(
            readSummary(revokingRequest, current, signal()),
          ).rejects.toThrow("身份");
          const after = await readSummary(
            apiRequest,
            await getCurrentUser(),
            signal(),
          );
          for (const [key, value] of Object.entries(after))
            if (key !== "generatedAt") expect(value).toBeNull();
        } finally {
          await bind([readRole.roleId, writeRole.roleId]);
          active = "actor";
          actor = await getCurrentUser();
        }
      },
    );
    check(
      "rejects conflicting summary resource scopes without broadening the merchant panel",
      async () => {
        try {
          await bind([readRole.roleId, writeRole.roleId, conflictRole.roleId]);
          active = "actor";
          await denied(
            readSummary(apiRequest, await getCurrentUser(), signal()),
            403,
          );
        } finally {
          await bind([readRole.roleId, writeRole.roleId]);
          active = "actor";
          actor = await getCurrentUser();
        }
      },
    );
    check(
      "rejects all project knowledge operations for a configurable role holding every content grant",
      async () => {
        active = "actor";
        const current = await getCurrentUser();
        expect(current.permissionKeys).toEqual(
          expect.arrayContaining(
            ["list", "create", "update", "publish", "withdraw", "delete"].map(
              (action) => `content:project-knowledge:${action}`,
            ),
          ),
        );
        const path = `/admin/project-knowledge/${fixture.rag.projectKnowledgeId}`;
        await denied(call("/admin/project-knowledge"), 403);
        await denied(call(path), 403);
        await denied(
          call("/admin/project-knowledge", {
            method: "POST",
            body: knowledgeValues,
          }),
          403,
        );
        await denied(
          call(path, {
            method: "PATCH",
            body: { ...knowledgeValues, version: 1 },
          }),
          403,
        );
        await denied(call(`${path}/publish`, { method: "PATCH" }), 403);
        await denied(call(`${path}/withdraw`, { method: "PATCH" }), 403);
        await denied(call(path, { method: "DELETE" }), 403);
      },
    );
    check(
      "creates a project knowledge draft using the production form/gate and reads exact filtered DTOs",
      async () => {
        active = "admin";
        await denied(
          call("/admin/project-knowledge", {
            method: "POST",
            body: { ...knowledgeValues, status: "published" },
          }),
          400,
        );
        await denied(
          call("/admin/project-knowledge", {
            method: "POST",
            body: { ...knowledgeValues, content: "<script>alert(1)</script>" },
          }),
          422,
        );
        await denied(
          call("/admin/project-knowledge", {
            method: "POST",
            body: {
              ...knowledgeValues,
              sourceUrl: "https://operator:credential@example.com/ski",
            },
          }),
          422,
        );
        managedKnowledge = await saveManagedKnowledge(knowledgeValues);
        knowledge.id = managedKnowledge.projectKnowledgeId;
        expect(managedKnowledge).toMatchObject({
          ...knowledgeValues,
          status: "draft",
          version: 1,
          publishTime: null,
        });
        const detail = await readKnowledge(
          apiRequest,
          admin,
          knowledge.id,
          signal(),
        );
        expect(detail).toEqual(managedKnowledge);
        expect(Object.keys(detail).sort()).toEqual(
          [
            "projectKnowledgeId",
            "title",
            "content",
            "category",
            "sourceUrl",
            "status",
            "publishTime",
            "version",
            "createTime",
            "updateTime",
          ].sort(),
        );
        const page = await readKnowledgePage(
          apiRequest,
          admin,
          { page: 1, keyword: "  http知识联调草稿  ", status: "draft" },
          signal(),
        );
        expect(page).toMatchObject({
          page: 1,
          pageSize: 20,
          total: 1,
          hasNext: false,
        });
        expect(page.items).toEqual([managedKnowledge]);
      },
    );
    check(
      "updates and publishes knowledge, retains publication when edited, and rejects stale versions without another write",
      async () => {
        active = "admin";
        const old = managedKnowledge;
        managedKnowledge = await saveManagedKnowledge(
          {
            ...knowledgeValues,
            title: "HTTP知识联调定版",
            content: "HTTP项目知识草稿修订正文，介绍滑雪服务。",
          },
          old,
        );
        expect(managedKnowledge).toMatchObject({
          version: 2,
          status: "draft",
          publishTime: null,
        });
        managedKnowledge = (await commandManagedKnowledge(
          managedKnowledge,
          "publish",
        ))!;
        expect(managedKnowledge).toMatchObject({
          version: 3,
          status: "published",
        });
        expect(managedKnowledge.publishTime).not.toBeNull();
        knowledge.firstPublishTime = managedKnowledge.publishTime!;
        await denied(
          call(`/admin/project-knowledge/${knowledge.id}/publish`, {
            method: "PATCH",
          }),
          409,
        );
        managedKnowledge = await saveManagedKnowledge(
          {
            title: "HTTP知识联调定版",
            content: "HTTP项目知识已发布修订正文，介绍滑雪服务。",
            category: "platform",
            sourceUrl: null,
          },
          managedKnowledge,
        );
        expect(managedKnowledge).toMatchObject({
          version: 4,
          status: "published",
          sourceUrl: null,
          publishTime: knowledge.firstPublishTime,
        });
        await denied(
          call(`/admin/project-knowledge/${knowledge.id}`, {
            method: "PATCH",
            body: { ...knowledgeValues, version: 1 },
          }),
          409,
        );
        const count = requests.filter((r) => r.method === "PATCH").length;
        await expect(
          prepareKnowledgeSave(
            apiRequest,
            admin,
            knowledgeValues,
            old,
            signal(),
          ),
        ).rejects.toThrow("内容已变化");
        expect(requests.filter((r) => r.method === "PATCH")).toHaveLength(
          count,
        );
      },
    );
    check(
      "withdraws, republishes with the original publish time, then soft deletes knowledge through production commands",
      async () => {
        active = "admin";
        managedKnowledge = (await commandManagedKnowledge(
          managedKnowledge,
          "withdraw",
        ))!;
        expect(managedKnowledge).toMatchObject({
          version: 5,
          status: "withdrawn",
          publishTime: knowledge.firstPublishTime,
        });
        managedKnowledge = (await commandManagedKnowledge(
          managedKnowledge,
          "publish",
        ))!;
        expect(managedKnowledge).toMatchObject({
          version: 6,
          status: "published",
          publishTime: knowledge.firstPublishTime,
        });
        await commandManagedKnowledge(managedKnowledge, "delete");
        await denied(
          readKnowledge(apiRequest, admin, knowledge.id, signal()),
          404,
        );
        const page = await readKnowledgePage(
          apiRequest,
          admin,
          { page: 1, keyword: "HTTP知识联调定版" },
          signal(),
        );
        expect(page).toMatchObject({ total: 0, items: [], hasNext: false });
      },
    );
    check(
      "reads only Outbox metadata and locates the exact real microsecond event through the production locator",
      async () => {
        active = "admin";
        const page = await readEventPage(
          apiRequest,
          admin,
          {
            status: "failed",
            eventType: "http.fixture.recoverable.v1",
            aggregateType: "HttpValidation",
            aggregateId: "only-synthetic",
            fromTime: "2026-11-03T01:00:00.123Z",
            toTime: "2026-11-03T01:00:00.124Z",
          },
          1,
          1,
          signal(),
        );
        expect(page).toMatchObject({
          total: 1,
          hasNext: false,
          page: 1,
          pageSize: 1,
        });
        failedEvent = page.items[0]!;
        expect(failedEvent).toMatchObject({
          eventId: fixture.retryEventId,
          attempts: 5,
          maxAttempts: 5,
          status: "failed",
          createdAt: "2026-11-03T01:00:00.123Z",
        });
        expect(Object.keys(failedEvent).sort()).toEqual(
          [
            "eventId",
            "eventType",
            "aggregateType",
            "aggregateId",
            "status",
            "attempts",
            "maxAttempts",
            "availableAt",
            "lockedAt",
            "occurredAt",
            "publishedAt",
            "createdAt",
          ].sort(),
        );
        expect(JSON.stringify(page)).not.toContain("HTTP联调内部");
        expect(
          await readEventTarget(apiRequest, admin, failedEvent, signal()),
        ).toEqual(failedEvent);
      },
    );
    check(
      "denies delegated event access and commits a single production retry retaining attempts and the original EventId",
      async () => {
        active = "actor";
        expect((await getCurrentUser()).permissionKeys).toEqual(
          expect.arrayContaining(["system:event:list", "system:event:retry"]),
        );
        await denied(call("/admin/events"), 403);
        await denied(
          call(`/admin/events/${fixture.retryEventId}/retry`, {
            method: "POST",
            body: { reason: "denied retry" },
          }),
          403,
        );
        active = "admin";
        const ledger = new EventRecoveryLedger();
        const gate = new EventWriteGate(
          admin,
          (signal) =>
            apiRequest<User>("/auth/me", { signal, cache: "no-store" }),
          ledger,
          () => {},
        );
        gate.activate();
        let saved: OutboxEvent | undefined;
        try {
          const result = await gate.run(
            eventMutation(failedEvent),
            (signal) =>
              prepareEventRetry(
                apiRequest,
                admin,
                failedEvent,
                "  HTTP内容事件人工重试  ",
                signal,
              ),
            (body, signal) =>
              writeEventRetry(apiRequest, failedEvent, body, signal),
            (value) => {
              saved = value;
            },
          );
          expect(result.status).toBe("success");
          expect(ledger.entries(admin.userId)).toHaveLength(0);
          expect(saved).toMatchObject({
            eventId: fixture.retryEventId,
            attempts: 5,
            maxAttempts: 13,
            status: "pending",
            lockedAt: null,
            publishedAt: null,
          });
          expect(
            await readEventTarget(apiRequest, admin, failedEvent, signal()),
          ).toEqual(saved);
          const count = requests.filter(
            (r) => r.method === "POST" && r.path.endsWith("/retry"),
          ).length;
          await expect(
            prepareEventRetry(
              apiRequest,
              admin,
              failedEvent,
              "must not replay",
              signal(),
            ),
          ).rejects.toThrow("事件已变化");
          expect(
            requests.filter(
              (r) => r.method === "POST" && r.path.endsWith("/retry"),
            ),
          ).toHaveLength(count);
          await denied(
            call(`/admin/events/${fixture.retryEventId}/retry`, {
              method: "POST",
              body: { reason: "pending retry must fail" },
            }),
            409,
          );
        } finally {
          gate.dispose();
        }
      },
    );
    check(
      "reads supported RAG metadata, sorted pgvector models and exact filters without private data",
      async () => {
        active = "admin";
        const page = await readRagPage(apiRequest, admin, {}, 1, 20, signal());
        expect(page.total).toBe(2);
        expect(JSON.stringify(page)).not.toContain("RAG联调内部");
        const source = await readRagSource(
          apiRequest,
          admin,
          fixture.rag.documentId,
          signal(),
        );
        expect(source).toMatchObject({
          controlVersion: 1,
          status: "indexed",
          sourceEligible: true,
          chunkCount: 2,
          embeddingDimension: 1024,
          embeddingModels: ["a-http-model", "z-http-model"],
        });
        expect(source).not.toHaveProperty("content");
        expect(source).not.toHaveProperty("metadata");
        const raw = await call<Record<string, unknown>>(
          `/admin/ai/sources/${fixture.rag.documentId}`,
        );
        expect(Object.keys(raw).sort()).toEqual(Object.keys(source).sort());
        expect(raw).toEqual(source);
        const rawPage = await call<{ items: Record<string, unknown>[] }>(
          "/admin/ai/sources?page=1&pageSize=20",
        );
        expect(JSON.stringify(rawPage)).not.toContain("RAG联调内部");
        for (const item of rawPage.items)
          expect(Object.keys(item).sort()).toEqual(Object.keys(source).sort());
        const failed = await readRagSource(
          apiRequest,
          admin,
          fixture.rag.failedDocumentId,
          signal(),
        );
        expect(failed).toMatchObject({
          status: "failed",
          sourceEligible: false,
          accessScope: "admin",
          failureCode: "indexing_failed",
          chunkCount: 0,
        });
        const filtered = await readRagPage(
          apiRequest,
          admin,
          {
            keyword: "  http rag公开  ",
            sourceType: "project_doc",
            status: "indexed",
            manualDisabled: "false",
          },
          1,
          1,
          signal(),
        );
        expect(filtered.total).toBe(1);
        expect(filtered.items[0]!.ragDocumentId).toBe(source.ragDocumentId);
        const first = await readRagPage(apiRequest, admin, {}, 1, 1, signal());
        const second = await readRagPage(apiRequest, admin, {}, 2, 1, signal());
        expect(
          new Set(
            [...first.items, ...second.items].map((item) => item.ragDocumentId),
          ).size,
        ).toBe(2);
        await denied(
          call(`/admin/ai/sources/${fixture.rag.excludedDocumentId}`),
          404,
        );
      },
    );
    check(
      "denies RAG reads and commands to configurable roles even with all RAG grants",
      async () => {
        active = "actor";
        const current = await getCurrentUser();
        expect(current.permissionKeys).toEqual(
          expect.arrayContaining([
            "ai:knowledge:list",
            "ai:knowledge:reindex",
            "ai:knowledge:disable",
          ]),
        );
        await denied(call("/admin/ai/sources"), 403);
        await denied(call(`/admin/ai/sources/${fixture.rag.documentId}`), 403);
        await denied(
          call(`/admin/ai/sources/${fixture.rag.documentId}/reindex`, {
            method: "POST",
            body: { expectedVersion: 1, reason: "denied RAG rebuild" },
          }),
          403,
        );
        await denied(
          call(`/admin/ai/sources/${fixture.rag.documentId}/status`, {
            method: "PATCH",
            body: {
              expectedVersion: 1,
              enabled: false,
              reason: "denied RAG disable",
            },
          }),
          403,
        );
        const count = requests.length;
        await expect(
          readRagPage(apiRequest, current, {}, 1, 20, signal()),
        ).rejects.toThrow();
        expect(requests).toHaveLength(count);
      },
    );
    check(
      "commits RAG rebuild, rejects stale version and leaves matching-state enable as a no-op",
      async () => {
        active = "admin";
        const before = await readRagSource(
          apiRequest,
          admin,
          fixture.rag.documentId,
          signal(),
        );
        const result = await writeRagCommand(
          apiRequest,
          admin,
          before,
          "reindex",
          "  HTTP RAG重建  ",
          signal(),
          () => {},
        );
        expect(result.source).toMatchObject({
          controlVersion: 2,
          status: "pending",
          chunkCount: 2,
        });
        expect(result.eventId).toBeTruthy();
        rag.eventIds.push(result.eventId!);
        expect(
          [...requests]
            .reverse()
            .find((item) => item.path.endsWith("/reindex"))!.status,
        ).toBe(202);
        await denied(
          call(`/admin/ai/sources/${before.ragDocumentId}/reindex`, {
            method: "POST",
            body: { expectedVersion: 1, reason: "stale RAG rebuild" },
          }),
          409,
        );
        const noop = await writeRagCommand(
          apiRequest,
          admin,
          result.source,
          "enable",
          "HTTP RAG同状态启用",
          signal(),
          () => {},
        );
        expect(noop.source.controlVersion).toBe(2);
        expect(noop.eventId).toBeNull();
      },
    );
    check(
      "deletes real vector chunks on disable and enqueues a new generation on enable",
      async () => {
        active = "admin";
        const before = await readRagSource(
          apiRequest,
          admin,
          fixture.rag.documentId,
          signal(),
        );
        const disabled = await writeRagCommand(
          apiRequest,
          admin,
          before,
          "disable",
          "HTTP RAG停用",
          signal(),
          () => {},
        );
        expect(disabled.source).toMatchObject({
          controlVersion: 3,
          status: "disabled",
          manualDisabled: true,
          chunkCount: 0,
          embeddingModels: [],
          indexedAt: null,
        });
        expect(disabled.eventId).toBeNull();
        await denied(
          call(`/admin/ai/sources/${before.ragDocumentId}/reindex`, {
            method: "POST",
            body: { expectedVersion: 3, reason: "disabled RAG rebuild" },
          }),
          409,
        );
        const count = requests.length;
        await expect(
          writeRagCommand(
            apiRequest,
            admin,
            disabled.source,
            "reindex",
            "disabled local rebuild",
            signal(),
            () => {},
          ),
        ).rejects.toThrow();
        expect(requests).toHaveLength(count);
        const enabled = await writeRagCommand(
          apiRequest,
          admin,
          disabled.source,
          "enable",
          "HTTP RAG启用",
          signal(),
          () => {},
        );
        expect(enabled.source).toMatchObject({
          controlVersion: 4,
          status: "pending",
          manualDisabled: false,
          chunkCount: 0,
        });
        rag.eventIds.push(enabled.eventId!);
      },
    );
    check(
      "retains recovery across controller remount after injected post-commit response loss, then requires a fresh read",
      async () => {
        active = "admin";
        const before = await readRagSource(
          apiRequest,
          admin,
          fixture.rag.documentId,
          signal(),
        );
        const ledger = new RagRecoveryLedger();
        const lost: RagRequest = async (path, options) => {
          const result = await apiRequest(path, options);
          if (path.endsWith("/reindex") && options?.method === "POST") {
            const committed = result as RagCommand;
            expect(committed.source.controlVersion).toBe(5);
            rag.eventIds.push(committed.eventId!);
            throw new Error(
              "Injected response loss after actual server commit",
            );
          }
          return result;
        };
        const first = new RagCommandSession(lost, admin, ledger, () => {});
        const unmount = first.activate(true);
        expect(await first.run(before, "reindex", "HTTP RAG丢响应")).toBe(
          false,
        );
        expect(ledger.entry(admin.userId, before.ragDocumentId)).toMatchObject({
          expectedVersion: 4,
          action: "reindex",
          inFlight: false,
        });
        expect(
          JSON.stringify(ledger.entry(admin.userId, before.ragDocumentId)),
        ).not.toContain("HTTP RAG丢响应");
        unmount();
        const second = new RagCommandSession(
          apiRequest,
          admin,
          ledger,
          () => {},
        );
        const dispose = second.activate(true);
        try {
          const count = requests.length;
          expect(await second.run(before, "reindex", "must not replay")).toBe(
            false,
          );
          expect(requests).toHaveLength(count);
          expect(
            ledger.acknowledge(
              admin.userId,
              before.ragDocumentId,
              ledger.version,
            ),
          ).toBe(false);
          const readVersion = ledger.version;
          const current = await readRagSource(
            apiRequest,
            admin,
            before.ragDocumentId,
            signal(),
          );
          expect(current.controlVersion).toBe(5);
          expect(
            ledger.confirmRead(admin.userId, before.ragDocumentId, readVersion),
          ).toBe(true);
          expect(
            ledger.acknowledge(admin.userId, before.ragDocumentId, readVersion),
          ).toBe(true);
          expect(
            await second.run(current, "disable", "HTTP RAG核对后停用"),
          ).toBe(true);
          expect(
            ledger.entry(admin.userId, before.ragDocumentId),
          ).toBeUndefined();
        } finally {
          dispose();
        }
      },
    );
    check(
      "serializes two real concurrent enable commands to one winner, one conflict and one Outbox event",
      async () => {
        active = "admin";
        const before = await readRagSource(
          apiRequest,
          admin,
          fixture.rag.documentId,
          signal(),
        );
        expect(before).toMatchObject({
          controlVersion: 6,
          manualDisabled: true,
        });
        const reasons = ["HTTP RAG并发启用A", "HTTP RAG并发启用B"];
        const results = await Promise.allSettled(
          reasons.map((reason) =>
            call<RagCommand>(
              `/admin/ai/sources/${before.ragDocumentId}/status`,
              {
                method: "PATCH",
                body: { expectedVersion: 6, enabled: true, reason },
              },
            ),
          ),
        );
        expect(
          results.filter((result) => result.status === "fulfilled"),
        ).toHaveLength(1);
        for (const [index, result] of results.entries()) {
          if (result.status === "fulfilled") {
            expect(result.value.source).toMatchObject({
              controlVersion: 7,
              status: "pending",
              manualDisabled: false,
            });
            rag.eventIds.push(result.value.eventId!);
            rag.concurrentWinnerReason = reasons[index]!;
          } else {
            expect(result.reason).toBeInstanceOf(ApiError);
            expect((result.reason as ApiError).status).toBe(409);
            expect((result.reason as ApiError).traceId).toBeTruthy();
            rejectedTraceIds.push((result.reason as ApiError).traceId!);
          }
        }
        expect(
          (
            await readRagSource(
              apiRequest,
              admin,
              before.ragDocumentId,
              signal(),
            )
          ).controlVersion,
        ).toBe(7);
        expect(new Set(rag.eventIds).size).toBe(4);
      },
    );
    check(
      "reads only approved audit metadata, retained deletion and exact user/status/time filters",
      async () => {
        active = "admin";
        const current = await getCurrentUser();
        const page = await readAuditPage(
          apiRequest,
          current,
          {},
          1,
          20,
          signal(),
        );
        expect(page.total).toBe(3);
        expect(JSON.stringify(page)).not.toContain("审计联调私密");
        const filtered = await readAuditPage(
          apiRequest,
          current,
          {
            userId: owner!.userId,
            status: "deleted",
            fromTime: "2026-11-03T00:00:00.000Z",
            toTime: "2026-11-03T00:00:00.000Z",
          },
          1,
          20,
          signal(),
        );
        expect(filtered.items.map((item) => item.conversationId)).toEqual([
          fixture.audit.deletedId,
        ]);
        const item = await readAuditSummary(
          apiRequest,
          current,
          fixture.audit.activeId,
          signal(),
        );
        expect(item.messageCount).toBe(2);
        expect(Object.keys(item)).toHaveLength(7);
      },
    );
    check(
      "uses a configurable auditor role/self scope and commits one explicit content access audit",
      async () => {
        active = "actor";
        const current = await getCurrentUser();
        expect(
          current.roles.some((role) => role.roleKey === "system_admin"),
        ).toBe(false);
        const page = await readAuditPage(
          apiRequest,
          current,
          {},
          1,
          20,
          signal(),
        );
        expect(page.total).toBe(2);
        expect(page.items.every((item) => item.userId === owner!.userId)).toBe(
          true,
        );
        const body = await readAuditContent(
          apiRequest,
          current,
          fixture.audit.activeId,
          "  HTTP审计人工核对  ",
          signal(),
        );
        expect(body.messages.map((item) => item.messageId)).toEqual([
          "9007199254740993",
          "9007199254740994",
        ]);
        expect(body.messages.map((item) => item.content)).toEqual([
          "审计联调私密问题",
          "审计联调私密回复",
        ]);
        expect(body.messages[1]!.citations).toEqual([
          { sourceKey: "article:17", title: "历史引用" },
        ]);
        await denied(
          readAuditSummary(
            apiRequest,
            current,
            fixture.audit.foreignId,
            signal(),
          ),
          404,
        );
        await denied(
          call(
            `/admin/ai/conversations/${fixture.audit.foreignId}/content-access`,
            { method: "POST", body: { reason: "denied foreign" } },
          ),
          404,
        );
      },
    );
    check(
      "revokes content access immediately while preserving metadata and never replays the denied POST",
      async () => {
        const keys = [
          "management:portal:enter",
          "resort:merchant:list",
          "account:profile:read",
          "system:dict:list",
          "system:role:list",
          "system:role:update",
          "system:permission:assign",
          "system:ai-conversation:list",
        ];
        await authorize(readRole, keys, "merchant", true, false);
        try {
          active = "actor";
          const current = await getCurrentUser();
          expect(
            await readAuditSummary(
              apiRequest,
              current,
              fixture.audit.activeId,
              signal(),
            ),
          ).toMatchObject({ userId: owner!.userId });
          await denied(
            call(
              `/admin/ai/conversations/${fixture.audit.activeId}/content-access`,
              { method: "POST", body: { reason: "denied revoked" } },
            ),
            403,
          );
          const before = requests.length;
          await expect(
            readAuditContent(
              apiRequest,
              actor,
              fixture.audit.activeId,
              "revoked stale identity",
              signal(),
            ),
          ).rejects.toThrow();
          expect(
            requests
              .slice(before)
              .filter(
                (item) =>
                  item.method === "POST" &&
                  item.path.endsWith("/content-access"),
              ),
          ).toHaveLength(0);
        } finally {
          await authorize(
            readRole,
            [...keys, "system:ai-conversation:read-content"],
            "merchant",
            true,
            false,
          );
        }
      },
    );
    check(
      "reads approved operation log metadata through the production identity-fenced reader",
      async () => {
        active = "admin";
        const current = await getCurrentUser();
        const page = await readOperationLogPage(
          apiRequest,
          current,
          operationLogQuery({ actorUserId: String(current.userId) }, 1, 1),
          signal(),
        );
        expect(page.total).toBeGreaterThan(1);
        expect(page.hasNext).toBe(true);
        expect(page.items).toHaveLength(1);
        const item = page.items[0]!;
        expect(item.actorUserId).toBe(current.userId);
        expect(item.operationLogId).toMatch(/^[1-9]\d*$/);
        expect(Object.keys(item).sort()).toEqual(
          [
            "operationLogId",
            "actorUserId",
            "actorAccountSnapshot",
            "actionKey",
            "resourceKey",
            "targetType",
            "targetId",
            "result",
            "traceId",
            "createdAt",
          ].sort(),
        );
        const filtered = await readOperationLogPage(
          apiRequest,
          current,
          operationLogQuery(
            {
              actorUserId: String(current.userId),
              actionKey: item.actionKey,
              resourceKey: item.resourceKey,
              result: item.result,
              traceId: item.traceId,
              fromTime: item.createdAt,
              // Stored PostgreSQL microseconds can extend past the VO millisecond.
              toTime: new Date(Date.parse(item.createdAt) + 1).toISOString(),
            },
            1,
            20,
          ),
          signal(),
        );
        expect(
          filtered.items.some(
            (row) => row.operationLogId === item.operationLogId,
          ),
        ).toBe(true);
        active = "actor";
        await denied(call("/admin/operation-logs?page=1&pageSize=20"), 403);
      },
    );
    check(
      "reads production dictionary pages and nested disabled items from the actual API",
      async () => {
        active = "admin";
        const current = await getCurrentUser();
        const page = await readDictionaryPage(
          apiRequest,
          current,
          1,
          "resort",
          "active",
          signal(),
        );
        const dictionary = page.items.find(
          (item) => item.dictType === "resort.fit_tag",
        );
        expect(dictionary).toBeDefined();
        expect(
          await readDictionaryDetail(
            apiRequest,
            current,
            "resort.fit_tag",
            signal(),
          ),
        ).toEqual(dictionary);
        expect(dictionary!.items).toHaveLength(1);
        expect(dictionary!.items[0]!.value).toBe("http_root");
        expect(dictionary!.items[0]!.children).toMatchObject([
          {
            parentId: dictionary!.items[0]!.itemId,
            value: "http_child",
            status: "disabled",
          },
        ]);
      },
    );
    check(
      "validates production field/group list and target readers against the compiled API",
      async () => {
        active = "admin";
        const current = await getCurrentUser();
        const fields = await readFieldPage(
          apiRequest,
          current,
          "ski_resort",
          1,
          "active",
          signal(),
        );
        const groups = await readFieldGroups(
          apiRequest,
          current,
          "ski_resort",
          signal(),
        );
        expect(fields.total).toBe(2);
        expect(groups).toHaveLength(1);
        for (const item of fields.items)
          expect(
            await readFieldDetail(
              apiRequest,
              current,
              "ski_resort",
              item.fieldDefinitionId,
              signal(),
            ),
          ).toEqual(item);
        expect(
          await readFieldGroupDetail(
            apiRequest,
            current,
            "ski_resort",
            groups[0]!.groupKey,
            signal(),
          ),
        ).toEqual(groups[0]);
      },
    );
    check(
      "restores a business merchant with two configurable roles and no merchant role key",
      async () => {
        active = "actor";
        const me = await getCurrentUser();
        // Earlier authorization tests changed the grants. Model calls need the fresh snapshot.
        actor = me;
        expect(me.userId).toBe(owner!.userId);
        expect(me.merchant?.merchantId).toBe(owner!.merchantId);
        expect(me.roles.map((role) => role.roleKey).sort()).toEqual([
          "http_auth_read",
          "http_auth_write",
        ]);
        expect(me.permissionKeys).toContain("resort:merchant:update");
        expect(
          (me as unknown as Record<string, unknown>).accessToken,
        ).toBeUndefined();
      },
    );
    check(
      "uses the production list/detail reader and excludes another merchant's draft",
      async () => {
        active = "actor";
        const page = await readResortPage(
          apiRequest,
          actor,
          1,
          undefined,
          signal(),
        );
        expect(page.total).toBe(1);
        expect(page.items.map((item) => item.resortId)).toEqual([
          owner!.resortId,
        ]);
        const item = await readResort(
          apiRequest,
          actor,
          owner!.resortId,
          signal(),
        );
        expect(item.customFields).toEqual({ http_note: "原始备注a" });
        await denied(
          readResort(apiRequest, actor, other!.resortId, signal()),
          404,
        );
      },
    );
    check(
      "refreshes through the actual Cookie/CSRF client after access expiry and rotates the refresh credential",
      async () => {
        active = "actor";
        const previous = jars.actor.get("linji_refresh")?.value;
        expect(Boolean(previous)).toBe(true);
        jars.actor.delete("linji_access");
        const before = requests.length;
        expect((await getCurrentUser()).userId).toBe(owner!.userId);
        expect(jars.actor.get("linji_refresh")?.value !== previous).toBe(true);
        expect(Boolean(jars.actor.get("linji_access")?.value)).toBe(true);
        const refreshes = requests
          .slice(before)
          .filter((request) => request.path.endsWith("/auth/refresh"));
        // The Node harness switches two cookie jars through the same production client.
        // A stale CSRF cache may be rejected once before that client fetches the current jar's token.
        expect(refreshes.map((request) => request.status)).toEqual(
          refreshes.length === 1 ? [200] : [403, 200],
        );
        expect(refreshes.filter((request) => request.status === 403)).toEqual(
          refreshes.length === 1
            ? []
            : [
                expect.objectContaining({
                  actor: "actor",
                  method: "POST",
                  csrf: true,
                  csrfRejected: true,
                }),
              ],
        );
        expect(refreshes.filter((request) => request.status === 200)).toEqual([
          expect.objectContaining({
            actor: "actor",
            method: "POST",
            status: 200,
            csrf: true,
          }),
        ]);
      },
    );
    check(
      "merges readable/writable field policies and saves the actual production form payload",
      async () => {
        active = "actor";
        const form = await readResortForm(
          apiRequest,
          actor,
          owner!.resortId,
          signal(),
        );
        const fields = form.schema.groups.flatMap(
          (group) => group.fields ?? [],
        );
        expect(
          fields.find((field) => field.fieldKey === "http_note"),
        ).toMatchObject({ canRead: true, canWrite: true });
        expect(fields.some((field) => field.fieldKey === "http_secret")).toBe(
          false,
        );
        const values = initialResortInput(form.item, form.schema);
        values.description = "权限联调已保存介绍";
        values.customFields = { http_note: "权限联调已保存备注" };
        const body = await prepareResortSave(
          apiRequest,
          actor,
          { item: form.item, schema: form.schema, values },
          signal(),
        );
        const saved = await saveResort(
          apiRequest,
          owner!.resortId,
          body,
          signal(),
        );
        expect(saved.description).toBe(values.description);
        expect(saved.customFields).toEqual(values.customFields);
      },
    );
    check(
      "rejects known private fields, unknown fields and forged merchant ownership on the real wire",
      async () => {
        active = "actor";
        for (const customFields of [
          { http_secret: "越权覆盖" },
          { nonexistent: "未知字段" },
        ])
          await denied(
            call(`/merchant/resorts/${owner!.resortId}`, {
              method: "PATCH",
              body: { customFields },
            }),
            422,
          );
        await denied(
          call(`/merchant/resorts/${owner!.resortId}`, {
            method: "PATCH",
            body: { merchantId: other!.merchantId },
          }),
          400,
        );
      },
    );
    check(
      "requires system_admin for authorization even when an ordinary role holds assignment grants",
      async () => {
        active = "actor";
        expect(actor.permissionKeys).toContain("system:permission:assign");
        const snapshot = await call<AuthorizationSnapshot>(
          `/admin/roles/${writeRole.roleId}/permissions`,
        );
        await denied(
          call(`/admin/roles/${writeRole.roleId}/permissions`, {
            method: "PUT",
            body: {
              permissionIds: snapshot.permissionIds,
              dataScopes: snapshot.dataScopes,
              fieldPolicies: [],
            },
          }),
          403,
        );
        expect(
          await call(`/admin/roles/${writeRole.roleId}/permissions`),
        ).toEqual(snapshot);
      },
    );
    check(
      "denies conflicting data scopes immediately without requiring a new login",
      async () => {
        await bind([readRole.roleId, writeRole.roleId, conflictRole.roleId]);
        try {
          active = "actor";
          await denied(call("/merchant/resorts?page=1&pageSize=20"), 403);
        } finally {
          await bind([readRole.roleId, writeRole.roleId]);
        }
        active = "actor";
        expect(
          (await readResortPage(apiRequest, actor, 1, undefined, signal()))
            .total,
        ).toBe(1);
      },
    );
    check(
      "revokes field write access immediately while retaining readable values",
      async () => {
        await authorize(
          writeRole,
          [
            "management:portal:enter",
            "resort:merchant:list",
            "resort:merchant:update",
          ],
          "merchant",
          false,
          false,
        );
        active = "actor";
        const schema = await call<ResortSchema>(
          "/merchant/resorts/custom-fields",
        );
        expect(
          schema.groups
            .flatMap((group) => group.fields ?? [])
            .find((field) => field.fieldKey === "http_note"),
        ).toMatchObject({ canRead: true, canWrite: false });
        await denied(
          call(`/merchant/resorts/${owner!.resortId}`, {
            method: "PATCH",
            body: { customFields: { http_note: "已撤销写权限" } },
          }),
          422,
        );
      },
    );
    check(
      "projects complete permission catalog and subtree with original source and hidden flags",
      async () => {
        active = "admin";
        const catalog = await readCatalog(admin, signal());
        const raw = await call<CatalogNode[]>("/admin/permissions");
        expect(catalog).toEqual(raw);
        const flat = flattenCatalog(catalog);
        const target = flat.find((node) => node.parentId !== null)!;
        expect(target).toBeDefined();
        const detail = await readCatalogDetail(
          admin,
          target.permissionId,
          signal(),
        );
        expect(detail).toEqual(
          await call(`/admin/permissions/${target.permissionId}`),
        );
        expect(Object.keys(detail).sort()).toEqual(
          [
            "permissionId",
            "parentId",
            "permissionKey",
            "permissionName",
            "permissionType",
            "source",
            "route",
            "icon",
            "sortOrder",
            "visible",
            "status",
            "children",
          ].sort(),
        );
        catalogReads.rawProjection = true;
        active = "actor";
      },
    );
    check(
      "uses configurable permissions to create a custom directory/menu/button, edit and soft-disable",
      async () => {
        try {
          await authorize(
            dashboardRole,
            [
              ...summaryBaseGrants,
              ...["list", "create", "update", "delete"].map(
                (action) => `system:permission:${action}`,
              ),
            ],
            "merchant",
            false,
            false,
          );
          await bind([dashboardRole.roleId]);
          active = "actor";
          const current = await getCurrentUser();
          expect(
            current.roles.some((role) => role.roleKey === "system_admin"),
          ).toBe(false);
          const gate = new CatalogWriteGate(
            current,
            async (signal) =>
              apiRequest<User>("/auth/me", { signal, cache: "no-store" }),
            () => {},
          );
          gate.activate();
          try {
            const create = async (
              kind: CatalogForm["permissionType"],
              parentId: number | null,
            ) => {
              const catalog = await readCatalog(current, signal());
              const values: CatalogForm = {
                permissionKey: `custom:http_catalog_${kind}`,
                permissionName: `HTTP权限${kind}`,
                permissionType: kind,
                parentId,
                route: kind === "menu" ? "/reports" : null,
                icon: null,
                sortOrder: 12,
                visible: false,
              };
              let saved: CatalogNode | undefined;
              const result = await gate.run(
                "create",
                async () =>
                  createCatalogBody(values, parentCandidates(catalog, kind)),
                async (body, signal) => {
                  saved = parseCatalogNode(
                    await apiRequest("/admin/permissions", {
                      method: "POST",
                      body,
                      signal,
                    }),
                  );
                },
                () => {},
              );
              expect(result.status).toBe("success");
              expect(saved).toBeDefined();
              return saved!;
            };
            const directory = await create("directory", null),
              menu = await create("menu", directory.permissionId),
              button = await create("button", menu.permissionId);
            catalogReads.ids = [
              directory.permissionId,
              menu.permissionId,
              button.permissionId,
            ];
            const catalog = await readCatalog(current, signal());
            const target = await readCatalogDetail(
              current,
              menu.permissionId,
              signal(),
            );
            const values: CatalogForm = {
              ...target,
              permissionType: "menu",
              permissionName: "HTTP权限菜单已修改",
              visible: true,
            };
            expect(
              (
                await gate.run(
                  "update",
                  async () =>
                    updateCatalogBody(
                      values,
                      target,
                      parentCandidates(catalog, "menu", target),
                    ),
                  async (body, signal) =>
                    parseCatalogNode(
                      await apiRequest(
                        `/admin/permissions/${menu.permissionId}`,
                        { method: "PATCH", body, signal },
                      ),
                      menu.permissionId,
                    ),
                  () => {},
                )
              ).status,
            ).toBe("success");
            expect(
              (await readCatalogDetail(current, menu.permissionId, signal()))
                .permissionName,
            ).toBe(values.permissionName);
            await denied(
              call(`/admin/permissions/${menu.permissionId}`, {
                method: "DELETE",
              }),
              409,
            );
            expect(
              (
                await gate.run(
                  "delete",
                  async () => button.permissionId,
                  async (id, signal) =>
                    apiRequest(`/admin/permissions/${id}`, {
                      method: "DELETE",
                      signal,
                    }),
                  () => {},
                )
              ).status,
            ).toBe("success");
            const result = await readCatalogDetail(
              current,
              directory.permissionId,
              signal(),
            );
            expect(result.children[0]?.children[0]?.status).toBe("disabled");
            expect(result.children[0]?.status).toBe("active");
            catalogReads.customHierarchy = true;
          } finally {
            gate.dispose();
          }
        } finally {
          await bind([readRole.roleId, writeRole.roleId]);
          active = "actor";
          actor = await getCurrentUser();
        }
      },
    );
    check(
      "refuses registry sync to a custom account with the update grant",
      async () => {
        try {
          await authorize(
            dashboardRole,
            [
              ...summaryBaseGrants,
              "system:permission:list",
              "system:permission:update",
            ],
            "merchant",
            false,
            false,
          );
          await bind([dashboardRole.roleId]);
          active = "actor";
          const current = await getCurrentUser(),
            write = async () =>
              call("/admin/permissions/sync", { method: "POST", body: {} });
          const gate = new CatalogWriteGate(
            current,
            async (signal) =>
              apiRequest<User>("/auth/me", { signal, cache: "no-store" }),
            () => {},
          );
          gate.activate();
          try {
            expect(
              await gate.run(
                "sync",
                async () => ({}),
                write,
                () => {},
              ),
            ).toMatchObject({ status: "error", uncertain: false });
          } finally {
            gate.dispose();
          }
          await denied(write(), 403);
          catalogReads.syncDenied = true;
        } finally {
          await bind([readRole.roleId, writeRole.roleId]);
          active = "actor";
          actor = await getCurrentUser();
        }
      },
    );
    check(
      "rejects catalog detail after actual list permission revocation during its response",
      async () => {
        const transport = globalThis.fetch;
        try {
          await authorize(
            dashboardRole,
            [...summaryBaseGrants, "system:permission:list"],
            "merchant",
            false,
            false,
          );
          await bind([dashboardRole.roleId]);
          active = "actor";
          const current = await getCurrentUser(),
            id = catalogReads.ids[0]!;
          let revoked = false;
          globalThis.fetch = async (input, init) => {
            const response = await transport(input, init);
            const url = new URL(
              input instanceof Request ? input.url : String(input),
            );
            if (
              !revoked &&
              url.pathname === `/api/v1/admin/permissions/${id}`
            ) {
              revoked = true;
              await authorize(
                dashboardRole,
                summaryBaseGrants,
                "merchant",
                false,
                false,
              );
              active = "actor";
            }
            return response;
          };
          await expect(
            readCatalogDetail(current, id, signal()),
          ).rejects.toThrow("变化");
          expect(revoked).toBe(true);
          catalogReads.revocationRejected = true;
        } finally {
          globalThis.fetch = transport;
          await bind([readRole.roleId, writeRole.roleId]);
          active = "actor";
          actor = await getCurrentUser();
        }
      },
    );
    check(
      "manages dictionary-backed field/group lifecycle and rejects stale versions on the real API",
      async () => {
        active = "admin";
        const current = await getCurrentUser(),
          entity = "article",
          groupKey = "http_field_reads";
        const createdGroup = parseGroupReceipt(
          await apiRequest("/admin/custom-field-groups", {
            method: "POST",
            body: {
              entityType: entity,
              groupKey,
              ...groupBody({ label: "HTTP字段分组", sortOrder: 4 }),
            },
          }),
          entity,
          groupKey,
        );
        expect(createdGroup.status).toBe("active");
        const body = createFieldBody(
          {
            fieldKey: "http_read_choice",
            label: "HTTP字典字段",
            dataType: "single_select",
            groupKey,
            sortOrder: 7,
            required: false,
            defaultValueText: '\"http_root\"',
            optionsDictType: "resort.fit_tag",
            validationText: "",
            searchable: false,
            filterable: true,
            sortable: false,
            isPublic: false,
          },
          entity,
          true,
        );
        let field = parseFieldReceipt(
          await apiRequest("/admin/custom-fields", { method: "POST", body }),
          entity,
          { fieldKey: body.fieldKey, schemaVersion: 1, status: "draft" },
        );
        fieldReads.fieldId = field.fieldDefinitionId;
        expect(field.defaultValue).toBe("http_root");
        expect(field.optionsDictType).toBe("resort.fit_tag");
        field = parseFieldReceipt(
          await apiRequest(`/admin/custom-fields/${field.fieldDefinitionId}`, {
            method: "PATCH",
            body: { expectedSchemaVersion: 1, label: "HTTP字典字段已修改" },
          }),
          entity,
          {
            fieldDefinitionId: field.fieldDefinitionId,
            schemaVersion: 2,
            status: "draft",
          },
        );
        await denied(
          call(`/admin/custom-fields/${field.fieldDefinitionId}`, {
            method: "PATCH",
            body: { expectedSchemaVersion: 1, label: "过期修改" },
          }),
          409,
        );
        fieldReads.staleRejected = true;
        field = parseFieldReceipt(
          await apiRequest(
            `/admin/custom-fields/${field.fieldDefinitionId}/activate`,
            { method: "PATCH", body: { expectedSchemaVersion: 2 } },
          ),
          entity,
          {
            fieldDefinitionId: field.fieldDefinitionId,
            schemaVersion: 3,
            status: "active",
          },
        );
        await denied(
          call(`/admin/custom-field-groups/${entity}/${groupKey}`, {
            method: "DELETE",
          }),
          409,
        );
        fieldReads.groupProtected = true;
        expect(
          await readFieldDetail(
            apiRequest,
            current,
            entity,
            field.fieldDefinitionId,
            signal(),
          ),
        ).toEqual(field);
        expect(
          (
            await readFieldPage(
              apiRequest,
              current,
              entity,
              1,
              "active",
              signal(),
            )
          ).items,
        ).toEqual([field]);
        await apiRequest(`/admin/custom-fields/${field.fieldDefinitionId}`, {
          method: "DELETE",
        });
        expect(
          await readFieldDetail(
            apiRequest,
            current,
            entity,
            field.fieldDefinitionId,
            signal(),
          ),
        ).toMatchObject({ status: "disabled", schemaVersion: 4 });
        parseGroupReceipt(
          await apiRequest(`/admin/custom-field-groups/${entity}/${groupKey}`, {
            method: "PATCH",
            body: groupBody({ label: "HTTP字段分组已修改", sortOrder: 5 }),
          }),
          entity,
          groupKey,
        );
        await apiRequest(`/admin/custom-field-groups/${entity}/${groupKey}`, {
          method: "DELETE",
        });
        expect(
          await readFieldGroupDetail(
            apiRequest,
            current,
            entity,
            groupKey,
            signal(),
          ),
        ).toMatchObject({ status: "disabled", label: "HTTP字段分组已修改" });
        fieldReads.lifecycle = true;
      },
    );
    check(
      "rejects an actual field read when its configurable grant is revoked before publication",
      async () => {
        const transport = globalThis.fetch;
        try {
          await authorize(
            dashboardRole,
            [...summaryBaseGrants, "system:field:list"],
            "merchant",
            false,
            false,
          );
          await bind([dashboardRole.roleId]);
          active = "actor";
          const current = await getCurrentUser();
          let revoked = false;
          globalThis.fetch = async (input, init) => {
            const response = await transport(input, init);
            const url = new URL(
              input instanceof Request ? input.url : String(input),
            );
            if (
              !revoked &&
              url.pathname ===
                `/api/v1/admin/custom-fields/${fieldReads.fieldId}`
            ) {
              revoked = true;
              await authorize(
                dashboardRole,
                summaryBaseGrants,
                "merchant",
                false,
                false,
              );
              active = "actor";
            }
            return response;
          };
          await expect(
            readFieldDetail(
              apiRequest,
              current,
              "article",
              fieldReads.fieldId,
              signal(),
            ),
          ).rejects.toThrow("变化");
          expect(revoked).toBe(true);
          fieldReads.revocationRejected = true;
        } finally {
          globalThis.fetch = transport;
          await bind([readRole.roleId, writeRole.roleId]);
          active = "actor";
          actor = await getCurrentUser();
        }
      },
    );
    check(
      "creates an article through the production form and preserves first publication across lifecycle commands",
      async () => {
        active = "admin";
        const categoryDictionary = await apiRequest(
          "/admin/dictionaries/knowledge.article_category",
        );
        expect(categoryDictionary).toMatchObject({
          dictType: "knowledge.article_category",
          publiclyReadable: true,
        });
        await apiRequest(
          "/admin/dictionaries/knowledge.article_category/items",
          {
            method: "POST",
            body: {
              label: "入门知识",
              value: "http_beginner",
              parentId: null,
              sortOrder: 0,
              isDefault: true,
              color: null,
            },
          },
        );
        const current = await getCurrentUser(),
          form = await readArticleForm(
            apiRequest,
            current,
            undefined,
            signal(),
          );
        expect(form.categories).toEqual([
          { value: "http_beginner", label: "入门知识" },
        ]);
        expect(form.schema).toEqual({ entityType: "article", groups: [] });
        const values: ArticleInput = {
          title: "HTTP文章生命周期",
          summary: "文章管理真实接口摘要",
          body: "滑雪知识文章真实接口正文。",
          categoryValue: "http_beginner",
          coverAssetId: null,
          customFields: {},
        };
        const body = await prepareArticleSave(
          apiRequest,
          current,
          { schema: form.schema, values },
          signal(),
        );
        let saved = await saveManagedArticle(
          apiRequest,
          undefined,
          body,
          signal(),
        );
        articleReads.managedId = saved.articleId;
        expect(saved).toMatchObject({
          status: "draft",
          publishTime: null,
          version: 1,
        });
        const command = async (action: "publish" | "withdraw") => {
          await prepareArticleCommand(
            apiRequest,
            current,
            saved.articleId,
            action,
            signal(),
            saved.version,
          );
          const result = await sendArticleCommand(
            apiRequest,
            saved.articleId,
            action,
            signal(),
          );
          expect(result).toBeDefined();
          return result!;
        };
        saved = await command("publish");
        articleReads.firstPublishTime = saved.publishTime!;
        expect(saved).toMatchObject({ status: "published", version: 2 });
        expect(saved.publishTime).not.toBeNull();
        const edit = await readArticleForm(
          apiRequest,
          current,
          saved.articleId,
          signal(),
        );
        const updated = await prepareArticleSave(
          apiRequest,
          current,
          {
            article: saved,
            schema: edit.schema,
            values: { ...values, title: "HTTP文章已发布编辑" },
          },
          signal(),
        );
        saved = await saveManagedArticle(
          apiRequest,
          saved.articleId,
          updated,
          signal(),
        );
        expect(saved).toMatchObject({
          status: "published",
          version: 3,
          publishTime: articleReads.firstPublishTime,
        });
        saved = await command("withdraw");
        expect(saved).toMatchObject({
          status: "withdrawn",
          version: 4,
          publishTime: articleReads.firstPublishTime,
        });
        saved = await command("publish");
        expect(saved).toMatchObject({
          status: "published",
          version: 5,
          publishTime: articleReads.firstPublishTime,
        });
        const page = await readArticlePage(
          apiRequest,
          current,
          { page: 1, status: "published", keyword: "HTTP文章" },
          signal(),
        );
        expect(page.items).toEqual([saved]);
        expect(
          await readArticlePage(apiRequest, current, { page: 2 }, signal()),
        ).toMatchObject({ total: 1, items: [], hasNext: false });
        articleReads.lifecycle = true;
      },
    );
    check(
      "enforces self and selected article scopes for configurable business accounts",
      async () => {
        try {
          let current = await articleAccess("self");
          const form = await readArticleForm(
            apiRequest,
            current,
            undefined,
            signal(),
          );
          const values: ArticleInput = {
            title: "HTTP本人文章",
            summary: "本人范围",
            body: "本人范围文章正文。",
            categoryValue: "http_beginner",
            coverAssetId: null,
            customFields: {},
          };
          const own = await saveManagedArticle(
            apiRequest,
            undefined,
            await prepareArticleSave(
              apiRequest,
              current,
              { schema: form.schema, values },
              signal(),
            ),
            signal(),
          );
          articleReads.ownedId = own.articleId;
          expect(
            (await readArticlePage(apiRequest, current, { page: 1 }, signal()))
              .items,
          ).toEqual([own]);
          await denied(call(`/admin/articles/${articleReads.managedId}`), 404);
          await denied(
            call(`/admin/articles/${articleReads.managedId}`, {
              method: "PATCH",
              body: values,
            }),
            404,
          );
          current = await articleAccess("selected", [articleReads.managedId]);
          expect(
            (
              await readArticlePage(apiRequest, current, { page: 1 }, signal())
            ).items.map((row) => row.articleId),
          ).toEqual([articleReads.managedId]);
          expect(
            (
              await readArticle(
                apiRequest,
                current,
                articleReads.managedId,
                signal(),
              )
            ).status,
          ).toBe("published");
          await denied(call(`/admin/articles/${own.articleId}`), 404);
          await denied(
            call("/admin/articles", { method: "POST", body: values }),
            403,
          );
          articleReads.scopeRules = true;
        } finally {
          await bind([readRole.roleId, writeRole.roleId]);
          active = "actor";
          actor = await getCurrentUser();
        }
      },
    );
    check(
      "rejects article data after actual read-time permission revocation",
      async () => {
        const transport = globalThis.fetch;
        try {
          const current = await articleAccess("self");
          let revoked = false;
          globalThis.fetch = async (input, init) => {
            const response = await transport(input, init),
              url = new URL(
                input instanceof Request ? input.url : String(input),
              );
            if (
              !revoked &&
              url.pathname === `/api/v1/admin/articles/${articleReads.ownedId}`
            ) {
              revoked = true;
              await authorize(
                dashboardRole,
                summaryBaseGrants,
                "merchant",
                false,
                false,
              );
              active = "actor";
            }
            return response;
          };
          await expect(
            readArticle(apiRequest, current, articleReads.ownedId, signal()),
          ).rejects.toThrow("变化");
          expect(revoked).toBe(true);
          articleReads.revocationRejected = true;
        } finally {
          globalThis.fetch = transport;
          await bind([readRole.roleId, writeRole.roleId]);
          active = "actor";
          actor = await getCurrentUser();
        }
      },
    );
    check(
      "soft-deletes articles with the original actor authorization and hides both deleted targets",
      async () => {
        try {
          const current = await articleAccess("self");
          await prepareArticleCommand(
            apiRequest,
            current,
            articleReads.ownedId,
            "delete",
            signal(),
            1,
          );
          await sendArticleCommand(
            apiRequest,
            articleReads.ownedId,
            "delete",
            signal(),
          );
          await denied(call(`/admin/articles/${articleReads.ownedId}`), 404);
          active = "admin";
          const adminIdentity = await getCurrentUser();
          await prepareArticleCommand(
            apiRequest,
            adminIdentity,
            articleReads.managedId,
            "delete",
            signal(),
            5,
          );
          await sendArticleCommand(
            apiRequest,
            articleReads.managedId,
            "delete",
            signal(),
          );
          await denied(call(`/admin/articles/${articleReads.managedId}`), 404);
          expect(
            (
              await readArticlePage(
                apiRequest,
                adminIdentity,
                { page: 1 },
                signal(),
              )
            ).total,
          ).toBe(0);
          articleReads.deleted = true;
        } finally {
          await bind([readRole.roleId, writeRole.roleId]);
          active = "actor";
          actor = await getCurrentUser();
        }
      },
    );
    check(
      "creates a merchant draft, submits review and publishes through the existing administrator command",
      async () => {
        const current = await resortAccess();
        const form = await readResortForm(
          apiRequest,
          current,
          undefined,
          signal(),
        );
        const values = {
          ...initialResortInput(undefined, form.schema),
          name: "HTTP雪场完整流程",
          snowCondition: "压雪良好",
          description: "待审核雪场介绍",
          price: 188,
          openStatus: "open" as const,
          customFields: {},
        };
        const body = await prepareResortSave(
          apiRequest,
          current,
          { schema: form.schema, values },
          signal(),
        );
        let saved = await saveResort(apiRequest, undefined, body, signal());
        resortReads.resortId = saved.resortId;
        expect(saved.status).toBe("draft");
        await denied(call(`/resorts/${saved.resortId}`), 404);
        await prepareResortCommand(
          apiRequest,
          current,
          saved,
          "submit-review",
          signal(),
        );
        saved = (await runResortCommand(
          apiRequest,
          saved.resortId,
          "submit-review",
          signal(),
        ))!;
        expect(saved.status).toBe("pending_review");
        await denied(call(`/resorts/${saved.resortId}`), 404);
        active = "admin";
        expect(
          await call(`/admin/resorts/${saved.resortId}/publish`, {
            method: "PATCH",
          }),
        ).toMatchObject({
          resortId: saved.resortId,
          status: "published",
          merchantId: owner!.merchantId,
        });
        const publicDetail = await call<Record<string, unknown>>(
          `/resorts/${saved.resortId}`,
        );
        expect(publicDetail).toMatchObject({
          resortId: saved.resortId,
          name: values.name,
        });
        expect(publicDetail).not.toHaveProperty("merchantId");
        expect(publicDetail).not.toHaveProperty("http_secret");
        resortReads.lifecycle = true;
      },
    );
    check(
      "hides published merchant edits until reapproval and supports offline resubmission",
      async () => {
        active = "actor";
        const current = await getCurrentUser();
        const form = await readResortForm(
          apiRequest,
          current,
          resortReads.resortId,
          signal(),
        );
        const values = {
          ...initialResortInput(form.item, form.schema),
          description: "HTTP雪场复审后介绍",
        };
        const body = await prepareResortSave(
          apiRequest,
          current,
          { item: form.item, schema: form.schema, values },
          signal(),
        );
        const saved = await saveResort(
          apiRequest,
          resortReads.resortId,
          body,
          signal(),
        );
        expect(saved.status).toBe("pending_review");
        await denied(call(`/resorts/${saved.resortId}`), 404);
        active = "admin";
        expect(
          await call(`/admin/resorts/${saved.resortId}/publish`, {
            method: "PATCH",
          }),
        ).toMatchObject({ status: "published" });
        expect(await call(`/resorts/${saved.resortId}`)).toMatchObject({
          description: values.description,
        });
        expect(
          await call(`/admin/resorts/${saved.resortId}/offline`, {
            method: "PATCH",
          }),
        ).toMatchObject({ status: "offline" });
        await denied(call(`/resorts/${saved.resortId}`), 404);
        active = "actor";
        const offline = await readResort(
          apiRequest,
          current,
          saved.resortId,
          signal(),
        );
        await prepareResortCommand(
          apiRequest,
          current,
          offline,
          "submit-review",
          signal(),
        );
        expect(
          await runResortCommand(
            apiRequest,
            saved.resortId,
            "submit-review",
            signal(),
          ),
        ).toMatchObject({ status: "pending_review" });
        resortReads.republished = true;
      },
    );
    check(
      "rejects a merchant detail when its grant is revoked after the real data response",
      async () => {
        active = "actor";
        const current = await getCurrentUser();
        let changed = false;
        const previousFetch = globalThis.fetch;
        globalThis.fetch = async (input, init) => {
          const response = await previousFetch(input, init);
          if (
            !changed &&
            new URL(input instanceof Request ? input.url : String(input))
              .pathname ===
              `/api/v1/merchant/resorts/${resortReads.resortId}` &&
            response.ok
          ) {
            changed = true;
            await authorize(
              dashboardRole,
              resortLifecycleGrants.filter(
                (key) => key !== "resort:merchant:list",
              ),
              "merchant",
              true,
              true,
            );
            active = "actor";
          }
          return response;
        };
        try {
          await expect(
            readResort(apiRequest, current, resortReads.resortId, signal()),
          ).rejects.toThrow("权限已变化");
          expect(changed).toBe(true);
          resortReads.revocationRejected = true;
        } finally {
          globalThis.fetch = previousFetch;
          await resortAccess();
        }
      },
    );
    check(
      "keeps a foreign merchant resort invisible and soft deletes the newly managed resort",
      async () => {
        try {
          active = "actor";
          const current = await getCurrentUser();
          const page = await readResortPage(
            apiRequest,
            current,
            1,
            undefined,
            signal(),
          );
          expect(
            page.items.map((item) => item.resortId).sort((a, b) => a - b),
          ).toEqual(
            [owner!.resortId, resortReads.resortId].sort((a, b) => a - b),
          );
          expect(
            (await readResortPage(apiRequest, current, 2, undefined, signal()))
              .items,
          ).toEqual([]);
          await denied(call(`/merchant/resorts/${other!.resortId}`), 404);
          await denied(
            call(`/merchant/resorts/${other!.resortId}`, {
              method: "PATCH",
              body: { description: "越权修改" },
            }),
            404,
          );
          resortReads.scopeRules = true;
          const target = await readResort(
            apiRequest,
            current,
            resortReads.resortId,
            signal(),
          );
          await prepareResortCommand(
            apiRequest,
            current,
            target,
            "delete",
            signal(),
          );
          await runResortCommand(
            apiRequest,
            target.resortId,
            "delete",
            signal(),
          );
          await denied(call(`/merchant/resorts/${target.resortId}`), 404);
          active = "admin";
          await denied(call(`/admin/resorts/${target.resortId}`), 404);
          await denied(call(`/resorts/${target.resortId}`), 404);
          resortReads.deleted = true;
        } finally {
          await bind([readRole.roleId, writeRole.roleId]);
          active = "actor";
          actor = await getCurrentUser();
        }
      },
    );
    check(
      "creates and publishes a global resort using configurable grants and filtered fields",
      async () => {
        const current = await globalResortAccess();
        expect(
          current.roles.some((role) => role.roleKey === "system_admin"),
        ).toBe(false);
        const form = await readGlobalResortForm(
          apiRequest,
          current,
          undefined,
          signal(),
        );
        const fields = form.schema.groups.flatMap(
          (group) => group.fields ?? [],
        );
        expect(fields.map((field) => field.fieldKey)).toContain("http_note");
        expect(fields.map((field) => field.fieldKey)).not.toContain(
          "http_secret",
        );
        const values = {
          ...initialGlobalResortInput(undefined, form.schema),
          name: "HTTP全局雪场流程",
          merchantId: owner!.merchantId,
          rating: 4.2,
          ratingCount: 12,
          price: 288,
          snowCondition: "新雪",
          openStatus: "open" as const,
          description: "全局雪场介绍",
          customFields: { http_note: "全局授权备注" },
        };
        const body = await prepareGlobalResortSave(
          apiRequest,
          current,
          { schema: form.schema, values },
          signal(),
        );
        const saved = await saveGlobalResort(
          apiRequest,
          undefined,
          body,
          signal(),
        );
        globalResortReads.resortId = saved.resortId;
        expect(saved).toMatchObject({
          status: "draft",
          merchantId: owner!.merchantId,
          rating: "4.2",
          ratingCount: 12,
          customFields: [{ fieldKey: "http_note", value: "全局授权备注" }],
        });
        await denied(
          call(`/admin/resorts/${saved.resortId}`, {
            method: "PATCH",
            body: { customFields: { http_secret: "越权" } },
          }),
          422,
        );
        globalResortReads.fieldsFiltered = true;
        await denied(call(`/resorts/${saved.resortId}`), 404);
        await prepareGlobalCommand(
          apiRequest,
          current,
          saved,
          "publish",
          signal(),
        );
        const published = await runGlobalCommand(
          apiRequest,
          saved.resortId,
          "publish",
          signal(),
        );
        expect(published?.status).toBe("published");
        expect(await call(`/resorts/${saved.resortId}`)).toMatchObject({
          resortId: saved.resortId,
          name: values.name,
        });
        const list = await readGlobalResortPage(
          apiRequest,
          current,
          { page: 1, merchantId: owner!.merchantId, status: "published" },
          signal(),
        );
        expect(list.items.map((row) => row.resortId)).toEqual([saved.resortId]);
        expect(
          await readGlobalResort(apiRequest, current, saved.resortId, signal()),
        ).toEqual(published);
        globalResortReads.lifecycle = true;
      },
    );
    check(
      "reassigns a published resort and rating as admin, then offlines and republishes",
      async () => {
        active = "admin";
        const current = await getCurrentUser();
        const form = await readGlobalResortForm(
          apiRequest,
          current,
          globalResortReads.resortId,
          signal(),
        );
        const values = {
          ...initialGlobalResortInput(form.item, form.schema),
          merchantId: other!.merchantId,
          rating: 4.8,
          ratingCount: 99,
          description: "全局雪场调整后介绍",
        };
        const body = await prepareGlobalResortSave(
          apiRequest,
          current,
          { item: form.item, schema: form.schema, values },
          signal(),
        );
        let saved = await saveGlobalResort(
          apiRequest,
          globalResortReads.resortId,
          body,
          signal(),
        );
        expect(saved).toMatchObject({
          merchantId: other!.merchantId,
          rating: "4.8",
          ratingCount: 99,
          status: "published",
        });
        expect(await call(`/resorts/${saved.resortId}`)).toMatchObject({
          description: values.description,
        });
        await prepareGlobalCommand(
          apiRequest,
          current,
          saved,
          "offline",
          signal(),
        );
        saved = (await runGlobalCommand(
          apiRequest,
          saved.resortId,
          "offline",
          signal(),
        ))!;
        await denied(call(`/resorts/${saved.resortId}`), 404);
        await prepareGlobalCommand(
          apiRequest,
          current,
          saved,
          "publish",
          signal(),
        );
        await runGlobalCommand(apiRequest, saved.resortId, "publish", signal());
        await resortAccess();
        await denied(call(`/merchant/resorts/${saved.resortId}`), 404);
        globalResortReads.reassigned = true;
      },
    );
    check(
      "rejects global scope mismatches and actual read-time revocation",
      async () => {
        const transport = globalThis.fetch;
        try {
          await globalResortAccess("merchant");
          await denied(call("/admin/resorts?page=1&pageSize=20"), 403);
          await denied(
            call(`/admin/resorts/${globalResortReads.resortId}`),
            403,
          );
          await denied(
            call(`/admin/resorts/${globalResortReads.resortId}/offline`, {
              method: "PATCH",
            }),
            403,
          );
          globalResortReads.scopeRejected = true;
          const current = await globalResortAccess();
          let revoked = false;
          globalThis.fetch = async (input, init) => {
            const response = await transport(input, init),
              url = new URL(
                input instanceof Request ? input.url : String(input),
              );
            if (
              !revoked &&
              url.pathname ===
                `/api/v1/admin/resorts/${globalResortReads.resortId}`
            ) {
              revoked = true;
              await authorize(
                dashboardRole,
                summaryBaseGrants,
                "all",
                false,
                false,
              );
              active = "actor";
            }
            return response;
          };
          await expect(
            readGlobalResort(
              apiRequest,
              current,
              globalResortReads.resortId,
              signal(),
            ),
          ).rejects.toThrow("权限");
          expect(revoked).toBe(true);
          globalResortReads.revocationRejected = true;
        } finally {
          globalThis.fetch = transport;
        }
      },
    );
    check(
      "soft deletes the global resort and verifies empty filtered pages",
      async () => {
        try {
          active = "admin";
          const current = await getCurrentUser();
          const target = await readGlobalResort(
            apiRequest,
            current,
            globalResortReads.resortId,
            signal(),
          );
          await prepareGlobalCommand(
            apiRequest,
            current,
            target,
            "delete",
            signal(),
          );
          await runGlobalCommand(
            apiRequest,
            target.resortId,
            "delete",
            signal(),
          );
          await denied(call(`/admin/resorts/${target.resortId}`), 404);
          await denied(call(`/resorts/${target.resortId}`), 404);
          expect(
            await readGlobalResortPage(
              apiRequest,
              current,
              { page: 1, keyword: "HTTP全局雪场流程" },
              signal(),
            ),
          ).toMatchObject({ items: [], total: 0, hasNext: false });
          expect(
            (
              await readGlobalResortPage(
                apiRequest,
                current,
                { page: 2 },
                signal(),
              )
            ).items,
          ).toEqual([]);
          globalResortReads.deleted = true;
        } finally {
          await bind([readRole.roleId, writeRole.roleId]);
          active = "actor";
          actor = await getCurrentUser();
        }
      },
    );
    check(
      "creates and approves a community dynamic through configured moderation grants",
      async () => {
        const current = await communityAccess();
        expect(
          current.roles.some((role) => role.roleKey === "system_admin"),
        ).toBe(false);
        const created = await call<components["schemas"]["DynamicMutationVO"]>(
          "/dynamics",
          {
            method: "POST",
            body: { content: "HTTP社区完整流程", imageAssetIds: [] },
          },
        );
        communityReads.dynamicId = created.dynamicId;
        expect(created.status).toBe("pending");
        await denied(call(`/dynamics/${created.dynamicId}`), 404);
        const pending = await readModeratedDynamic(
          apiRequest,
          current,
          created.dynamicId,
          signal(),
        );
        expect(pending).toMatchObject({
          authorId: owner!.userId,
          imageUrls: [],
          moderationReason: null,
        });
        await moderate(
          current,
          { kind: "dynamic", item: pending, action: "approve" },
          " 首次审核 ",
        );
        expect(await call(`/dynamics/${created.dynamicId}`)).toMatchObject({
          content: "HTTP社区完整流程",
        });
        const page = await readModeratedDynamics(
          apiRequest,
          current,
          { page: 1, keyword: "http社区", status: "published" },
          signal(),
        );
        expect(page.items.map((item) => item.dynamicId)).toEqual([
          created.dynamicId,
        ]);
        expect(page.items[0]).toMatchObject({
          moderatedByUserId: owner!.userId,
          moderationReason: "首次审核",
        });
        expect(
          (
            await readModeratedDynamics(
              apiRequest,
              current,
              { page: 2 },
              signal(),
            )
          ).items,
        ).toEqual([]);
        communityReads.published = true;
      },
    );
    check(
      "rechecks published dynamic edits and admin hide/restore against public visibility",
      async () => {
        const id = communityReads.dynamicId;
        await communityAccess();
        expect(
          await call(`/dynamics/${id}`, {
            method: "PATCH",
            body: { content: "HTTP社区复审后内容" },
          }),
        ).toMatchObject({ status: "pending" });
        await denied(call(`/dynamics/${id}`), 404);
        active = "admin";
        const current = await getCurrentUser();
        for (const [action, reason] of [
          ["approve", "复审通过"],
          ["hide", "隐藏核对"],
          ["restore", "恢复公开"],
        ] as const) {
          const item = await readModeratedDynamic(
            apiRequest,
            current,
            id,
            signal(),
          );
          await moderate(current, { kind: "dynamic", item, action }, reason);
          const after = await readModeratedDynamic(
            apiRequest,
            current,
            id,
            signal(),
          );
          expect(after).toMatchObject({
            status: action === "hide" ? "hidden" : "published",
            moderationReason: reason,
            moderatedByUserId: current.userId,
          });
          if (action === "hide") await denied(call(`/dynamics/${id}`), 404);
          else
            expect(await call(`/dynamics/${id}`)).toMatchObject({
              content: "HTTP社区复审后内容",
            });
        }
        communityReads.reapproved = true;
      },
    );
    check(
      "moderates comments independently and retains hidden comments only in admin pagination",
      async () => {
        const current = await communityAccess(),
          id = communityReads.dynamicId;
        const created = await call<components["schemas"]["CommentMutationVO"]>(
          `/dynamics/${id}/comments`,
          { method: "POST", body: { content: "HTTP评论审核内容" } },
        );
        communityReads.commentId = created.commentId;
        for (const [action, reason] of [
          ["hide", "评论隐藏"],
          ["restore", "评论恢复"],
        ] as const) {
          const page = await readModeratedComments(
            apiRequest,
            current,
            id,
            1,
            signal(),
          );
          expect(page.items).toHaveLength(1);
          await moderate(
            current,
            { kind: "comment", item: page.items[0]!, page: 1, action },
            reason,
          );
          const after = await readModeratedComments(
            apiRequest,
            current,
            id,
            1,
            signal(),
          );
          expect(after.items[0]).toMatchObject({
            commentId: created.commentId,
            status: action === "hide" ? "hidden" : "visible",
            moderationReason: reason,
            moderatedByUserId: current.userId,
          });
          expect(
            await call(`/dynamics/${id}/comments?page=1&pageSize=20`),
          ).toMatchObject({ total: action === "hide" ? 0 : 1 });
        }
        await denied(
          call(`/admin/comments/${created.commentId}/moderation`, {
            method: "PATCH",
            body: { action: "restore", reason: "重复恢复" },
          }),
          409,
        );
        const item = (
          await readModeratedComments(apiRequest, current, id, 1, signal())
        ).items[0]!;
        await moderate(
          current,
          { kind: "comment", item, page: 1, action: "delete" },
          "",
        );
        expect(
          await readModeratedComments(apiRequest, current, id, 1, signal()),
        ).toMatchObject({ items: [], total: 0 });
        expect(
          (await readModeratedComments(apiRequest, current, id, 2, signal()))
            .items,
        ).toEqual([]);
        communityReads.commentsModerated = true;
      },
    );
    check(
      "rejects actual moderation revocation before ending a read then soft deletes the dynamic",
      async () => {
        const transport = globalThis.fetch,
          id = communityReads.dynamicId;
        try {
          const current = await communityAccess();
          let revoked = false;
          globalThis.fetch = async (input, init) => {
            const response = await transport(input, init),
              url = new URL(
                input instanceof Request ? input.url : String(input),
              );
            if (!revoked && url.pathname === `/api/v1/admin/dynamics/${id}`) {
              revoked = true;
              await authorize(
                dashboardRole,
                summaryBaseGrants,
                "all",
                false,
                false,
              );
              active = "actor";
            }
            return response;
          };
          await expect(
            readModeratedDynamic(apiRequest, current, id, signal()),
          ).rejects.toThrow("授权");
          expect(revoked).toBe(true);
          communityReads.revocationRejected = true;
          globalThis.fetch = transport;
          await denied(call(`/admin/dynamics/${id}`), 403);
          await denied(
            call(`/admin/dynamics/${id}/moderation`, {
              method: "PATCH",
              body: { action: "hide", reason: "撤权后操作" },
            }),
            403,
          );
          active = "admin";
          const adminIdentity = await getCurrentUser();
          const item = await readModeratedDynamic(
            apiRequest,
            adminIdentity,
            id,
            signal(),
          );
          await moderate(
            adminIdentity,
            { kind: "dynamic", item, action: "delete" },
            "",
          );
          await denied(call(`/admin/dynamics/${id}`), 404);
          await denied(
            call(`/admin/dynamics/${id}/comments?page=1&pageSize=20`),
            404,
          );
          await denied(call(`/dynamics/${id}`), 404);
          expect(
            await readModeratedDynamics(
              apiRequest,
              adminIdentity,
              { page: 1 },
              signal(),
            ),
          ).toMatchObject({ items: [], total: 0 });
          communityReads.deleted = true;
        } finally {
          globalThis.fetch = transport;
          await bind([readRole.roleId, writeRole.roleId]);
          active = "actor";
          actor = await getCurrentUser();
        }
      },
    );
    check(
      "reads private bigint assets using self and selected scopes with exact metadata projection",
      async () => {
        let current = await assetAccess("self");
        expect(
          current.roles.some((role) => role.roleKey === "system_admin"),
        ).toBe(false);
        const page = await readAssetInventory(
          apiRequest,
          current,
          { page: 1 },
          signal(),
        );
        expect(page.total).toBe(2);
        expect(page.items.map((item) => item.assetId).sort()).toEqual([
          fixture.assets.removableId,
          fixture.assets.ownId,
        ]);
        const own = await readAdminAsset(
          apiRequest,
          current,
          fixture.assets.ownId,
          signal(),
        );
        expect(own).toMatchObject({
          ownerUserId: owner!.userId,
          sizeBytes: "2048",
          status: "ready",
          references: { userAvatars: 0 },
        });
        expect(new URL(own.url!).searchParams.get("X-Amz-Expires")).toBe("900");
        expect(Object.keys(own).sort()).toEqual(
          [
            "assetId",
            "ownerUserId",
            "ownerAccount",
            "originalName",
            "mimeType",
            "sizeBytes",
            "status",
            "url",
            "references",
            "createdAt",
          ].sort(),
        );
        const raw = await call<Record<string, unknown>>(
          `/admin/assets/${fixture.assets.ownId}`,
        );
        expect(Object.keys(raw).sort()).toEqual(Object.keys(own).sort());
        await denied(call(`/admin/assets/${fixture.assets.foreignId}`), 404);
        expect(
          await readAssetInventory(apiRequest, current, { page: 2 }, signal()),
        ).toMatchObject({ items: [], total: 2 });
        current = await assetAccess("selected", [fixture.assets.removableId]);
        expect(
          (
            await readAssetInventory(apiRequest, current, { page: 1 }, signal())
          ).items.map((item) => item.assetId),
        ).toEqual([fixture.assets.removableId]);
        await denied(call(`/admin/assets/${fixture.assets.ownId}`), 404);
        current = await assetAccess("all");
        expect(
          await readAssetInventory(
            apiRequest,
            current,
            {
              page: 1,
              status: "ready",
              ownerUserId: String(fixture.actors[1]!.userId),
              keyword: "http媒体",
            },
            signal(),
          ),
        ).toMatchObject({
          total: 1,
          items: [{ assetId: fixture.assets.foreignId }],
        });
        await assetAccess("merchant");
        await denied(call("/admin/assets?page=1&pageSize=20"), 403);
        await denied(call(`/admin/assets/${fixture.assets.ownId}`), 403);
        assetReads.scopeIsolation = true;
      },
    );
    check(
      "protects a referenced avatar from media deletion and clears the association through profile API",
      async () => {
        const current = await assetAccess("self");
        await call("/account/profile", {
          method: "PATCH",
          body: { avatarAssetId: fixture.assets.ownId },
        });
        const referenced = await readAdminAsset(
          apiRequest,
          current,
          fixture.assets.ownId,
          signal(),
        );
        expect(referenced.references.userAvatars).toBe(1);
        await expect(
          prepareAssetDeletion(apiRequest, current, referenced, signal()),
        ).rejects.toThrow("引用");
        await denied(
          call(`/admin/assets/${fixture.assets.ownId}`, { method: "DELETE" }),
          422,
        );
        await call("/account/profile", {
          method: "PATCH",
          body: { avatarAssetId: null },
        });
        expect(
          (
            await readAdminAsset(
              apiRequest,
              current,
              fixture.assets.ownId,
              signal(),
            )
          ).references.userAvatars,
        ).toBe(0);
        assetReads.referencesProtected = true;
      },
    );
    check(
      "soft deletes unreferenced media through the production preflight and verifies the retained inventory row",
      async () => {
        const current = await assetAccess("self");
        const displayed = await readAdminAsset(
          apiRequest,
          current,
          fixture.assets.removableId,
          signal(),
        );
        expect(displayed).toMatchObject({ status: "rejected", url: null });
        const id = await prepareAssetDeletion(
          apiRequest,
          current,
          displayed,
          signal(),
        );
        await sendAssetDeletion(apiRequest, id, signal());
        expect(
          await readAdminAsset(apiRequest, current, id, signal()),
        ).toMatchObject({ status: "deleted", url: null });
        expect(
          await readAssetInventory(
            apiRequest,
            current,
            { page: 1, status: "deleted" },
            signal(),
          ),
        ).toMatchObject({ total: 1, items: [{ assetId: id }] });
        await expect(
          prepareAssetDeletion(
            apiRequest,
            current,
            { ...displayed, status: "deleted" },
            signal(),
          ),
        ).rejects.toThrow("停用");
        assetReads.deleted = true;
      },
    );
    check(
      "rejects real permission revocation while a media detail response is in flight",
      async () => {
        const transport = globalThis.fetch;
        try {
          const current = await assetAccess("self");
          let revoked = false;
          globalThis.fetch = async (input, init) => {
            const response = await transport(input, init),
              url = new URL(
                input instanceof Request ? input.url : String(input),
              );
            if (
              !revoked &&
              url.pathname === `/api/v1/admin/assets/${fixture.assets.ownId}`
            ) {
              revoked = true;
              await authorize(
                dashboardRole,
                summaryBaseGrants,
                "all",
                false,
                false,
              );
              active = "actor";
            }
            return response;
          };
          await expect(
            readAdminAsset(apiRequest, current, fixture.assets.ownId, signal()),
          ).rejects.toThrow("权限");
          expect(revoked).toBe(true);
          globalThis.fetch = transport;
          await denied(call(`/admin/assets/${fixture.assets.ownId}`), 403);
          await denied(
            call(`/admin/assets/${fixture.assets.ownId}`, { method: "DELETE" }),
            403,
          );
          assetReads.revocationRejected = true;
        } finally {
          globalThis.fetch = transport;
          await bind([readRole.roleId, writeRole.roleId]);
          active = "actor";
          actor = await getCurrentUser();
        }
      },
    );
    check(
      "projects live project knowledge metadata and exact filtered or later empty pages",
      async () => {
        active = "admin";
        admin = await getCurrentUser();
        const current = await readKnowledge(
          apiRequest,
          admin,
          fixture.rag.projectKnowledgeId,
          signal(),
        );
        expect(current).toMatchObject({
          title: "HTTP RAG公开项目知识",
          status: "published",
          version: 1,
        });
        const raw = await call<Record<string, unknown>>(
          `/admin/project-knowledge/${current.projectKnowledgeId}`,
        );
        expect(Object.keys(raw).sort()).toEqual(
          [
            "projectKnowledgeId",
            "title",
            "content",
            "category",
            "sourceUrl",
            "status",
            "publishTime",
            "version",
            "createTime",
            "updateTime",
          ].sort(),
        );
        const page = await readKnowledgePage(
          apiRequest,
          admin,
          { page: 1, keyword: "http rag公开项目知识", status: "published" },
          signal(),
        );
        expect(page).toMatchObject({
          items: [current],
          total: 1,
          pageSize: 20,
          hasNext: false,
        });
        knowledgeReads.rawProjection = true;
        expect(
          await readKnowledgePage(
            apiRequest,
            admin,
            { page: 2, keyword: "http rag公开项目知识", status: "published" },
            signal(),
          ),
        ).toMatchObject({ items: [], total: 1, hasNext: false });
        expect(
          await readKnowledgePage(
            apiRequest,
            admin,
            { page: 1, keyword: "http rag公开项目知识", status: "draft" },
            signal(),
          ),
        ).toMatchObject({ items: [], total: 0, hasNext: false });
        knowledgeReads.emptyPage = true;
      },
    );
    check(
      "rejects actual logout during project knowledge reads and recovers through explicit login",
      async () => {
        active = "admin";
        const transport = globalThis.fetch;
        try {
          admin = await getCurrentUser();
          let revoked = false;
          globalThis.fetch = async (input, init) => {
            const response = await transport(input, init),
              url = new URL(
                input instanceof Request ? input.url : String(input),
              );
            if (
              !revoked &&
              url.pathname ===
                `/api/v1/admin/project-knowledge/${fixture.rag.projectKnowledgeId}`
            ) {
              revoked = true;
              await logout();
            }
            return response;
          };
          await denied(
            readKnowledge(
              apiRequest,
              admin,
              fixture.rag.projectKnowledgeId,
              signal(),
            ),
            401,
          );
          expect(revoked).toBe(true);
          knowledgeReads.sessionRevocationRejected = true;
          globalThis.fetch = transport;
          await denied(
            call(`/admin/project-knowledge/${fixture.rag.projectKnowledgeId}`),
            401,
          );
        } finally {
          globalThis.fetch = transport;
          active = "admin";
          admin = await login({
            account: fixture.adminAccount,
            password: password!,
          });
          expect(
            (
              await readKnowledge(
                apiRequest,
                admin,
                fixture.rag.projectKnowledgeId,
                signal(),
              )
            ).projectKnowledgeId,
          ).toBe(fixture.rag.projectKnowledgeId);
          knowledgeReads.sessionRestored = true;
          active = "actor";
        }
      },
    );
    check(
      "manages hierarchical dictionary types/items using configurable grants and production receipt readers",
      async () => {
        try {
          await authorize(
            dashboardRole,
            [
              ...summaryBaseGrants,
              ...["list", "create", "update", "delete"].map(
                (action) => `system:dict:${action}`,
              ),
            ],
            "merchant",
            false,
            false,
          );
          await bind([dashboardRole.roleId]);
          active = "actor";
          const current = await getCurrentUser(),
            store = new DictionaryRecoveryLedger();
          expect(
            current.roles.some((role) => role.roleKey === "system_admin"),
          ).toBe(false);
          const gate = new DictionaryWriteGate(
            current.userId,
            (signal) =>
              apiRequest<User>("/auth/me", { signal, cache: "no-store" }),
            () => {},
            {
              user: current,
              has: () => store.state(current.userId) !== null,
              begin: (key) => store.begin(current.userId, key),
            },
          );
          const key = "http.dictionary_workflow";
          gate.activate();
          const execute = async <T>(
            action: string,
            write: (signal: AbortSignal) => Promise<T>,
          ) => {
            let result: T | undefined;
            expect(
              await gate.run(
                `system:dict:${action}`,
                async () => true,
                async (_value, signal) => {
                  result = await write(signal);
                },
                () => {},
                key,
              ),
            ).toEqual({ status: "success" });
            expect(store.state(current.userId)).toBeNull();
            return result!;
          };
          try {
            expect(
              await execute("create", (signal) =>
                saveDictionaryType(
                  apiRequest,
                  key,
                  {
                    dictType: key,
                    dictName: "HTTP字典流程",
                    groupKey: "http_dictionary",
                    publiclyReadable: false,
                  },
                  false,
                  signal,
                ),
              ),
            ).toMatchObject({ dictType: key, items: [] });
            const root = await execute("create", (signal) =>
              saveDictionaryItem(
                apiRequest,
                key,
                undefined,
                {
                  label: "父项",
                  value: "root",
                  parentId: null,
                  sortOrder: 0,
                  isDefault: false,
                },
                signal,
              ),
            );
            const child = await execute("create", (signal) =>
              saveDictionaryItem(
                apiRequest,
                key,
                undefined,
                {
                  label: "子项",
                  value: "child",
                  parentId: root.itemId,
                  sortOrder: 1,
                  isDefault: false,
                },
                signal,
              ),
            );
            dictionaryWrites.rootId = root.itemId;
            dictionaryWrites.childId = child.itemId;
            await denied(
              call(`/admin/dictionaries/${key}/items/${root.itemId}`, {
                method: "PATCH",
                body: { parentId: child.itemId },
              }),
              400,
            );
            dictionaryWrites.cycleRejected = true;
            await execute("update", (signal) =>
              saveDictionaryItem(
                apiRequest,
                key,
                child.itemId,
                {
                  label: "子项已更新",
                  value: "child_edited",
                  parentId: root.itemId,
                  color: "#CCFFCC",
                },
                signal,
              ),
            );
            await execute("update", (signal) =>
              saveDictionaryItem(
                apiRequest,
                key,
                root.itemId,
                { label: "父项已更新" },
                signal,
              ),
            );
            expect(
              (await readDictionaryDetail(apiRequest, current, key, signal()))
                .items[0]!.children,
            ).toMatchObject([
              {
                itemId: child.itemId,
                parentId: root.itemId,
                value: "child_edited",
              },
            ]);
            await execute("delete", (signal) =>
              disableDictionary(apiRequest, key, child.itemId, signal),
            );
            await execute("update", (signal) =>
              saveDictionaryType(
                apiRequest,
                key,
                { dictName: "HTTP字典流程已更新", publiclyReadable: true },
                true,
                signal,
              ),
            );
            await execute("delete", (signal) =>
              disableDictionary(apiRequest, key, undefined, signal),
            );
            const final = await readDictionaryDetail(
              apiRequest,
              current,
              key,
              signal(),
            );
            expect(final).toMatchObject({
              status: "disabled",
              publiclyReadable: true,
              items: [
                {
                  itemId: root.itemId,
                  status: "active",
                  children: [{ itemId: child.itemId, status: "disabled" }],
                },
              ],
            });
            expect(
              await readDictionaryPage(
                apiRequest,
                current,
                1,
                "http_dictionary",
                "active",
                signal(),
              ),
            ).toMatchObject({ total: 0, items: [] });
            expect(
              await readDictionaryPage(
                apiRequest,
                current,
                2,
                "http_dictionary",
                "disabled",
                signal(),
              ),
            ).toMatchObject({ total: 1, items: [] });
            dictionaryWrites.lifecycle = true;
          } finally {
            gate.dispose();
          }
        } finally {
          await bind([readRole.roleId, writeRole.roleId]);
          active = "actor";
        }
      },
    );
    check(
      "rejects dictionary data when actual role grants are revoked during a read",
      async () => {
        const transport = globalThis.fetch;
        try {
          await authorize(
            dashboardRole,
            [...summaryBaseGrants, "system:dict:list"],
            "merchant",
            false,
            false,
          );
          await bind([dashboardRole.roleId]);
          active = "actor";
          const current = await getCurrentUser();
          let revoked = false;
          globalThis.fetch = async (input, init) => {
            const response = await transport(input, init),
              url = new URL(
                input instanceof Request ? input.url : String(input),
              );
            if (
              !revoked &&
              url.pathname ===
                "/api/v1/admin/dictionaries/http.dictionary_workflow"
            ) {
              revoked = true;
              await bind([readRole.roleId, writeRole.roleId]);
              active = "actor";
            }
            return response;
          };
          await expect(
            readDictionaryDetail(
              apiRequest,
              current,
              "http.dictionary_workflow",
              signal(),
            ),
          ).rejects.toThrow();
          expect(revoked).toBe(true);
          dictionaryWrites.revocationRejected = true;
        } finally {
          globalThis.fetch = transport;
          await bind([readRole.roleId, writeRole.roleId]);
          active = "actor";
        }
      },
    );
    check(
      "saves versioned configuration and reconciles a committed response lost before client confirmation",
      async () => {
        active = "admin";
        admin = await getCurrentUser();
        const initial = await readConfigPage(
          apiRequest,
          admin,
          { keyword: "", page: 1, pageSize: 20 },
          signal(),
        );
        expect(initial.total).toBe(6);
        expect(initial.items.every((item) => item.version === 0)).toBe(true);
        expect(
          await readConfigPage(
            apiRequest,
            admin,
            { keyword: "SITE.NAME", page: 2, pageSize: 20 },
            signal(),
          ),
        ).toMatchObject({ total: 1, items: [] });
        configChecks.defaults = true;
        const publicRead = async () => {
          const response = await originalFetch(
            `${api.origin}/api/v1/public/config`,
            { credentials: "omit", redirect: "error", signal: signal() },
          );
          expect(response.status).toBe(200);
          const result = (await response.json()) as {
            data: components["schemas"]["PublicSiteConfigVO"];
          };
          expect(Object.keys(result.data).sort()).toEqual(
            [
              "siteName",
              "tagline",
              "about",
              "contactEmail",
              "privacyPolicy",
              "termsOfService",
              "revision",
            ].sort(),
          );
          return result.data;
        };
        const beforePublic = await publicRead(),
          ledger = new ConfigRecoveryLedger(),
          gate = new ConfigWriteGate(
            admin,
            (signal) =>
              apiRequest<User>("/auth/me", { signal, cache: "no-store" }),
            ledger,
            () => {},
          );
        const name = await readConfigItem(
          apiRequest,
          admin,
          "site.name",
          signal(),
        );
        gate.activate();
        try {
          expect(
            await gate.run(
              { configKey: name.configKey },
              (signal) =>
                prepareConfigSave(
                  apiRequest,
                  admin,
                  name,
                  "HTTP凛迹雪客",
                  signal,
                ),
              (body, signal) => writeConfig(apiRequest, name, body, signal),
              () => {},
            ),
          ).toEqual({ status: "success" });
          await denied(
            call("/admin/config/site.name", {
              method: "PATCH",
              body: { value: "旧版本不得覆盖", expectedVersion: name.version },
            }),
            409,
          );
          configChecks.versionConflict = true;
          const current = await readConfigItem(
            apiRequest,
            admin,
            name.configKey,
            signal(),
          );
          expect(current.version).toBe(1);
          const transport = globalThis.fetch;
          let dropped = false;
          try {
            globalThis.fetch = async (input, init) => {
              const response = await transport(input, init),
                url = new URL(
                  input instanceof Request ? input.url : String(input),
                );
              if (
                !dropped &&
                init?.method === "PATCH" &&
                url.pathname === "/api/v1/admin/config/site.name" &&
                response.ok
              ) {
                dropped = true;
                throw new TypeError("synthetic committed response loss");
              }
              return response;
            };
            expect(
              await gate.run(
                { configKey: current.configKey },
                (signal) =>
                  prepareConfigSave(
                    apiRequest,
                    admin,
                    current,
                    "HTTP凛迹雪客更新",
                    signal,
                  ),
                (body, signal) =>
                  writeConfig(apiRequest, current, body, signal),
                () => {},
              ),
            ).toMatchObject({ status: "error", uncertain: true });
            expect(dropped).toBe(true);
            expect(ledger.entries(admin.userId)).toHaveLength(1);
            expect(
              await gate.run(
                { configKey: current.configKey },
                async () => {
                  throw new Error("Must not replay");
                },
                async () => {},
                () => {},
              ),
            ).toEqual({ status: "ignored" });
          } finally {
            globalThis.fetch = transport;
          }
          const summaries = await reviewConfigWrites(
            apiRequest,
            admin,
            ledger.entries(admin.userId).map((entry) => entry.mutation),
            signal(),
          );
          expect(summaries[0]).toContain("版本 2");
          expect(summaries[0]).not.toContain("HTTP凛迹雪客更新");
          expect(
            (await readConfigItem(apiRequest, admin, "site.name", signal()))
              .value,
          ).toBe("HTTP凛迹雪客更新");
          expect(ledger.acknowledge(admin.userId, ledger.version)).toBe(true);
          configChecks.unknownRecovered = true;
          const policy = await readConfigItem(
            apiRequest,
            admin,
            "site.privacyPolicy",
            signal(),
          );
          expect(
            await gate.run(
              { configKey: policy.configKey },
              (signal) =>
                prepareConfigSave(
                  apiRequest,
                  admin,
                  policy,
                  "<b>HTTP合成政策</b>\n用于隔离验证",
                  signal,
                ),
              (body, signal) => writeConfig(apiRequest, policy, body, signal),
              () => {},
            ),
          ).toEqual({ status: "success" });
          const published = await publicRead();
          expect(published.siteName).toBe("HTTP凛迹雪客更新");
          expect(published.privacyPolicy).toBe(
            "<b>HTTP合成政策</b>\n用于隔离验证",
          );
          expect(published.revision).toMatch(/^[a-f0-9]{64}$/);
          expect(published.revision).not.toBe(beforePublic.revision);
          configChecks.publicProjection = true;
        } finally {
          gate.dispose();
          active = "actor";
        }
      },
    );
    check(
      "rejects nonadministrator configuration grants and actual logout during configuration reads",
      async () => {
        try {
          await authorize(
            dashboardRole,
            [
              ...summaryBaseGrants,
              "system:config:list",
              "system:config:update",
            ],
            "merchant",
            false,
            false,
          );
          await bind([dashboardRole.roleId]);
          active = "actor";
          await denied(call("/admin/config"), 403);
          await denied(
            call("/admin/config/site.name", {
              method: "PATCH",
              body: { value: "拒绝的覆盖", expectedVersion: 2 },
            }),
            403,
          );
          configChecks.roleDenied = true;
        } finally {
          await bind([readRole.roleId, writeRole.roleId]);
          active = "admin";
        }
        const transport = globalThis.fetch;
        try {
          admin = await getCurrentUser();
          let revoked = false;
          globalThis.fetch = async (input, init) => {
            const response = await transport(input, init),
              url = new URL(
                input instanceof Request ? input.url : String(input),
              );
            if (!revoked && url.pathname === "/api/v1/admin/config") {
              revoked = true;
              await logout();
            }
            return response;
          };
          await denied(
            readConfigItem(apiRequest, admin, "site.name", signal()),
            401,
          );
          expect(revoked).toBe(true);
          configChecks.sessionRevocationRejected = true;
        } finally {
          globalThis.fetch = transport;
          active = "admin";
          admin = await login({
            account: fixture.adminAccount,
            password: password!,
          });
          expect(
            (await readConfigItem(apiRequest, admin, "site.name", signal()))
              .version,
          ).toBe(2);
          configChecks.sessionRestored = true;
          active = "actor";
        }
      },
    );
    check(
      "replaces account roles and rejects a removed action using the still-valid original session",
      async () => {
        await bind([readRole.roleId]);
        active = "admin";
        expect(
          (await readAccountTarget(owner!.userId, signal())).roles.map(
            (role) => role.roleId,
          ),
        ).toEqual([readRole.roleId]);
        active = "actor";
        const me = await getCurrentUser();
        expect(me.permissionKeys).not.toContain("resort:merchant:update");
        await denied(
          call(`/merchant/resorts/${owner!.resortId}`, {
            method: "PATCH",
            body: { description: "已撤销操作权限" },
          }),
          403,
        );
        expect(
          (await readResort(apiRequest, me, owner!.resortId, signal()))
            .description,
        ).toBe("权限联调已保存介绍");
        expect(
          requests.some(
            (r) =>
              r.actor === "actor" &&
              r.method === "PATCH" &&
              r.status === 200 &&
              r.csrf,
          ),
        ).toBe(true);
      },
    );
  },
);
