import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const mode = process.env.ADMIN_UX_MODE || "local";
const origin = "https://lichcarlos.top",
  prefix = "/snow-admin",
  api = origin + "/snow-api/api/v1";
const out = `docs/validation/admin-navigation-text-${mode}-20261112`;
mkdirSync(out, { recursive: true });
const report = {
  passed: false,
  mode,
  checks: [],
  forms: [],
  pageErrors: [],
  blockedWrites: [],
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
if (mode === "local")
  await context.route(origin + prefix + "/**", async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({
      response: await route.fetch({
        url: "http://127.0.0.1:3302" + url.pathname + url.search,
        maxRetries: 2,
      }),
    });
  });
await context.route(api + "/**", async (route) => {
  if (
    !["GET", "OPTIONS"].includes(route.request().method()) &&
    !route.request().url().includes("/auth/")
  ) {
    report.blockedWrites.push(
      route.request().method() + " " + new URL(route.request().url()).pathname,
    );
    return route.abort();
  }
  return route.fallback();
});
const page = await context.newPage();
page.setDefaultTimeout(45000);
page.on("pageerror", (e) => report.pageErrors.push(e.message));
let realUser;
page.on("response", async (r) => {
  if (r.url() === api + "/auth/me" && r.status() === 200) {
    try {
      const body = await r.json();
      if (body.data?.permissionKeys && !realUser) realUser = body.data;
    } catch {}
  }
});
const check = (name, data = {}) => {
  report.checks.push({ name, ...data });
  console.log("PASS " + name);
};
const goto = (path) => page.goto(origin + prefix + path);
const nav = () =>
  page.getByRole("navigation", { name: "管理端导航", exact: true });
async function inspect(scope, name, min = 1) {
  await scope.locator(".ant-form-item-label").first().waitFor();
  const fields = await scope.locator(".ant-form-item").evaluateAll((items) =>
    items
      .filter(
        (item) =>
          item.querySelector(".ant-form-item-label") &&
          !item.classList.contains("ant-form-item-hidden"),
      )
      .map((item) => {
        const hint = item.querySelector(".ant-form-item-extra .ant-typography");
        return {
          label: item.querySelector("label")?.textContent,
          hint: hint?.textContent,
          size: hint ? getComputedStyle(hint).fontSize : null,
        };
      }),
  );
  assert.ok(fields.length >= min, name);
  fields.forEach((field) => {
    assert.ok(field.hint?.trim(), name + ": " + field.label);
    assert.equal(field.size, "13px");
  });
  report.forms.push({ name, fields });
  await scope.locator(".ant-form-item-label").first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/${name}.png` });
  check("form-text-rules", { name, count: fields.length });
}
async function cancel(dialog) {
  await dialog.getByRole("button", { name: /^取\s*消$/ }).click();
  await dialog.waitFor({ state: "hidden" });
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
  report.buildId = JSON.parse(
    readFileSync(
      "D:/linji-local/20261109/admin-node-drag-release/release-manifest.json",
      "utf8",
    ),
  ).buildId;
  const response = await goto("/login");
  assert.ok((await response.text()).includes(report.buildId));
  await page.getByLabel("账号", { exact: true }).fill(credentials.Account);
  await page.getByLabel("密码", { exact: true }).fill(credentials.Password);
  await page.getByRole("button", { name: /^登\s*录$/ }).click();
  await nav().waitFor();
  assert.ok(realUser);
  await nav().getByRole("menuitem", { name: "内容运营", exact: true }).click();
  await nav().getByRole("link", { name: "全局雪场", exact: true }).waitFor();
  await nav().getByRole("menuitem", { name: "内容运营", exact: true }).click();
  await nav()
    .getByRole("link", { name: "全局雪场", exact: true })
    .waitFor({ state: "hidden" });
  check("desktop-collapsible-menu");
  await goto("/admin/content/resorts/new");
  await page.getByLabel("雪场名称", { exact: true }).waitFor();
  await inspect(page, "resort-form", 18);
  assert.equal(
    await nav()
      .getByRole("link", { name: "全局雪场", exact: true })
      .getAttribute("aria-current"),
    "page",
  );
  assert.equal(await nav().locator('[aria-current="page"]').count(), 1);
  await page.screenshot({ path: `${out}/sidebar-and-resort.png` });
  for (const width of [1280, 1600]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    check("desktop-layout", { width });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await goto("/admin/content/articles/new");
  await inspect(page, "article-form", 5);
  await goto("/admin/content/project-knowledge/new");
  await inspect(page, "knowledge-form", 4);
  await goto("/admin/system/users");
  await page.getByRole("button", { name: "新建账号", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "新建账号", exact: true });
  await inspect(dialog, "account-form", 3);
  assert.equal(
    await dialog.getByLabel("账号", { exact: true }).getAttribute("maxlength"),
    "50",
  );
  await cancel(dialog);
  await goto("/admin/system/roles");
  await page.getByRole("button", { name: "新建角色", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "新建角色", exact: true });
  await inspect(dialog, "role-form", 4);
  await cancel(dialog);
  await goto("/admin/system/dictionaries");
  await page.getByRole("button", { name: "新建选项字典", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "新建选项字典", exact: true });
  await inspect(dialog, "dictionary-form", 4);
  await cancel(dialog);
  const groupsRead = page.waitForResponse(
    (response) =>
      response
        .url()
        .includes("/admin/custom-field-groups?entityType=ski_resort") &&
      response.status() === 200,
  );
  await goto("/admin/system/fields/ski_resort");
  await groupsRead;
  await page.waitForFunction(
    () => !document.querySelector(".ant-spin-spinning"),
  );
  await page.getByRole("button", { name: "新建字段", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "新建字段", exact: true });
  await inspect(dialog, "field-form", 10);
  await cancel(dialog);
  check("authorized-current-route-highlight");

  if (mode === "local") {
    const renderIdentity = async (user) => {
      await context.unroute(api + "/auth/me");
      await context.route(api + "/auth/me", (route) =>
        route.fulfill({
          json: {
            code: 200,
            msg: "ok",
            data: user,
            traceId: "local-navigation-identity",
          },
        }),
      );
      await goto("/admin");
      await nav().waitFor();
    };
    await renderIdentity({ ...realUser, merchant: null });
    assert.equal(
      await nav()
        .getByRole("menuitem", { name: "商家经营", exact: true })
        .count(),
      realUser.permissionKeys.includes("revenue:system:upsert") ? 1 : 0,
    );
    assert.equal(
      await page.getByRole("link", { name: /商家经营概览/ }).count(),
      0,
    );
    assert.equal(await page.getByRole("link", { name: /我的雪场/ }).count(), 0);
    await goto("/admin/merchant");
    await page
      .getByRole("heading", { name: "当前账号未获此页面授权" })
      .waitFor();
    await page.getByRole("button", { name: "返回工作台", exact: true }).click();
    await nav().waitFor();
    check("unbound-admin-hides-and-blocks-merchant-pages");
    await renderIdentity({
      ...realUser,
      roles: [{ roleKey: "editor_custom", roleName: "内容编辑" }],
      merchant: null,
      permissionKeys: ["management:portal:enter", "content:article:manage"],
    });
    await nav()
      .getByRole("menuitem", { name: "内容运营", exact: true })
      .click();
    assert.deepEqual(await nav().getByRole("link").allTextContents(), [
      "工作台",
      "知识文章",
    ]);
    await goto("/admin/system/users");
    await page
      .getByRole("heading", { name: "当前账号未获此页面授权" })
      .waitFor();
    check("editor-sees-only-authorized-module-and-denies-direct-route");
    await renderIdentity({
      ...realUser,
      roles: [{ roleKey: "snow_operator", roleName: "雪场运营" }],
      merchant: { merchantId: 5, businessName: "本地身份验证商家" },
      permissionKeys: [
        "management:portal:enter",
        "merchant:dashboard:read",
        "resort:merchant:list",
        "revenue:merchant:list",
      ],
    });
    await nav()
      .getByRole("menuitem", { name: "商家经营", exact: true })
      .click();
    assert.deepEqual(await nav().getByRole("link").allTextContents(), [
      "工作台",
      "商家经营概览",
      "我的雪场",
      "收益数据",
    ]);
    await page.screenshot({ path: `${out}/merchant-navigation.png` });
    check("bound-merchant-has-distinct-navigation");
    await context.unroute(api + "/auth/me");
  }
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.blockedWrites, []);
  await page.getByRole("button", { name: "退出", exact: true }).click();
  await page.waitForURL(origin + prefix + "/login");
  report.passed = true;
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png` });
  writeFileSync(`${out}/failure.txt`, await page.locator("body").innerText());
  throw error;
} finally {
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2) + "\n");
  await browser.close();
}
console.log(
  JSON.stringify({
    passed: report.passed,
    checks: report.checks.length,
    forms: report.forms.length,
    buildId: report.buildId,
  }),
);
