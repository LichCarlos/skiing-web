import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const mode = process.env.ADMIN_NAV_MODE || "local";
const origin = "https://lichcarlos.top";
const prefix = "/snow-admin";
const out = resolve(`docs/validation/admin-navigation-${mode}-20261109`);
mkdirSync(out, { recursive: true });
const report = {
  passed: false,
  mode,
  checks: [],
  pageErrors: [],
  navigations: [],
  contentWrites: [],
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
if (mode === "local")
  await context.route(`${origin}${prefix}/**`, async (route) => {
    const url = new URL(route.request().url());
    const headers = { ...route.request().headers() };
    delete headers.origin;
    const response = await route.fetch({
      url: `http://127.0.0.1:3302${url.pathname}${url.search}`,
      headers,
    });
    await route.fulfill({ response });
  });
const page = await context.newPage();
page.setDefaultTimeout(45000);
page.on("pageerror", (error) => report.pageErrors.push(error.message));
page.on("request", (request) => {
  const url = new URL(request.url());
  if (request.isNavigationRequest() && request.frame() === page.mainFrame())
    report.navigations.push(url.pathname);
  if (
    url.pathname.startsWith("/snow-api/") &&
    !url.pathname.includes("/auth/") &&
    !["GET", "OPTIONS"].includes(request.method())
  )
    report.contentWrites.push(`${request.method()} ${url.pathname}`);
});
async function check(name, action) {
  await action();
  report.checks.push({ name, passed: true });
}
async function clickNavigation(link, path) {
  assert.equal(await link.getAttribute("href"), prefix + path);
  await link.click();
  await page.waitForURL(origin + prefix + path);
  assert.equal(new URL(page.url()).pathname, prefix + path);
}
try {
  const credentials = Object.fromEntries(
    readFileSync("D:/linji-local/20261105/private/admin-initial.txt", "utf8")
      .trim()
      .split(/\r?\n/)
      .map((line) => {
        const i = line.indexOf(": ");
        return [line.slice(0, i), line.slice(i + 2)];
      }),
  );
  const initial = await page.goto(origin + prefix + "/login");
  if (mode === "live") {
    const manifest = JSON.parse(
      readFileSync(
        "D:/linji-local/20261109/admin-navigation-release/release-manifest.json",
        "utf8",
      ),
    );
    assert.ok((await initial.text()).includes(manifest.buildId));
    report.buildId = manifest.buildId;
  }
  await page.getByLabel("账号", { exact: true }).fill(credentials.Account);
  await page.getByLabel("密码", { exact: true }).fill(credentials.Password);
  await page.getByRole("button", { name: /^登\s*录$/ }).click();
  await page
    .getByRole("navigation", { name: "管理端导航", exact: true })
    .waitFor();
  const cases = [
    {
      key: "resorts",
      list: "/admin/content/resorts",
      create: "新建全局雪场",
      heading: "新建全局雪场",
      cancel: "取消",
    },
    {
      key: "articles",
      list: "/admin/content/articles",
      create: "新建文章",
      heading: "新建文章",
      cancel: "取消",
    },
    {
      key: "knowledge",
      list: "/admin/content/project-knowledge",
      create: "新建项目知识",
      heading: "新建项目知识",
      cancel: "取消",
    },
  ];
  for (const item of cases)
    await check(
      `${item.key}: create and return stay inside admin prefix`,
      async () => {
        await page.goto(origin + prefix + item.list);
        const link = page.getByRole("link", { name: item.create, exact: true });
        await link.waitFor();
        await page.waitForFunction(
          (label) =>
            [...document.querySelectorAll("a")].some(
              (a) =>
                a.textContent.trim() === label &&
                a.getAttribute("href") &&
                a.getAttribute("aria-disabled") !== "true",
            ),
          item.create,
        );
        if (mode === "before") {
          const href = await link.getAttribute("href");
          assert.equal(href, item.list + "/new");
          const response = await context.request.get(origin + href, {
            maxRedirects: 0,
          });
          report.checks.push({
            observedHref: href,
            status: response.status(),
            location: response.headers().location ?? null,
          });
          return;
        }
        await clickNavigation(link, item.list + "/new");
        await page
          .getByRole("heading", { name: item.heading, exact: true })
          .waitFor();
        const cancel = page.getByRole("link", {
          name: /^取\s*消$/,
        });
        await cancel.waitFor();
        if (item.key === "resorts") {
          await page.waitForFunction(() => {
            const label = [...document.querySelectorAll("label")].find(
              (el) => el.textContent.trim() === "雪场名称",
            );
            const input = label && document.getElementById(label.htmlFor);
            return input && !input.disabled;
          });
        }
        await page.screenshot({
          path: `${out}/${item.key}-new.png`,
          fullPage: true,
        });
        await clickNavigation(cancel, item.list);
        await page
          .getByRole("heading", {
            name:
              item.key === "resorts"
                ? "全局雪场"
                : item.key === "articles"
                  ? "知识文章"
                  : "项目知识",
            exact: true,
          })
          .waitFor();
        if (item.key === "resorts") {
          await page.waitForFunction(
            (label) =>
              [...document.querySelectorAll("a")].some(
                (a) =>
                  a.textContent.trim() === label &&
                  a.getAttribute("aria-disabled") !== "true",
              ),
            item.create,
          );
          const edit = page
            .getByRole("link", { name: "编辑", exact: true })
            .first();
          if (await edit.count()) {
            const href = await edit.getAttribute("href");
            assert.match(
              href,
              /^\/snow-admin\/admin\/content\/resorts\/\d+\/edit$/,
            );
            await edit.click();
            await page.waitForURL(origin + href);
            await page
              .getByRole("heading", { name: "维护全局雪场", exact: true })
              .waitFor();
            await clickNavigation(
              page.getByRole("link", { name: /^取\s*消$/ }),
              item.list,
            );
          }
        }
      },
    );
  if (mode !== "before") {
    await check("error recovery points at the prefixed dashboard", async () => {
      await page.goto(origin + prefix + "/not-a-real-route");
      await clickNavigation(
        page.getByRole("link", { name: "返回工作台", exact: true }),
        "/admin",
      );
    });
    assert.ok(
      report.navigations.every((path) => path.startsWith(prefix + "/")),
    );
    assert.deepEqual(report.pageErrors, []);
  }
  assert.deepEqual(report.contentWrites, []);
  await page.getByRole("button", { name: "退出", exact: true }).click();
  await page.waitForURL(origin + prefix + "/login");
  report.passed = true;
} finally {
  if (!report.passed) {
    await page
      .screenshot({ path: `${out}/failure.png`, fullPage: true })
      .catch(() => {});
    writeFileSync(
      `${out}/failure-text.txt`,
      await page
        .locator("body")
        .innerText()
        .catch(() => ""),
    );
  }
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2) + "\n");
  await browser.close();
}
console.log(JSON.stringify(report));
