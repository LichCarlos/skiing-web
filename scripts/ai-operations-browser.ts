import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";

// Web owns only browser interactions. A separately prepared Backend fixture is
// passed through environment data; this script never imports another repository.
const origin = new URL(
  process.env.AI_BROWSER_WEB_ORIGIN ?? "http://localhost:3001",
);
const api = new URL(
  process.env.AI_BROWSER_API_BASE_URL ?? "http://localhost:18080/api/v1",
);
for (const url of [origin, api]) {
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error("Only loopback validation services are accepted");
}
const fixture = JSON.parse(process.env.AI_BROWSER_FIXTURE_JSON ?? "null") as {
  runId: string;
  databaseName: string;
  adminAccount: string;
  auditorAccount: string;
  metadataAccount: string;
  customRagAccount: string;
  registeredAccount: string;
  conversationId: string;
  deletedConversationId: string;
  foreignConversationId: string;
  ragDocumentId: number;
  sourceTitle: string;
  privateQuestion: string;
  privateAnswer: string;
};
const password = process.env.AI_BROWSER_FIXTURE_PASSWORD;
if (
  !fixture?.databaseName?.startsWith("linji_browser_validation_") ||
  !password
)
  throw new Error("Synthetic isolated fixture JSON and password are required");
const output = "test-results/ai-operations";
let browser: Browser;
const contexts: BrowserContext[] = [];
const runtimeErrors: string[] = [];
const auditPath = `/admin/ai/conversations/${fixture.conversationId}`;
const ragPath = `/admin/ai/sources/${fixture.ragDocumentId}`;
const apiPath = api.pathname.replace(/\/$/, "");

async function pageFor(account: string, width = 1440) {
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
  });
  contexts.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  await page.goto(new URL("/login", origin).href);
  await page.getByLabel("账号", { exact: true }).fill(account);
  await page.getByLabel("密码", { exact: true }).fill(password!);
  await page.getByRole("button", { name: /^登\s*录$/ }).click();
  if (account === fixture.registeredAccount) {
    await page
      .getByRole("heading", { name: "当前账号未获管理端授权" })
      .waitFor();
  } else {
    await page.waitForURL((url) => url.pathname.startsWith("/admin"));
    await page.getByRole("navigation", { name: "管理端导航" }).waitFor();
  }
  return { page, context };
}
async function go(page: Page, path: string, heading: string) {
  await page.goto(new URL(path, origin).href);
  await page.getByRole("heading", { name: heading, exact: true }).waitFor();
}
async function read(page: Page, reason: string) {
  await page.getByLabel("读取正文原因（1–500字）").fill(reason);
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith(`${apiPath}${auditPath}/content-access`) &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "记录审计并读取正文" }).click();
  const result = await response;
  assert.equal(result.status(), 200);
  assert.equal(result.headers()["cache-control"], "no-store");
  await page.getByText(fixture.privateQuestion, { exact: true }).waitFor();
}
async function noPrivateContent(page: Page) {
  // Lifecycle handlers schedule a React update; wait for the committed DOM.
  // A persistent leak still fails within the explicit two-second bound.
  await page.waitForFunction(
    (secrets) =>
      secrets.every((secret) => !document.body.innerText.includes(secret)),
    [
      fixture.privateQuestion,
      fixture.privateAnswer,
      `${fixture.runId}-secret-title`,
    ],
    { timeout: 2000 },
  );
  const body = await page.locator("body").innerText();
  assert.ok(!body.includes(fixture.privateQuestion));
  assert.ok(!body.includes(fixture.privateAnswer));
  assert.ok(!body.includes(`${fixture.runId}-secret-title`));
}
async function ensureRagEnabled(page: Page) {
  await page.getByLabel("操作原因（1–500字）").waitFor();
  const enable = page.getByRole("button", {
    name: "解除人工停用并排队重建",
    exact: true,
  });
  if (await enable.count()) {
    await page
      .getByLabel("操作原因（1–500字）")
      .fill("Browser restore test precondition");
    await enable.click();
    await page
      .getByRole("button", { name: "人工停用并清除分块", exact: true })
      .waitFor();
    await page.getByRole("status").filter({ hasText: "已受理" }).waitFor();
  }
}

describe(
  "AI operations browser / real Next, Nest and isolated PostgreSQL",
  { concurrency: false },
  () => {
    before(async () => {
      await mkdir(output, { recursive: true });
      browser = await chromium.launch({
        headless: true,
        executablePath:
          process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      });
    });
    after(async () => {
      for (const context of contexts) await context.close();
      await browser?.close();
      assert.deepEqual(runtimeErrors, [], "Uncaught browser runtime errors");
    });

    it(
      "logs in through the real form with protected cookies and reads only audit metadata until an explicit reason is submitted",
      { timeout: 120_000 },
      async () => {
        const { page, context } = await pageFor(fixture.auditorAccount);
        const cookies = await context.cookies(`${api.href}/auth`);
        for (const name of ["linji_access", "linji_refresh"]) {
          const cookie = cookies.find((c) => c.name === name);
          assert.ok(
            cookie?.secure && cookie.httpOnly && cookie.sameSite === "Lax",
          );
        }
        await go(page, "/admin/ai/conversations", "AI 会话审计");
        await page
          .getByRole("link", { name: fixture.conversationId, exact: true })
          .waitFor();
        await noPrivateContent(page);
        await page
          .getByRole("link", { name: fixture.conversationId, exact: true })
          .click();
        await page.getByLabel("读取正文原因（1–500字）").waitFor();
        await noPrivateContent(page);
        await read(page, "  Browser approved review  ");
        const stored = await page.evaluate(() =>
          JSON.stringify([localStorage, sessionStorage]),
        );
        assert.ok(
          !stored.includes(fixture.privateQuestion) &&
            !stored.includes(fixture.privateAnswer),
        );
        await page.screenshot({
          path: `${output}/audited-content-desktop.png`,
          fullPage: true,
        });
        await page
          .getByRole("button", { name: "清除已读取正文", exact: true })
          .click();
        await noPrivateContent(page);
        await page.getByRole("button", { name: "记录审计并读取正文" }).click();
        await page
          .getByRole("alert")
          .filter({ hasText: "操作原因须为 1–500 字" })
          .waitFor();
        await page.close();
      },
    );

    it(
      "keeps metadata-only operators out of the content API and blocks ordinary accounts and custom RAG roles",
      { timeout: 120_000 },
      async () => {
        const { page } = await pageFor(fixture.metadataAccount);
        let contentRequests = 0;
        page.on("request", (request) => {
          if (request.url().includes("/content-access")) contentRequests++;
        });
        await go(page, auditPath, "AI 会话审计详情");
        await page
          .getByText("未获独立正文读取权限，仅可查看元数据。")
          .waitFor();
        assert.equal(
          await page
            .getByRole("button", { name: "记录审计并读取正文" })
            .count(),
          0,
        );
        await noPrivateContent(page);
        assert.equal(contentRequests, 0);
        await page.close();
        const custom = await pageFor(fixture.customRagAccount);
        await custom.page.goto(new URL(ragPath, origin).href);
        await custom.page
          .getByRole("heading", { name: "当前账号未获此页面授权" })
          .waitFor();
        await custom.page.close();
        const registered = await pageFor(fixture.registeredAccount);
        await registered.page.goto(new URL(auditPath, origin).href);
        await registered.page
          .getByRole("heading", { name: "当前账号未获此页面授权" })
          .waitFor();
        await registered.page.close();
      },
    );

    it(
      "clears audited content on metadata reload, route navigation and a page lifecycle event",
      { timeout: 120_000 },
      async () => {
        const { page } = await pageFor(fixture.auditorAccount);
        await go(page, auditPath, "AI 会话审计详情");
        await read(page, "Browser metadata refresh review");
        await page
          .getByRole("button", { name: "重新加载元数据并清除正文" })
          .click();
        await noPrivateContent(page);
        await read(page, "Browser lifecycle review");
        // Controlled lifecycle injection in Chromium; this is not an OS hide test.
        await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
        await noPrivateContent(page);
        await read(page, "Browser navigation review");
        await page
          .getByRole("link", { name: "返回会话列表", exact: true })
          .click();
        await page
          .getByRole("heading", { name: "AI 会话审计", exact: true })
          .waitFor();
        await noPrivateContent(page);
        await page.close();
      },
    );

    it(
      "discards a delayed audited response after the page lifecycle clears content",
      { timeout: 120_000 },
      async () => {
        const { page } = await pageFor(fixture.auditorAccount);
        await go(page, auditPath, "AI 会话审计详情");
        await page.getByLabel("读取正文原因（1–500字）").waitFor();
        let fetched!: () => void;
        let release!: () => void;
        const committed = new Promise<void>((resolve) => {
          fetched = resolve;
        });
        const delivery = new Promise<void>((resolve) => {
          release = resolve;
        });
        const endpoint = `${api.href}${auditPath}/content-access`;
        await page.route(endpoint, async (route) => {
          const response = await route.fetch();
          assert.equal(response.status(), 200);
          fetched();
          await delivery;
          // The browser may already have aborted the request on pagehide.
          await route.fulfill({ response }).catch(() => undefined);
        });
        try {
          await page
            .getByLabel("读取正文原因（1–500字）")
            .fill("Browser delayed-response review");
          await page
            .getByRole("button", { name: "记录审计并读取正文" })
            .click();
          await committed;
          await page.evaluate(() =>
            window.dispatchEvent(new Event("pagehide")),
          );
        } finally {
          release();
        }
        await page
          .getByRole("button", { name: "记录审计并读取正文" })
          .waitFor({ state: "visible" });
        await page.waitForFunction(
          () => !document.querySelector("button.ant-btn-loading"),
        );
        await noPrivateContent(page);
        await page.unroute(endpoint);
        await read(page, "Browser review after cancelled response");
        await page.close();
      },
    );

    it(
      "requires a refresh after a competing real source update causes a version conflict",
      { timeout: 120_000 },
      async () => {
        const { page, context } = await pageFor(fixture.adminAccount);
        await go(page, ragPath, `来源索引详情 #${fixture.ragDocumentId}`);
        await ensureRagEnabled(page);
        const current = await context.request.get(
          `${api.href}/admin/ai/sources/${fixture.ragDocumentId}`,
        );
        assert.equal(current.status(), 200);
        const source = (await current.json()).data;
        const csrf = (await context.cookies(`${api.href}/auth`)).find(
          (cookie) => cookie.name === "linji_csrf",
        );
        assert.ok(csrf);
        const competing = await context.request.patch(
          `${api.href}/admin/ai/sources/${fixture.ragDocumentId}/status`,
          {
            headers: { Origin: origin.origin, "X-CSRF-Token": csrf.value },
            data: {
              expectedVersion: source.controlVersion,
              enabled: false,
              reason: "Browser competing source update",
            },
          },
        );
        assert.equal(competing.status(), 200);
        await page
          .getByLabel("操作原因（1–500字）")
          .fill("Browser stale version review");
        const conflict = page.waitForResponse(
          (response) =>
            response
              .url()
              .endsWith(`/sources/${fixture.ragDocumentId}/reindex`) &&
            response.request().method() === "POST",
        );
        await page
          .getByRole("button", { name: "受理重建", exact: true })
          .click();
        assert.equal((await conflict).status(), 409);
        await page
          .getByText("已停止提交。原因已保留，请重新加载并核对结果后再操作。")
          .waitFor();
        assert.equal(
          await page.getByLabel("操作原因（1–500字）").inputValue(),
          "Browser stale version review",
        );
        assert.equal(
          await page
            .getByRole("button", { name: "人工停用并清除分块", exact: true })
            .isDisabled(),
          true,
        );
        await page.getByRole("button", { name: "重新加载版本与状态" }).click();
        await page
          .getByRole("button", { name: "解除人工停用并排队重建", exact: true })
          .waitFor();
        await page.close();
      },
    );

    it(
      "disables, enables and queues a rebuild using current versions with real persisted responses",
      { timeout: 120_000 },
      async () => {
        const { page } = await pageFor(fixture.adminAccount);
        await go(page, ragPath, `来源索引详情 #${fixture.ragDocumentId}`);
        await page.getByText(fixture.sourceTitle, { exact: true }).waitFor();
        await ensureRagEnabled(page);
        for (const [button, reason, expectedDisabled, expectedStatus] of [
          ["人工停用并清除分块", "Browser disable source", true, "disabled"],
          ["解除人工停用并排队重建", "Browser enable source", false, "pending"],
          ["受理重建", "Browser force rebuild", false, "pending"],
        ] as const) {
          await page.getByLabel("操作原因（1–500字）").fill(reason);
          const pending = page.waitForResponse(
            (r) =>
              r
                .url()
                .startsWith(
                  `${api.href}/admin/ai/sources/${fixture.ragDocumentId}/`,
                ) && ["POST", "PATCH"].includes(r.request().method()),
          );
          await page.getByRole("button", { name: button, exact: true }).click();
          const response = await pending;
          assert.ok([200, 202].includes(response.status()));
          const data = (await response.json()).data;
          assert.equal(data.source.manualDisabled, expectedDisabled);
          assert.equal(data.source.status, expectedStatus);
          assert.equal(data.source.chunkCount, 0);
          await page
            .getByRole("status")
            .filter({ hasText: expectedDisabled ? "人工开关已保存" : "已受理" })
            .waitFor();
        }
        await page.screenshot({
          path: `${output}/rag-pending-desktop.png`,
          fullPage: true,
        });
        await page.close();
      },
    );

    it(
      "treats a committed command with a lost response as unknown and requires a manual reload instead of replay",
      { timeout: 120_000 },
      async () => {
        const { page } = await pageFor(fixture.adminAccount);
        await go(page, ragPath, `来源索引详情 #${fixture.ragDocumentId}`);
        await ensureRagEnabled(page);
        let requests = 0;
        await page.route(
          `${api.href}/admin/ai/sources/${fixture.ragDocumentId}/status`,
          async (route) => {
            requests++;
            const response = await route.fetch(); // The real backend commits first.
            assert.equal(response.status(), 200);
            await route.abort("failed");
          },
        );
        await page
          .getByLabel("操作原因（1–500字）")
          .fill("Browser lost-response review");
        await page
          .getByRole("button", { name: "人工停用并清除分块", exact: true })
          .click();
        await page
          .getByText("已停止提交。原因已保留，请重新加载并核对结果后再操作。")
          .waitFor();
        assert.equal(requests, 1);
        assert.equal(
          await page.getByLabel("操作原因（1–500字）").inputValue(),
          "Browser lost-response review",
        );
        assert.equal(
          await page
            .getByRole("button", { name: "受理重建", exact: true })
            .isDisabled(),
          true,
        );
        await page.unroute(
          `${api.href}/admin/ai/sources/${fixture.ragDocumentId}/status`,
        );
        await page.getByRole("button", { name: "重新加载版本与状态" }).click();
        await page
          .getByRole("button", { name: "解除人工停用并排队重建", exact: true })
          .waitFor();
        assert.equal(requests, 1);
        await page.close();
      },
    );

    it(
      "renders narrow audit and RAG details without leaking content into a metadata view",
      { timeout: 120_000 },
      async () => {
        const { page } = await pageFor(fixture.adminAccount, 390);
        await go(page, auditPath, "AI 会话审计详情");
        await page.getByLabel("读取正文原因（1–500字）").waitFor();
        await noPrivateContent(page);
        const navigation = await page
          .getByRole("navigation", { name: "管理端导航" })
          .boundingBox();
        assert.ok(
          navigation && navigation.height < 110,
          "Narrow navigation must not stretch into a blank grid row",
        );
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 2,
          ),
        );
        await page.screenshot({
          path: `${output}/audit-metadata-narrow.png`,
          fullPage: true,
        });
        await go(page, ragPath, `来源索引详情 #${fixture.ragDocumentId}`);
        await page.getByLabel("操作原因（1–500字）").waitFor();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        assert.ok(
          overflow <= 2,
          `Narrow page horizontal overflow: ${overflow}px`,
        );
        await page.screenshot({
          path: `${output}/rag-detail-narrow.png`,
          fullPage: true,
        });
        await page.close();
      },
    );
  },
);
