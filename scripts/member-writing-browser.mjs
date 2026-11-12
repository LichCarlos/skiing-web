import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const live = process.env.WRITING_LIVE === "1";
const origin = live ? "https://lichcarlos.top" : "http://127.0.0.1:3110";
const api = "https://lichcarlos.top/snow-api/api/v1";
const out = resolve(
  `docs/validation/member-writing-${live ? "live-" : ""}20261109`,
);
mkdirSync(out, { recursive: true });
const report = {
  passed: false,
  live,
  checks: [],
  pageErrors: [],
  contentWrites: [],
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
page.on("pageerror", (error) => report.pageErrors.push(String(error)));
let failSearch = false;
const searches = [];
if (!live) {
  await context.route(`${api}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/snow-api/api/v1", "");
    const headers = {
      "access-control-allow-origin": origin,
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,x-csrf-token",
    };
    const json = (data, status = 200) =>
      route.fulfill({
        status,
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          code: status,
          data,
          msg: "OK",
          traceId: "writing-fixture",
        }),
      });
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    if (path === "/auth/me")
      return json({
        userId: 7,
        account: "snow.user",
        nickname: "雪友",
        avatarUrl: null,
        roles: [{ roleKey: "user", roleName: "用户" }],
        permissionKeys: [
          "account:profile:read",
          "community:dynamic:read-own",
          "community:dynamic:create",
          "community:dynamic:update-own",
          "asset:upload",
        ],
        menuTree: [],
        merchant: null,
      });
    if (path === "/auth/csrf") return json({ csrfToken: "browser-csrf" });
    if (path === "/me/dynamics")
      return json({
        items: [],
        page: 1,
        pageSize: 12,
        total: 0,
        hasNext: false,
      });
    if (path === "/resorts") {
      searches.push(url.searchParams.get("keyword") || "");
      if (failSearch) return json(null, 503);
      const keyword = url.searchParams.get("keyword");
      const items = [
        { resortId: 1, name: "万龙滑雪场" },
        { resortId: 2, name: "北大湖滑雪场" },
      ].filter((item) => !keyword || item.name.includes(keyword));
      return json({ items });
    }
    if (request.method() === "GET" && path.startsWith("/public/")) {
      return json({ items: [], total: 0, page: 1, pageSize: 12 });
    }
    throw new Error(`Unexpected API: ${request.method()} ${path}`);
  });
}
page.on("request", (request) => {
  if (
    request.url().startsWith(api) &&
    !["GET", "OPTIONS"].includes(request.method()) &&
    !request.url().includes("/auth/")
  )
    report.contentWrites.push(
      request.method() + " " + new URL(request.url()).pathname,
    );
});
async function check(name, action) {
  await action();
  report.checks.push({ name, passed: true });
}
const editor = page.getByRole("textbox", {
  name: "笔记富文本正文",
  exact: true,
});
const shell = page.locator("[data-note-editor]");
async function oneFrame(locator) {
  assert.deepEqual(
    await locator.evaluate((el) => {
      const s = getComputedStyle(el);
      return { border: s.borderTopWidth, outline: s.outlineStyle };
    }),
    { border: "0px", outline: "none" },
  );
}
async function screenshot(name) {
  await shell.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: false });
}
try {
  if (live) {
    const credentials = Object.fromEntries(
      readFileSync("D:/linji-local/20261105/private/admin-initial.txt", "utf8")
        .trim()
        .split(/\r?\n/)
        .map((line) => {
          const i = line.indexOf(": ");
          return [line.slice(0, i), line.slice(i + 2)];
        }),
    );
    await page.goto(`${origin}/snow/me/new`);
    await page.getByRole("link", { name: "登录 / 注册", exact: true }).click();
    await page.getByLabel("账号", { exact: true }).fill(credentials.Account);
    await page.getByLabel("密码", { exact: true }).fill(credentials.Password);
    await page
      .getByRole("button", { name: "登录，继续雪上旅程", exact: true })
      .click();
    await editor.waitFor();
  }
  const response = await page.goto(`${origin}/snow/me/new`);
  if (live) {
    const manifest = JSON.parse(
      readFileSync(
        "D:/linji-local/20261109/member-writing-release/release-manifest.json",
        "utf8",
      ),
    );
    assert.ok((await response.text()).includes(manifest.buildId));
    report.buildId = manifest.buildId;
  }
  await editor.waitFor();
  await check("empty editor shows guidance inside a single frame", async () => {
    assert.equal(await shell.locator('[data-empty="true"]').count(), 1);
    assert.match(
      await editor.evaluate((el) => getComputedStyle(el, "::before").content),
      /雪上故事/,
    );
    await editor.focus();
    await oneFrame(editor);
    assert.equal(
      await shell.evaluate((el) => getComputedStyle(el).borderTopColor),
      "rgb(36, 85, 245)",
    );
    await screenshot("desktop-empty");
  });
  await check("typing, heading and undo keep content and focus", async () => {
    await editor.fill("我的滑雪记录");
    await shell.getByRole("button", { name: "标题 1", exact: true }).click();
    assert.equal(await editor.locator("h1").innerText(), "我的滑雪记录");
    await shell.getByRole("button", { name: "撤销", exact: true }).click();
    assert.equal(await editor.locator("h1").count(), 0);
    await shell.getByRole("button", { name: "重做", exact: true }).click();
    assert.equal(await editor.locator("h1").innerText(), "我的滑雪记录");
    assert.equal(await shell.locator('[data-empty="false"]').count(), 1);
  });
  await check("source and preview share the same outer frame", async () => {
    await shell
      .getByRole("button", { name: "Markdown 源文", exact: true })
      .click();
    const source = page.getByRole("textbox", {
      name: "Markdown 源文",
      exact: true,
    });
    await source.fill(
      "# 我的滑雪记录\n\n先检查护具，再练习刹车。\n\n- 头盔\n- 雪镜",
    );
    await oneFrame(source);
    await screenshot("desktop-source");
    await shell.getByRole("button", { name: "阅读预览", exact: true }).click();
    await shell.getByRole("heading", { name: "我的滑雪记录" }).waitFor();
    assert.equal(await shell.locator("li").count(), 2);
    await shell.getByRole("button", { name: "写作", exact: true }).click();
    assert.equal(await editor.locator("li").count(), 2);
    await editor.focus();
    await screenshot("desktop-writing");
  });
  const search = page.getByRole("searchbox", { name: "搜索雪场名称" });
  const select = page.getByRole("combobox", { name: "选择雪场" });
  await check(
    "resort fields use one shared border and native keyboard selection",
    async () => {
      await search.fill("万龙");
      await select
        .getByRole("option", { name: "万龙滑雪场", exact: true })
        .waitFor({ state: "attached" });
      await oneFrame(search);
      await select.focus();
      await oneFrame(select);
      await select.press("ArrowDown");
      await select.press("Enter");
      assert.notEqual(await select.inputValue(), "");
      await search.fill("北大湖");
      if (!live) {
        await select
          .getByRole("option", { name: "北大湖滑雪场", exact: true })
          .waitFor({ state: "attached" });
        assert.equal(await select.inputValue(), "1");
      }
      await select.selectOption("");
      await search
        .locator("..")
        .locator("..")
        .evaluate((el) => el.scrollIntoView({ block: "center" }));
      await page.screenshot({ path: `${out}/desktop-resort.png` });
    },
  );
  if (!live)
    await check(
      "empty search and failed request remain recoverable",
      async () => {
        await search.fill("不存在的雪场");
        await page
          .getByText("没有找到匹配雪场，试试其他名称。", { exact: true })
          .waitFor();
        failSearch = true;
        await search.fill("北大湖");
        await page
          .getByRole("button", { name: "重新查找", exact: true })
          .waitFor();
        failSearch = false;
        await page
          .getByRole("button", { name: "重新查找", exact: true })
          .click();
        await select
          .getByRole("option", { name: "北大湖滑雪场", exact: true })
          .waitFor({ state: "attached" });
      },
    );
  for (const width of [390, 320])
    await check(
      `${width}px writing, source and resort have no page overflow`,
      async () => {
        await page.setViewportSize({ width, height: 844 });
        await editor.focus();
        await oneFrame(editor);
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        const toolbar = page.getByRole("group", { name: "笔记排版" });
        assert.ok(
          await toolbar.evaluate((el) => el.scrollWidth > el.clientWidth),
        );
        await toolbar
          .getByRole("button", { name: "重做", exact: true })
          .focus();
        await screenshot(`mobile-${width}-writing`);
        await shell
          .getByRole("button", { name: "Markdown 源文", exact: true })
          .click();
        await page
          .getByRole("textbox", { name: "Markdown 源文", exact: true })
          .focus();
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        await screenshot(`mobile-${width}-source`);
        await shell.getByRole("button", { name: "写作", exact: true }).click();
        await search.focus();
        await search
          .locator("..")
          .locator("..")
          .evaluate((el) => el.scrollIntoView({ block: "center" }));
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        await page.screenshot({ path: `${out}/mobile-${width}-resort.png` });
      },
    );
  assert.deepEqual(report.contentWrites, []);
  assert.deepEqual(report.pageErrors, []);
  if (live) {
    await page.getByRole("button", { name: "退出登录", exact: true }).click();
    await page
      .getByRole("link", { name: "登录 / 注册", exact: true })
      .waitFor();
  }
  report.passed = true;
} finally {
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2) + "\n");
  await browser.close();
}
console.log(JSON.stringify(report));
