import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";

function localUrl(key: string): URL {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is required`);
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(`${key} must be a loopback service URL`);
  return url;
}

const site = localUrl("ISOLATED_WEB_ORIGIN");
const admin = localUrl("ISOLATED_ADMIN_ORIGIN");
const api = localUrl("ISOLATED_API_BASE_URL");
const account = process.env.ISOLATED_ADMIN_ACCOUNT;
const password = process.env.ISOLATED_ADMIN_PASSWORD;
if (
  process.env.ISOLATED_DATABASE_NAME !== "linji_isolated_validation" ||
  !account?.startsWith("isolated_") ||
  !password ||
  api.hostname !== admin.hostname ||
  api.protocol !== admin.protocol
)
  throw new Error(
    "Disposable database marker and synthetic admin credentials required",
  );

let browser: Browser;
const contexts: BrowserContext[] = [];
const errors: string[] = [];
const endpoint = (path: string) => `${api.href.replace(/\/$/, "")}${path}`;
async function pageAt(origin: URL, width = 1440): Promise<Page> {
  const context = await browser.newContext({
    baseURL: origin.origin,
    viewport: { width, height: width === 390 ? 844 : 1000 },
  });
  contexts.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.on("pageerror", (error) => errors.push(error.message));
  return page;
}
async function login(page: Page, username: string, secret: string) {
  await page.goto("/login");
  await page.getByLabel("账号", { exact: true }).fill(username);
  await page.getByLabel("密码", { exact: true }).fill(secret);
  const result = page.waitForResponse(
    (response) =>
      response.url() === endpoint("/auth/login") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: /^登\s*录$/ }).click();
  const response = await result;
  assert.equal(response.status(), 200);
  const body = (await response.json()).data;
  assert.equal(body.accessToken, undefined);
  assert.equal(body.refreshToken, undefined);
}

describe(
  "Independent production services / real browser, Nest, PostgreSQL",
  { concurrency: false },
  () => {
    before(async () => {
      await mkdir("test-results/independent-start", { recursive: true });
      browser = await chromium.launch({
        headless: true,
        executablePath:
          process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      });
    });
    after(async () => {
      for (const context of contexts) await context.close();
      await browser?.close();
      assert.deepEqual(errors, []);
    });

    it(
      "renders real empty public data and a narrow home page",
      { timeout: 60_000 },
      async () => {
        const page = await pageAt(site, 390);
        const response = await page.goto("/");
        assert.equal(response?.status(), 200);
        await page.getByRole("navigation", { name: "主导航" }).waitFor();
        await page.getByText("雪场资料正在整理中", { exact: true }).waitFor();
        await page.getByText("暂时没有公开文章", { exact: true }).waitFor();
        await page.getByText("还没有公开动态", { exact: true }).waitFor();
        const widths = await page.evaluate(() => ({
          actual: document.documentElement.scrollWidth,
          viewport: innerWidth,
        }));
        assert.ok(widths.actual <= widths.viewport + 1);
        await page.screenshot({
          path: "test-results/independent-start/home-390.png",
          fullPage: true,
        });
        for (const path of [
          "/resorts?page=1&pageSize=20",
          "/articles?page=1&pageSize=20",
          "/dynamics?limit=20",
        ]) {
          const result = await page.request.get(endpoint(path));
          assert.equal(result.status(), 200);
          assert.deepEqual((await result.json()).data.items, []);
        }
        for (const path of ["/resorts", "/knowledge", "/dynamics"]) {
          const result = await page.goto(path);
          assert.equal(result?.status(), 200);
          await page.locator("h1").waitFor();
        }
      },
    );

    it(
      "redirects an anonymous protected page to the real login page",
      { timeout: 60_000 },
      async () => {
        const page = await pageAt(admin);
        await page.goto("/admin/system/users");
        await page.waitForURL((url) => url.pathname === "/login");
        await page.getByLabel("账号", { exact: true }).waitFor();
        assert.equal(
          await page.getByRole("navigation", { name: "管理端导航" }).count(),
          0,
        );
      },
    );

    it(
      "loads dashboard/users, restores cookies on reload and enforces CSRF on logout",
      { timeout: 90_000 },
      async () => {
        const page = await pageAt(admin);
        const summary = page.waitForResponse(
          (response) => response.url() === endpoint("/admin/dashboard/summary"),
        );
        await login(page, account!, password!);
        await page.waitForURL((url) => url.pathname === "/admin");
        await page.getByRole("navigation", { name: "管理端导航" }).waitFor();
        const result = await summary;
        assert.equal(result.status(), 200);
        assert.ok((await result.json()).data.users.total >= 1);
        await page
          .getByRole("button", { name: "刷新统计", exact: true })
          .waitFor();
        const cookies = await page.context().cookies(endpoint("/auth/me"));
        for (const name of ["linji_access", "linji_refresh"]) {
          const cookie = cookies.find((entry) => entry.name === name);
          assert.ok(cookie?.httpOnly && cookie.secure);
          assert.equal(cookie.sameSite, "Lax");
        }
        const users = page.waitForResponse((response) =>
          response.url().startsWith(endpoint("/admin/users?")),
        );
        await page.goto("/admin/system/users");
        assert.equal((await users).status(), 200);
        await page.getByRole("cell", { name: account!, exact: true }).waitFor();
        await page.reload();
        await page.getByRole("cell", { name: account!, exact: true }).waitFor();
        assert.equal(
          await page.evaluate(() => Object.keys(localStorage).length),
          0,
        );
        const missingCsrf = await page.evaluate(async (url) => {
          const response = await fetch(url, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          });
          return response.status;
        }, endpoint("/auth/logout"));
        assert.equal(missingCsrf, 403);
        assert.equal(
          (await page.request.get(endpoint("/auth/me"))).status(),
          200,
        );
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({
          path: "test-results/independent-start/users-390.png",
          fullPage: true,
        });
        const logout = page.waitForResponse(
          (response) =>
            response.url() === endpoint("/auth/logout") &&
            response.request().method() === "POST",
        );
        await page.getByRole("button", { name: "退出", exact: true }).click();
        assert.equal((await logout).status(), 200);
        await page.waitForURL((url) => url.pathname === "/login");
        assert.equal(
          (await page.request.get(endpoint("/auth/me"))).status(),
          401,
        );
      },
    );

    it(
      "registers an ordinary account without a session and denies management in UI and API",
      { timeout: 90_000 },
      async () => {
        const page = await pageAt(admin);
        const ordinary = `isolated_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
        const registration = await page.request.post(
          endpoint("/auth/register"),
          {
            data: { account: ordinary, password, nickname: "隔离验收用户" },
          },
        );
        assert.equal(registration.status(), 201);
        assert.equal(
          (await page.request.get(endpoint("/auth/me"))).status(),
          401,
        );
        const nativeLogin = await page.request.post(endpoint("/auth/login"), {
          data: { account: ordinary, password },
        });
        assert.equal(nativeLogin.status(), 200);
        const token = (await nativeLogin.json()).data.accessToken as string;
        assert.ok(token);
        const denied = await page.request.get(
          endpoint("/admin/users?page=1&pageSize=20"),
          { headers: { Authorization: `Bearer ${token}` } },
        );
        assert.equal(denied.status(), 403);
        await login(page, ordinary, password!);
        await page
          .getByRole("heading", { name: "当前账号未获管理端授权", exact: true })
          .waitFor();
        await page.goto("/admin/system/users");
        await page
          .getByRole("heading", { name: "当前账号未获此页面授权", exact: true })
          .waitFor();
        assert.equal(
          await page.getByRole("navigation", { name: "管理端导航" }).count(),
          0,
        );
        await page
          .getByRole("button", { name: "退出当前账号", exact: true })
          .click();
        await page.waitForURL((url) => url.pathname === "/login");
      },
    );
  },
);
