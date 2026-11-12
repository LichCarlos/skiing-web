import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";

const origin = new URL(
  process.env.PASSWORD_BROWSER_WEB_ORIGIN ?? "http://localhost:3001",
);
const api = new URL(
  process.env.PASSWORD_BROWSER_API_BASE_URL ?? "http://localhost:8080/api/v1",
);
for (const url of [origin, api]) {
  if (!["localhost", "127.0.0.1"].includes(url.hostname))
    throw new Error("Loopback services required");
}
const fixture = JSON.parse(
  process.env.PASSWORD_BROWSER_FIXTURE_JSON ?? "null",
) as {
  databaseName: string;
  adminAccount: string;
  adminId: number;
  targetAccount: string;
  targetId: number;
  limitedAccount: string;
};
const password = process.env.PASSWORD_BROWSER_FIXTURE_PASSWORD;
if (fixture?.databaseName !== "linji_password_validation" || !password)
  throw new Error("Synthetic disposable fixture and password required");
const replacement = "browser-reset-replacement";
let browser: Browser, page: Page;
const contexts: BrowserContext[] = [],
  errors: string[] = [];
const resetUrl = `${api.href}/admin/users/${fixture.targetId}/password`;
async function login(account: string) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  contexts.push(context);
  const current = await context.newPage();
  current.setDefaultTimeout(20_000);
  current.on("pageerror", (error) => errors.push(error.message));
  await current.goto(new URL("/login", origin).href);
  await current.getByLabel("账号", { exact: true }).fill(account);
  await current.getByLabel("密码", { exact: true }).fill(password!);
  await current.getByRole("button", { name: /^登\s*录$/ }).click();
  await current.waitForURL((url) => url.pathname.startsWith("/admin"));
  await current.getByRole("navigation", { name: "管理端导航" }).waitFor();
  return current;
}
async function detail(current: Page, id = fixture.targetId) {
  await current.goto(new URL(`/admin/system/users/${id}`, origin).href);
  await current
    .getByRole("heading", { name: "账号详情", exact: true })
    .waitFor();
  await current.getByText("正在加载账号详情…").waitFor({ state: "hidden" });
}
async function fill(current: Page, reason: string) {
  await current.getByLabel("新密码", { exact: true }).fill(replacement);
  await current.getByLabel("重置原因", { exact: true }).fill(reason);
  await current
    .getByRole("checkbox", { name: "确认重置上述账号密码并退出其全部会话" })
    .check();
}
describe(
  "Password reset / real browser, Nest, PostgreSQL",
  { concurrency: false },
  () => {
    before(async () => {
      await mkdir("test-results/password-reset", { recursive: true });
      browser = await chromium.launch({
        headless: true,
        executablePath:
          process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      });
      page = await login(fixture.adminAccount);
    });
    after(async () => {
      for (const context of contexts) await context.close();
      await browser?.close();
      assert.deepEqual(errors, []);
    });
    it(
      "commits once and revokes a pre-existing target session",
      { timeout: 90_000 },
      async () => {
        const target = await browser.newContext();
        contexts.push(target);
        const response = await target.request.post(`${api.href}/auth/login`, {
          data: { account: fixture.targetAccount, password },
        });
        assert.equal(response.status(), 200);
        const token = (await response.json()).data.accessToken as string;
        assert.ok(token);
        await detail(page);
        await fill(page, "Synthetic browser successful reset");
        const result = page.waitForResponse(
          (r) => r.url() === resetUrl && r.request().method() === "PATCH",
        );
        await page
          .getByRole("button", { name: "确认重置密码", exact: true })
          .click();
        assert.equal((await result).status(), 204);
        await page
          .getByRole("status")
          .filter({ hasText: "密码已重置" })
          .waitFor();
        assert.equal(
          await page.getByLabel("新密码", { exact: true }).inputValue(),
          "",
        );
        assert.equal(
          await page.getByLabel("重置原因", { exact: true }).inputValue(),
          "",
        );
        const revoked = await target.request.get(`${api.href}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        assert.equal(revoked.status(), 401);
      },
    );
    it(
      "does not replay a committed command after its response is lost",
      { timeout: 90_000 },
      async () => {
        let writes = 0;
        await page.route(resetUrl, async (route) => {
          if (route.request().method() !== "PATCH") return route.continue();
          writes++;
          const result = await route.fetch();
          assert.equal(result.status(), 204);
          await route.abort("connectionfailed");
        });
        await fill(page, "Synthetic browser response lost after commit");
        await page
          .getByRole("button", { name: "确认重置密码", exact: true })
          .click();
        await page
          .getByRole("alert")
          .filter({ hasText: "重置结果尚未确认" })
          .waitFor();
        assert.equal(writes, 1);
        assert.ok(
          await page.getByLabel("新密码", { exact: true }).isDisabled(),
        );
        assert.ok(
          await page
            .getByRole("button", { name: "确认已核对", exact: true })
            .isDisabled(),
        );
        await page
          .getByRole("checkbox", { name: "我已人工核对，允许发起新的重置命令" })
          .check();
        await page
          .getByRole("button", { name: "确认已核对", exact: true })
          .click();
        assert.ok(await page.getByLabel("新密码", { exact: true }).isEnabled());
        assert.equal(writes, 1);
        await page.unroute(resetUrl);
      },
    );
    it(
      "hides reset for a custom role even with the independent grant; API denies it",
      { timeout: 90_000 },
      async () => {
        const limited = await login(fixture.limitedAccount);
        await detail(limited);
        await limited
          .getByText(fixture.targetAccount, { exact: true })
          .waitFor();
        assert.equal(
          await limited
            .getByRole("heading", { name: "重置密码", exact: true })
            .count(),
          0,
        );
        const context = await browser.newContext();
        contexts.push(context);
        const auth = await context.request.post(`${api.href}/auth/login`, {
          data: { account: fixture.limitedAccount, password },
        });
        assert.equal(auth.status(), 200);
        const token = (await auth.json()).data.accessToken as string;
        const result = await context.request.patch(resetUrl, {
          headers: { Authorization: `Bearer ${token}` },
          data: {
            newPassword: replacement,
            reason: "Denied synthetic attempt",
          },
        });
        assert.equal(result.status(), 403);
      },
    );
    it(
      "fits a 390px viewport and records the empty reset form",
      { timeout: 60_000 },
      async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page
          .getByRole("heading", { name: "重置密码", exact: true })
          .scrollIntoViewIfNeeded();
        const widths = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          viewport: innerWidth,
        }));
        assert.ok(widths.scroll <= widths.viewport + 1);
        await page.screenshot({
          path: "test-results/password-reset/account-390.png",
          fullPage: true,
        });
      },
    );
    it(
      "clears the current session and returns to login after self reset",
      { timeout: 90_000 },
      async () => {
        await detail(page, fixture.adminId);
        await fill(page, "Synthetic browser self reset");
        await page
          .getByRole("button", { name: "确认重置密码", exact: true })
          .click();
        await page.waitForURL((url) => url.pathname === "/login");
        await page.getByLabel("账号", { exact: true }).waitFor();
        assert.equal(
          await page
            .getByRole("heading", { name: "重置密码", exact: true })
            .count(),
          0,
        );
      },
    );
  },
);
