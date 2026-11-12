import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const mode = process.env.ADMIN_HINT_MODE || "local";
const origin = "https://lichcarlos.top",
  prefix = "/snow-admin";
const out = resolve(`docs/validation/admin-form-hints-${mode}-20261109`);
mkdirSync(out, { recursive: true });
const report = {
  passed: false,
  mode,
  forms: [],
  pageErrors: [],
  contentWrites: [],
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
if (mode === "local")
  await context.route(`${origin}${prefix}/**`, async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({
      url: `http://127.0.0.1:3302${url.pathname}${url.search}`,
    });
    await route.fulfill({ response });
  });
const page = await context.newPage();
page.setDefaultTimeout(45000);
page.on("pageerror", (error) => report.pageErrors.push(error.message));
page.on("request", (request) => {
  const path = new URL(request.url()).pathname;
  if (
    path.startsWith("/snow-api/") &&
    !path.includes("/auth/") &&
    !["GET", "OPTIONS"].includes(request.method())
  )
    report.contentWrites.push(request.method() + " " + path);
});
async function inspect(title, count) {
  const dialog = page.getByRole("dialog", { name: title, exact: true });
  await dialog.waitFor();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const items = await dialog.locator(".ant-form-item").evaluateAll((items) =>
      items
        .filter((item) => item.querySelector(".ant-form-item-label"))
        .map((item) => {
          const hint = item.querySelector(
            ".ant-form-item-extra .ant-typography",
          );
          const control = item.querySelector(
            'input,textarea,button[role="switch"]',
          );
          const rect = hint?.getBoundingClientRect();
          const parent = item.closest(".ant-modal").getBoundingClientRect();
          return {
            label: item.querySelector("label")?.textContent,
            hint: hint?.textContent,
            fontSize: hint ? getComputedStyle(hint).fontSize : null,
            color: hint ? getComputedStyle(hint).color : null,
            fits:
              rect && rect.left >= parent.left && rect.right <= parent.right,
            describedBy: control?.getAttribute("aria-describedby"),
            extraId: item.querySelector(".ant-form-item-extra")?.id,
          };
        }),
    );
    assert.equal(items.length, count, title);
    for (const item of items) {
      assert.ok(item.hint?.trim(), `${title}: ${item.label} missing hint`);
      assert.equal(item.fontSize, "13px");
      assert.ok(item.fits, `${title}: hint overflow at ${width}`);
      if (item.extraId && item.describedBy)
        assert.ok(item.describedBy.split(" ").includes(item.extraId));
    }
    report.forms.push({ title, width, items });
    if ([1440, 390].includes(width)) {
      await dialog.locator(".ant-form-item").first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${out}/${title}-${width}-top.png` });
      await dialog
        .getByRole("button", { name: /^取\s*消$/ })
        .scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${out}/${title}-${width}-bottom.png` });
    }
  }
  await dialog.getByRole("button", { name: /^取\s*消$/ }).click();
  await dialog.waitFor({ state: "hidden" });
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
  if (mode === "live") {
    report.buildId = JSON.parse(
      readFileSync(
        "D:/linji-local/20261109/admin-form-hints-release/release-manifest.json",
        "utf8",
      ),
    ).buildId;
    assert.ok((await response.text()).includes(report.buildId));
  }
  await page.getByLabel("账号", { exact: true }).fill(credentials.Account);
  await page.getByLabel("密码", { exact: true }).fill(credentials.Password);
  await page.getByRole("button", { name: /^登\s*录$/ }).click();
  await page
    .getByRole("navigation", { name: "管理端导航", exact: true })
    .waitFor();
  await page.goto(origin + prefix + "/admin/system/dictionaries");
  await page.getByRole("button", { name: "新建类型", exact: true }).click();
  await inspect("新建字典类型", 4);
  await page
    .locator(".ant-table-tbody")
    .getByRole("button", { name: /^编\s*辑$/ })
    .first()
    .click();
  await inspect("编辑字典类型", 5);
  await page.getByRole("link", { name: "字典项", exact: true }).first().click();
  await page.getByRole("button", { name: "新增字典项", exact: true }).click();
  await inspect("新增字典项", 6);
  const itemEdit = page
    .locator(".ant-table-tbody")
    .getByRole("button", { name: /^编\s*辑$/ })
    .first();
  if (await itemEdit.count()) {
    await itemEdit.click();
    await inspect("编辑字典项", 7);
  }
  await page.goto(origin + prefix + "/admin/system/fields");
  await page.getByRole("button", { name: "新建字段", exact: true }).click();
  await inspect("新建字段", 13);
  await page.getByRole("button", { name: "新建分组", exact: true }).click();
  await inspect("新建分组", 3);
  const tables = page.locator(".ant-table-tbody");
  const fieldEdit = tables
    .first()
    .getByRole("button", { name: /^编\s*辑$/ })
    .first();
  if (await fieldEdit.count()) {
    await fieldEdit.click();
    await inspect("编辑字段", 13);
  }
  const groupEdit = tables
    .last()
    .getByRole("button", { name: /^编\s*辑$/ })
    .first();
  if (await groupEdit.count()) {
    await groupEdit.click();
    await inspect("编辑分组", 3);
  }
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.contentWrites, []);
  await page.getByRole("button", { name: "退出", exact: true }).click();
  await page.waitForURL(origin + prefix + "/login");
  report.passed = true;
} finally {
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2) + "\n");
  await browser.close();
}
console.log(
  JSON.stringify({
    passed: report.passed,
    mode,
    layouts: report.forms.length,
    forms: [...new Set(report.forms.map((form) => form.title))],
    pageErrors: report.pageErrors,
    contentWrites: report.contentWrites,
  }),
);
