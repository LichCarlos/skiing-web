import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const mode = process.env.ADMIN_BUTTON_MODE || "before";
const origin = "https://lichcarlos.top";
const prefix = "/snow-admin";
const out = resolve(`docs/validation/admin-buttons-${mode}-20261109`);
mkdirSync(out, { recursive: true });
const report = {
  passed: false,
  mode,
  samples: [],
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
function contrast(fg, bg) {
  const lum = (color) => {
    const [r, g, b] = color
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map(Number)
      .map((x) => {
        x /= 255;
        return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = lum(fg),
    b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
async function sample(locator, name, state, enforce = true) {
  const colors = await locator.evaluate((el) => {
    const style = getComputedStyle(el);
    const text = [...el.querySelectorAll("span")].find((s) =>
      s.textContent.trim(),
    );
    return {
      color: getComputedStyle(text || el).color,
      background: style.backgroundColor,
      outline: style.outlineStyle,
      disabled: el.matches(':disabled,[aria-disabled="true"]'),
      tag: el.tagName,
    };
  });
  const ratio = contrast(colors.color, colors.background);
  report.samples.push({ name, state, ...colors, contrast: ratio });
  if (mode !== "before" && enforce)
    assert.ok(ratio >= 4.5, `${name} ${state}: ${ratio}`);
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
        "D:/linji-local/20261109/admin-buttons-release/release-manifest.json",
        "utf8",
      ),
    ).buildId;
    assert.ok((await response.text()).includes(report.buildId));
  }
  await page.getByLabel("账号", { exact: true }).fill(credentials.Account);
  await page.getByLabel("密码", { exact: true }).fill(credentials.Password);
  await sample(
    page.getByRole("button", { name: /^登\s*录$/ }),
    "登录",
    "default",
  );
  await page.getByRole("button", { name: /^登\s*录$/ }).click();
  await page
    .getByRole("navigation", { name: "管理端导航", exact: true })
    .waitFor();
  for (const item of [
    { path: "/admin/content/articles", name: "新建文章" },
    { path: "/admin/content/project-knowledge", name: "新建项目知识" },
    { path: "/admin/content/resorts", name: "新建全局雪场" },
  ]) {
    await page.goto(origin + prefix + item.path);
    const link = page.getByRole("link", { name: item.name, exact: true });
    await link.waitFor();
    await page.waitForFunction(
      (name) =>
        [...document.querySelectorAll("a")].some(
          (el) =>
            el.textContent.trim() === name &&
            el.getAttribute("href") &&
            el.getAttribute("aria-disabled") !== "true",
        ),
      item.name,
    );
    await page.mouse.move(1400, 900);
    await sample(link, item.name, "default");
    await link.hover();
    await sample(link, item.name, "hover");
    await page.screenshot({ path: `${out}/${item.name}-hover.png` });
    await page.mouse.move(1400, 900);
    await page.keyboard.press("Tab");
    await link.focus();
    await sample(link, item.name, "focus");
    if (mode !== "before") {
      const outline = await link.evaluate(
        (el) => getComputedStyle(el).outlineStyle,
      );
      assert.notEqual(outline, "none", `${item.name}: missing focus outline`);
    }
    await link.hover();
    await page.mouse.down();
    await sample(link, item.name, "active");
    await page.mouse.move(1400, 900);
    await page.mouse.up();
    assert.equal(new URL(page.url()).pathname, prefix + item.path);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.mouse.move(0, 0);
    await sample(link, item.name, "mobile");
    await link.screenshot({ path: `${out}/${item.name}-mobile.png` });
    await page.setViewportSize({ width: 1440, height: 1000 });
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
console.log(JSON.stringify(report));
