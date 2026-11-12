import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const mode = process.env.ADMIN_FILTER_MODE || "local";
const origin = "https://lichcarlos.top";
const prefix = "/snow-admin";
const out = resolve(`docs/validation/admin-filters-${mode}-20261109`);
mkdirSync(out, { recursive: true });
const report = {
  passed: false,
  mode,
  layouts: [],
  interactions: [],
  pageErrors: [],
  contentWrites: [],
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
  timezoneId: "Asia/Shanghai",
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
        "D:/linji-local/20261109/admin-filters-release/release-manifest.json",
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
  for (const item of [
    { path: "/admin/system/events", name: "消息任务" },
    { path: "/admin/system/operation-logs", name: "操作日志" },
    { path: "/admin/ai/conversations", name: "AI 会话审计" },
    { path: "/admin/ai/sources", name: "RAG 来源运维" },
  ]) {
    await page.goto(origin + prefix + item.path);
    await page.getByRole("heading", { name: item.name, exact: true }).waitFor();
    const form = page.locator("form").first();
    await form.waitFor();
    await page.locator(".ant-table-wrapper").waitFor();
    await page.locator(".ant-spin-spinning").waitFor({ state: "hidden" });
    for (const width of mode === "before"
      ? [1440, 390]
      : [1440, 1100, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      const layout = await form.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const items = [...el.querySelectorAll(".ant-form-item")].filter(
          (item) => item.querySelector("label"),
        );
        const controls = items.map((item) => {
          const label = item.querySelector("label").getBoundingClientRect();
          const control = item
            .querySelector(".ant-form-item-control")
            .getBoundingClientRect();
          return {
            label: item.querySelector("label").textContent,
            labelBottom: label.bottom,
            top: control.top,
            left: control.left,
            right: control.right,
            width: control.width,
            bottom: control.bottom,
          };
        });
        const button = [...el.querySelectorAll("button")]
          .find((button) => button.type === "submit")
          .getBoundingClientRect();
        return {
          pageWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          form: { left: box.left, right: box.right },
          controls,
          actionTop: button.top,
          columns: getComputedStyle(el).gridTemplateColumns,
        };
      });
      report.layouts.push({ name: item.name, width, ...layout });
      if (mode !== "before") {
        assert.ok(
          layout.scrollWidth <= width + 1,
          `${item.name} ${width}: document overflow`,
        );
        for (const control of layout.controls) {
          assert.ok(
            control.labelBottom <= control.top + 1,
            `${item.name}: label placement`,
          );
          assert.ok(
            control.left >= layout.form.left &&
              control.right <= layout.form.right,
            `${item.name}: control overflow`,
          );
          assert.ok(control.width >= 220, `${item.name}: control too narrow`);
        }
        assert.ok(
          layout.actionTop >=
            Math.max(...layout.controls.map((control) => control.bottom)),
          `${item.name}: actions must follow inputs`,
        );
      }
      if ([1440, 390, 320].includes(width))
        await page.screenshot({
          path: `${out}/${item.name}-${width}.png`,
          fullPage: true,
        });
    }
  }
  if (mode !== "before") {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(origin + prefix + "/admin/system/events");
    await page
      .getByLabel("事件类型", { exact: true })
      .fill("__ui_layout_check__");
    await page
      .getByLabel("开始时间", { exact: true })
      .fill("2026-11-08T08:00:01");
    await page
      .getByLabel("结束时间", { exact: true })
      .fill("2026-11-09T08:00:02");
    const filtered = page.waitForResponse(
      (response) =>
        response.url().includes("/admin/events?") &&
        new URL(response.url()).searchParams.get("eventType") ===
          "__ui_layout_check__",
    );
    await page.getByRole("button", { name: /^查\s*询$/ }).click();
    const result = await filtered;
    assert.equal(result.status(), 200);
    const query = new URL(result.url()).searchParams;
    assert.equal(query.get("fromTime"), "2026-11-08T00:00:01.000Z");
    assert.equal(query.get("toTime"), "2026-11-09T00:00:02.000Z");
    report.interactions.push(
      "exact event type and local time including seconds submitted correctly",
    );
    const reset = page.waitForResponse(
      (response) =>
        response.url().includes("/admin/events?") &&
        !new URL(response.url()).searchParams.has("eventType"),
    );
    await page.getByRole("button", { name: /^重\s*置$/ }).click();
    assert.equal((await reset).status(), 200);
    assert.equal(
      await page.getByLabel("开始时间", { exact: true }).inputValue(),
      "",
    );
    report.interactions.push("reset clears filters and reloads first page");
    await page
      .getByLabel("开始时间", { exact: true })
      .fill("2026-11-09T08:00:01");
    await page
      .getByLabel("结束时间", { exact: true })
      .fill("2026-11-08T08:00:02");
    await page.getByRole("button", { name: /^查\s*询$/ }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "开始时间不能晚于结束时间" })
      .waitFor();
    report.interactions.push("invalid time range keeps visible validation");
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
    layouts: report.layouts.length,
    interactions: report.interactions,
    pageErrors: report.pageErrors,
    contentWrites: report.contentWrites,
  }),
);
