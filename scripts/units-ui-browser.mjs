import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

// This suite only navigates/reads. It never logs in or submits content.
const origin = new URL(
  process.env.UI_PREVIEW_ORIGIN ?? "http://localhost:3000",
);
assert.ok(
  ["localhost", "127.0.0.1"].includes(origin.hostname),
  "Preview must be loopback",
);
const out = resolve(
  process.env.UI_EVIDENCE_DIR ?? "docs/validation/units-ui-20261106",
);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
const errors = [];
const contexts = new Set();
let activePage;
assert.ok(
  process.env.UI_PUBLIC_API_BASE_URL,
  "UI_PUBLIC_API_BASE_URL is required",
);
const apiUrl = new URL(process.env.UI_PUBLIC_API_BASE_URL);
assert.ok(
  ["http:", "https:"].includes(apiUrl.protocol) &&
    !apiUrl.username &&
    !apiUrl.password &&
    !apiUrl.search &&
    !apiUrl.hash,
);
const publicApi = apiUrl.href.replace(/\/$/, "");
async function check(name, run) {
  try {
    await run();
    results.push({ name, status: "passed" });
  } catch (error) {
    if (activePage && !activePage.isClosed()) {
      await activePage.screenshot({
        path: resolve(out, "failure.png"),
        fullPage: true,
      });
      console.error(
        activePage.url(),
        (await activePage.locator("body").innerText()).slice(0, 1200),
      );
    }
    results.push({ name, status: "failed", error: String(error) });
    throw error;
  }
}
async function open(width, height = 900, options = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    ...options,
  });
  contexts.add(context);
  const cors = {
    "access-control-allow-origin": origin.origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type,x-csrf-token",
  };
  // Browser-only read relay: the remote API need not allow a localhost CORS origin.
  // Server-rendered content still uses the real public API directly. No auth claims.
  await context.route(`${publicApi}/**`, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    if (
      request.url() === `${publicApi}/auth/me` &&
      request.method() === "GET"
    ) {
      await route.fulfill({
        status: 401,
        headers: cors,
        contentType: "application/json",
        body: JSON.stringify({ code: 401, msg: "Guest preview", data: null }),
      });
      return;
    }
    if (
      request.url() === `${publicApi}/auth/csrf` &&
      request.method() === "GET"
    ) {
      await route.fulfill({
        status: 200,
        headers: cors,
        contentType: "application/json",
        body: JSON.stringify({
          code: 200,
          msg: "success",
          data: { csrfToken: "ui-fixture-no-server-session" },
        }),
      });
      return;
    }
    if (request.url() === `${publicApi}/auth/refresh`) {
      await route.fulfill({
        status: 401,
        headers: cors,
        contentType: "application/json",
        body: JSON.stringify({ code: 401, msg: "Guest preview", data: null }),
      });
      return;
    }
    if (
      request.method() !== "GET" ||
      !/^\/(?:public\/config|resorts(?:\/|\?|$)|articles(?:\/|\?|$)|dynamics(?:\/|\?|$))/.test(
        request.url().slice(publicApi.length),
      )
    ) {
      await route.abort();
      return;
    }
    try {
      const response = await route.fetch({
        headers: { accept: "application/json" },
      });
      await route.fulfill({
        response,
        headers: { ...response.headers(), ...cors },
      });
    } catch (error) {
      // Navigation/teardown may cancel an in-flight public read. Do not mask
      // real network failures; retain them in the report while avoiding a
      // second attempt to handle an already-cancelled route.
      if (
        !/already handled|context disposed|Target.*closed|has been closed/i.test(
          String(error),
        )
      ) {
        errors.push(String(error));
        await route.abort().catch(() => {});
      }
    }
  });
  const page = await context.newPage();
  activePage = page;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (
      new URL(response.url()).origin === origin.origin &&
      response.status() >= 500
    )
      errors.push(
        `Preview HTTP ${response.status()}: ${new URL(response.url()).pathname}`,
      );
  });
  await page.goto(origin.href, { waitUntil: "networkidle" });
  return { context, page };
}
async function noOverflow(page) {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    true,
  );
}
async function closeContext(context) {
  await context.unrouteAll({ behavior: "wait" });
  await context.close();
  contexts.delete(context);
}

try {
  const { context, page } = await open(1440);
  await check("desktop real public content and fixed rail", async () => {
    assert.equal(
      await page
        .locator("[data-site-navigation]")
        .evaluate((node) => getComputedStyle(node).position),
      "fixed",
    );
    assert.ok(
      await page.locator("[data-scroll-rail]").count(),
      "Real published resorts required",
    );
    await page.waitForSelector('[data-scroll-rail][data-enhanced="true"]');
    assert.ok(await page.locator('a[href^="/resorts/"]').count());
    await noOverflow(page);
    await page.screenshot({
      path: resolve(out, "desktop-home.png"),
      fullPage: false,
    });
  });
  await check("modal keyboard, backdrop and focus return", async () => {
    const button = page.getByRole("button", { name: "浏览目录" });
    await button.click();
    assert.equal(await button.getAttribute("aria-expanded"), "true");
    assert.equal(await page.getByRole("dialog").isVisible(), true);
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(out, "desktop-navigation.png") });
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      assert.equal(
        await page.evaluate(
          () => document.activeElement?.closest("dialog") !== null,
        ),
        true,
      );
    }
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("dialog")?.open);
    assert.equal(await button.getAttribute("aria-expanded"), "false");
    assert.equal(
      await button.evaluate((node) => node === document.activeElement),
      true,
    );
    await button.click();
    await page.mouse.click(1400, 300);
    await page.waitForFunction(() => !document.querySelector("dialog")?.open);
  });
  await check(
    "vertical scroll drives horizontal travel without wheel interception",
    async () => {
      const stage = page.locator("[data-scroll-rail]");
      const start = await stage.evaluate(
        (node) => node.getBoundingClientRect().top + scrollY - 24,
      );
      await page.evaluate((top) => scrollTo(0, top), start);
      await page.waitForTimeout(120);
      const before = await stage
        .locator('[class*="railTrack"]')
        .evaluate((node) => getComputedStyle(node).transform);
      const travel = await stage
        .locator('[class*="railViewport"]')
        .evaluate(
          (node) => node.firstElementChild.scrollWidth - node.clientWidth,
        );
      await page.mouse.move(1000, 400);
      await page.mouse.wheel(0, Math.min(300, travel / 2));
      await page.waitForTimeout(250);
      const after = await stage
        .locator('[class*="railTrack"]')
        .evaluate((node) => getComputedStyle(node).transform);
      assert.notEqual(after, before);
      assert.ok(
        Math.abs(
          (await stage.locator('[class*="railSticky"]').boundingBox()).y - 24,
        ) < 2,
      );
      await noOverflow(page);
      await page.screenshot({ path: resolve(out, "desktop-horizontal.png") });
    },
  );
  await check("hidden card keyboard focus becomes visible", async () => {
    const last = page.locator('[data-scroll-rail] a[href^="/resorts/"]').last();
    await last.focus();
    await page.waitForTimeout(100);
    const box = await last.boundingBox();
    assert.ok(box.x >= 156 && box.x + box.width <= 1441, JSON.stringify(box));
  });
  await check(
    "reduced motion can switch live to native horizontal browsing",
    async () => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.waitForFunction(
        () =>
          !document
            .querySelector("[data-scroll-rail]")
            ?.hasAttribute("data-enhanced"),
      );
      assert.equal(
        await page
          .locator('[class*="railTrack"]')
          .evaluate((node) => getComputedStyle(node).transform),
        "none",
      );
      await noOverflow(page);
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.waitForSelector('[data-scroll-rail][data-enhanced="true"]');
    },
  );
  await check(
    "directory route navigation and back retain usable header",
    async () => {
      await page.getByRole("button", { name: "浏览目录" }).click();
      await page
        .getByRole("dialog")
        .getByRole("link", { name: "滑雪知识 把准备做在出发前" })
        .click();
      await page.waitForURL("**/knowledge");
      await page.waitForLoadState("networkidle");
      assert.equal(await page.getByRole("dialog").isVisible(), false);
      await noOverflow(page);
      await page.goBack({ waitUntil: "networkidle" });
      await page.waitForSelector("[data-scroll-rail]");
    },
  );
  await check(
    "desktop narrow-height and 200 percent layout equivalents",
    async () => {
      await page.setViewportSize({ width: 1440, height: 600 });
      await page.waitForTimeout(150);
      await noOverflow(page);
      await page.setViewportSize({ width: 720, height: 450 });
      await page.waitForTimeout(150);
      assert.equal(
        await page
          .locator("[data-site-navigation]")
          .evaluate((node) => getComputedStyle(node).position),
        "relative",
      );
      await noOverflow(page);
    },
  );
  await closeContext(context);

  for (const width of [320, 390, 768, 1920]) {
    const mobile = await open(
      width,
      width < 400 ? 844 : 1000,
      width < 400 ? { isMobile: true, hasTouch: true } : {},
    );
    await check(`${width}px responsive content and navigation`, async () => {
      await noOverflow(mobile.page);
      assert.equal(
        await mobile.page.getByRole("heading", { level: 1 }).isVisible(),
        true,
      );
      await mobile.page.getByRole("button", { name: "浏览目录" }).click();
      await mobile.page.getByRole("button", { name: "关闭目录" }).click();
      if (width < 1100) {
        assert.equal(
          await mobile.page
            .locator("[data-scroll-rail]")
            .getAttribute("data-enhanced"),
          null,
        );
        const view = mobile.page.locator('[class*="railViewport"]');
        await mobile.page.getByRole("button", { name: "向后浏览雪场" }).click();
        await mobile.page.waitForTimeout(700);
        assert.ok((await view.evaluate((node) => node.scrollLeft)) > 0);
      }
      if (width === 390) {
        const max = await mobile.page.evaluate(
          () => document.documentElement.scrollHeight,
        );
        for (let y = 0; y < max; y += 700) {
          await mobile.page.evaluate((top) => scrollTo(0, top), y);
          await mobile.page.waitForTimeout(100);
        }
        await mobile.page
          .locator('[class*="railViewport"]')
          .evaluate((node) => {
            node.scrollLeft = 0;
          });
        await mobile.page.evaluate(() => scrollTo(0, 0));
        await mobile.page.screenshot({
          path: resolve(out, "mobile-home.png"),
          fullPage: true,
        });
      }
    });
    await closeContext(mobile.context);
  }
  const plain = await open(1440, 900, { javaScriptEnabled: false });
  await check(
    "no JavaScript retains SSR content, detail links and vertical list",
    async () => {
      await noOverflow(plain.page);
      assert.ok(await plain.page.locator('a[href^="/resorts/"]').count());
      assert.equal(
        await plain.page
          .locator('[class*="railTrack"]')
          .evaluate((node) => getComputedStyle(node).display),
        "grid",
      );
      assert.equal(
        await plain.page.getByRole("heading", { level: 1 }).isVisible(),
        true,
      );
    },
  );
  await closeContext(plain.context);
  const routePreview = await open(1440);
  await check("public catalog and detail routes remain readable", async () => {
    for (const path of ["/resorts", "/knowledge", "/dynamics"]) {
      await routePreview.page.goto(new URL(path, origin).href, {
        waitUntil: "networkidle",
      });
      await noOverflow(routePreview.page);
      const detail = routePreview.page.locator(`a[href^="${path}/"]`).first();
      await detail.waitFor();
      const href = await detail.getAttribute("href");
      await detail.click();
      await routePreview.page.waitForURL((url) => url.pathname === href);
      await routePreview.page.waitForLoadState("networkidle");
      await routePreview.page
        .getByRole("heading", { level: 1 })
        .waitFor({ state: "visible" });
      assert.equal(
        await routePreview.page.getByRole("heading", { level: 1 }).isVisible(),
        true,
      );
      await noOverflow(routePreview.page);
      await routePreview.page.screenshot({
        path: resolve(out, `${path.slice(1)}-detail.png`),
      });
    }
  });
  await closeContext(routePreview.context);
  await check("no browser runtime exceptions", async () =>
    assert.deepEqual(errors, []),
  );
} finally {
  for (const context of contexts) {
    await context.unrouteAll({ behavior: "ignoreErrors" });
  }
  await browser.close();
  await writeFile(
    resolve(out, "report.json"),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        scope:
          "Local Chromium UI with real public GET data; browser GET/CORS relay, synthetic guest auth responses only. No real login/write acceptance, no deployment.",
        results,
        errors,
      },
      null,
      2,
    ),
  );
}
console.log(`${results.length} checks passed; ${out}`);
