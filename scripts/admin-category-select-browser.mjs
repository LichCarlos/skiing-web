import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const mode = process.env.ADMIN_CATEGORY_MODE || "local";
const fixtures = process.env.ADMIN_CATEGORY_FIXTURES === "1";
assert.ok(
  !fixtures || mode === "local",
  "Synthetic data is only for local preview",
);
const origin = "https://lichcarlos.top",
  prefix = "/snow-admin";
const out = resolve(
  `docs/validation/admin-category-select-${mode}${fixtures ? "-fixtures" : ""}-20261109`,
);
mkdirSync(out, { recursive: true });
const report = {
  passed: false,
  mode,
  fixtures,
  checks: [],
  pageErrors: [],
  contentWrites: [],
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion:
    process.env.ADMIN_CATEGORY_MOTION === "normal" ? "no-preference" : "reduce",
});
if (mode === "local")
  await context.route(`${origin}${prefix}/**`, async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({
      url: `http://127.0.0.1:3302${url.pathname}${url.search}`,
    });
    await route.fulfill({ response });
  });
await context.route(`${origin}/snow-api/api/v1/admin/**`, async (route) => {
  if (!["GET", "OPTIONS"].includes(route.request().method())) {
    report.contentWrites.push(
      route.request().method() + " " + new URL(route.request().url()).pathname,
    );
    return route.abort();
  }
  return route.fallback();
});
const page = await context.newPage();
page.setDefaultTimeout(45000);
page.on("pageerror", (error) => report.pageErrors.push(error.message));
const cancel = async (dialog) => {
  await dialog.getByRole("button", { name: /^取\s*消$/ }).click();
  await dialog.waitFor({ state: "hidden" });
};
async function select(control, label) {
  await control.click();
  const aligned = () =>
    page.waitForFunction(
      () =>
        [...document.querySelectorAll(".ant-select-dropdown")].some((node) => {
          const rect = node.getBoundingClientRect();
          return (
            rect.x >= 0 &&
            rect.y >= 0 &&
            rect.x < innerWidth &&
            rect.y < innerHeight &&
            getComputedStyle(node).display !== "none"
          );
        }),
      null,
      { timeout: 10000 },
    );
  await aligned();
  if (await control.isEditable()) await control.fill(label);
  await aligned();
  await page
    .locator(".ant-select-dropdown:visible .rc-virtual-list-holder")
    .evaluateAll((nodes) =>
      nodes.forEach((node) => {
        node.scrollTop = 0;
      }),
    );
  await page
    .locator(".ant-select-dropdown:visible .ant-select-item-option")
    .filter({ hasText: label })
    .last()
    .click();
}
async function inspect(dialog, name) {
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(
      await dialog.evaluate((node) => node.scrollWidth > node.clientWidth + 1),
      false,
      `${name}: horizontal overflow ${width}`,
    );
    const hints = await dialog
      .locator(".ant-form-item-extra .ant-typography")
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          text: node.textContent,
          size: getComputedStyle(node).fontSize,
        })),
      );
    assert.ok(hints.length);
    assert.ok(hints.every((hint) => hint.text.trim() && hint.size === "13px"));
    if ([1440, 390].includes(width))
      await page.screenshot({ path: `${out}/${name}-${width}.png` });
    report.checks.push({ name, width, hints: hints.length });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
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
  const response = await page.goto(origin + prefix + "/login");
  const manifest = JSON.parse(
    readFileSync(
      "D:/linji-local/20261109/admin-category-select-release/release-manifest.json",
      "utf8",
    ),
  );
  report.buildId = manifest.buildId;
  assert.ok((await response.text()).includes(report.buildId));
  await page.getByLabel("账号", { exact: true }).fill(credentials.Account);
  await page.getByLabel("密码", { exact: true }).fill(credentials.Password);
  await page.getByRole("button", { name: /^登\s*录$/ }).click();
  await page
    .getByRole("navigation", { name: "管理端导航", exact: true })
    .waitFor();
  if (fixtures) {
    const dicts = Array.from({ length: 23 }, (_, i) => ({
      dictType:
        i === 0
          ? "knowledge.article_category"
          : i === 1
            ? "resort.fit_tag"
            : `test.options${i}`,
      dictName:
        i === 0 ? "文章分类" : i === 1 ? "雪场适合标签" : `测试选项${i}`,
      groupKey: i === 0 ? "knowledge" : "resort",
      status: i === 2 ? "disabled" : "active",
      publiclyReadable: false,
      items: [],
    }));
    const fields = Array.from({ length: 21 }, (_, i) => ({
      fieldDefinitionId: i + 1,
      entityType: "ski_resort",
      fieldKey: `field${i}`,
      label: `测试字段${i}`,
      dataType: i === 20 ? "multi_select" : "text",
      groupKey: "basic",
      sortOrder: i,
      required: false,
      defaultValue: null,
      optionsDictType: i === 20 ? "test.options22" : null,
      validation: null,
      searchable: false,
      filterable: false,
      sortable: false,
      isPublic: false,
      status: "active",
      schemaVersion: 1,
      createTime: "2026-11-03T00:00:00Z",
      updateTime: "2026-11-03T00:00:00Z",
    }));
    await context.route(`${origin}/snow-api/api/v1/admin/**`, async (route) => {
      const url = new URL(route.request().url()),
        path = url.pathname.split("/api/v1")[1];
      if (route.request().method() !== "GET") return route.fallback();
      let data;
      if (path === "/admin/dictionaries") {
        const rows = dicts.filter(
          (item) =>
            !url.searchParams.get("status") ||
            item.status === url.searchParams.get("status"),
        );
        const n = Number(url.searchParams.get("page"));
        data = {
          page: n,
          pageSize: 20,
          total: rows.length,
          hasNext: n * 20 < rows.length,
          items: rows.slice((n - 1) * 20, n * 20),
        };
      } else if (path.startsWith("/admin/dictionaries/"))
        data = dicts.find(
          (item) => item.dictType === decodeURIComponent(path.split("/")[3]),
        );
      else if (path === "/admin/custom-fields") {
        const rows =
            url.searchParams.get("entityType") === "ski_resort" ? fields : [],
          n = Number(url.searchParams.get("page"));
        data = {
          page: n,
          pageSize: 20,
          total: rows.length,
          items: rows.slice((n - 1) * 20, n * 20),
        };
      } else if (path.startsWith("/admin/custom-fields/"))
        data = fields.find(
          (item) => item.fieldDefinitionId === Number(path.split("/")[3]),
        );
      else if (path === "/admin/custom-field-groups")
        data = [
          {
            entityType: "ski_resort",
            groupKey: "basic",
            label: "基础信息",
            sortOrder: 0,
            visibilityRule: null,
            status: "active",
            createTime: fields[0].createTime,
            updateTime: fields[0].updateTime,
          },
        ];
      else return route.fallback();
      await route.fulfill({
        json: { code: 200, msg: "ok", data, traceId: "local-category-preview" },
      });
    });
  }
  await page.goto(origin + prefix + "/admin/system/dictionaries");
  await page.getByRole("button", { name: "新增分类", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "新增分类", exact: true });
  const categoryControl = dialog.getByRole("combobox", {
    name: "所属字段",
    exact: true,
  });
  await categoryControl.waitFor({ state: "visible" });
  await page.waitForFunction(
    () => !document.querySelector('[aria-label="所属字段"]')?.disabled,
  );
  await select(categoryControl, fixtures ? "测试字段20" : "文章 · 文章分类");
  if (fixtures)
    await dialog.getByText("test.options22", { exact: false }).waitFor();
  await inspect(dialog, "category-picker");
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "新增字典项", exact: true });
  await dialog.waitFor();
  await inspect(dialog, "category-item");
  await cancel(dialog);
  const chosenType = fixtures ? "test.options22" : "knowledge.article_category";
  await page
    .locator("section")
    .filter({ has: page.getByRole("heading", { level: 2 }) })
    .locator("header code")
    .filter({ hasText: chosenType })
    .waitFor();
  await page.getByRole("button", { name: "新建选项字典", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "新建选项字典", exact: true });
  await select(
    dialog.getByRole("combobox", { name: "适用业务", exact: true }),
    "文章",
  );
  assert.match(
    await dialog.getByLabel("类型键", { exact: true }).inputValue(),
    /^knowledge\.options\.[a-f0-9-]+$/,
  );
  assert.equal(
    await dialog.getByLabel("类型键", { exact: true }).getAttribute("readonly"),
    "",
  );
  await inspect(dialog, "new-option-dictionary");
  await cancel(dialog);
  await page.goto(origin + prefix + "/admin/system/fields");
  await page.getByRole("button", { name: "新建字段", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "新建字段", exact: true });
  assert.equal(await dialog.getByLabel("选项字典", { exact: true }).count(), 0);
  await select(dialog.getByLabel("数据类型", { exact: true }), "单选");
  const dictControl = dialog.getByLabel("选项字典", { exact: true });
  await dictControl.waitFor();
  await page.waitForFunction(
    () => !document.querySelector("#optionsDictType")?.disabled,
  );
  await select(dictControl, fixtures ? "测试选项22" : "文章分类");
  await inspect(dialog, "field-dictionary");
  const typeControl = dialog.getByLabel("数据类型", { exact: true });
  await typeControl.click();
  for (let index = 0; index < 6; index++) await typeControl.press("ArrowUp");
  await typeControl.press("Enter");
  assert.equal(await dialog.getByLabel("选项字典", { exact: true }).count(), 0);
  await cancel(dialog);
  assert.deepEqual(report.contentWrites, []);
  assert.deepEqual(report.pageErrors, []);
  await page.getByRole("button", { name: "退出", exact: true }).click();
  await page.waitForURL(origin + prefix + "/login");
  report.passed = true;
} catch (error) {
  console.log(
    JSON.stringify(
      await page
        .locator(".ant-select,.ant-select-input,.ant-modal")
        .evaluateAll((nodes) =>
          nodes.map((node) => ({
            cls: node.className,
            style: node.getAttribute("style"),
            rect: node.getBoundingClientRect().toJSON(),
            display: getComputedStyle(node).display,
            visibility: getComputedStyle(node).visibility,
            position: getComputedStyle(node).position,
          })),
        ),
    ),
  );
  console.log(
    JSON.stringify(
      await page.locator(".ant-select-dropdown").evaluateAll((nodes) =>
        nodes.map((node) => ({
          style: node.getAttribute("style"),
          rect: node.getBoundingClientRect().toJSON(),
          cls: node.className,
        })),
      ),
    ),
  );
  await page.screenshot({ path: `${out}/failure.png` });
  writeFileSync(`${out}/failure.txt`, await page.locator("body").innerText());
  throw error;
} finally {
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2) + "\n");
  await browser.close();
}
console.log(JSON.stringify(report));
