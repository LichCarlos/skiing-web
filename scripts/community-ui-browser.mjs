import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { chromium } from "playwright";

// Read-only Next route checks plus an explicitly isolated gallery fixture.
// Does not start/stop the existing Next server, log in, or submit API writes.
const root = resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve("vitest/package.json"));
const { createServer, transformWithOxc } = await import(
  pathToFileURL(viteRequire.resolve("vite")).href
);
const appRequire = createRequire(resolve(root, "apps/web/package.json"));
const origin = new URL(
  process.env.UI_PREVIEW_ORIGIN ?? "http://127.0.0.1:3210/snow",
);
assert.ok(["127.0.0.1", "localhost"].includes(origin.hostname));
const out = resolve(root, "docs/validation/community-ui-20261106");
await mkdir(out, { recursive: true });
const checks = [];
const errors = [];
let successful = false;
const svg = (color, text) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="${color}"/><path d="M0 600 320 100 580 600 720 230 900 600" fill="white"/><text x="40" y="70" font-size="30">${text}</text></svg>`)}`;
const photos = [
  svg("#2455F5", "Fixture A"),
  svg("#DC2F43", "Fixture B"),
  svg("#FF7A24", "Fixture C"),
];
const fixture = await createServer({
  configFile: false,
  root,
  cacheDir: resolve(tmpdir(), "linji-community-ui-vite-20261106"),
  logLevel: "error",
  resolve: {
    alias: [
      { find: "@", replacement: resolve(root, "apps/web/src") },
      { find: /^next\/image$/, replacement: "virtual:fixture-image" },
      { find: /^react$/, replacement: appRequire.resolve("react") },
      {
        find: /^react\/jsx-runtime$/,
        replacement: appRequire.resolve("react/jsx-runtime"),
      },
      {
        find: /^react-dom\/client$/,
        replacement: appRequire.resolve("react-dom/client"),
      },
    ],
  },
  optimizeDeps: {
    noDiscovery: true,
    include: ["react", "react-dom/client", "react/jsx-runtime"],
  },
  oxc: { jsx: { runtime: "automatic" } },
  server: { host: "127.0.0.1", port: 4313, strictPort: true },
  plugins: [
    {
      name: "read-only-gallery-fixture",
      enforce: "pre",
      resolveId(id) {
        if (id === "virtual:fixture-image") return "\0fixture-image.tsx";
      },
      load(id) {
        if (id === "\0fixture-image.tsx")
          return `import React from 'react'; export default function Image({fill,unoptimized,priority,src,style,...props}) {return <img {...props} src={src} style={{...(fill?{position:'absolute',inset:0,width:'100%',height:'100%'}:{}),...style}}/>}`;
      },
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === "/") {
            res.setHeader("content-type", "text/html");
            res.end(
              `<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated gallery fixture</title><style>:root{--primary:#2455F5;--site-yellow:#FFD43B;--site-image-base:#e5efff}*{box-sizing:border-box}body{font-family:system-ui;margin:0;background:#fff}main{max-width:900px;margin:auto;padding:24px}button,a{font:inherit}h1{font-size:26px}</style><main id="root"></main><script type="module" src="/ui-fixture.tsx"></script></html>`,
            );
          } else next();
        });
      },
      async transform(code, id) {
        if (id.endsWith(".tsx"))
          return transformWithOxc(code, id.replace(/^\0/, ""), {
            lang: "tsx",
            jsx: { runtime: "automatic" },
          });
      },
    },
    {
      name: "fixture-entry",
      resolveId(id) {
        if (id === "/ui-fixture.tsx") return "\0ui-fixture.tsx";
      },
      load(id) {
        if (id === "\0ui-fixture.tsx")
          return `import React from 'react';import {createRoot} from 'react-dom/client';import {PhotoGallery} from '@/features/public-content/photo-gallery';createRoot(document.getElementById('root')).render(<><h1>合成相册交互验收（非线上业务内容）</h1><PhotoGallery label="验收照片" urls={${JSON.stringify(photos)}}/></>);`;
      },
    },
  ],
});
await fixture.listen();
const browser = await chromium.launch({ channel: "msedge", headless: true });
async function check(name, run) {
  await run();
  checks.push({ name, passed: true });
}
try {
  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin.href, { waitUntil: "networkidle" });
    await check(
      `Next homepage ${width}px: no overflow, no inline login form`,
      async () => {
        assert.ok(await page.locator("h1").isVisible());
        assert.equal(await page.locator('input[name="password"]').count(), 0);
        assert.ok(
          await page.getByRole("link", { name: "登录 / 注册" }).isVisible(),
        );
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        assert.equal(
          await page
            .locator('[aria-hidden="true"] [style*="--tile-delay"]')
            .count(),
          48,
        );
      },
    );
    await page.getByRole("button", { name: "浏览目录" }).click();
    await check(
      `Directory ${width}px: keyboard trap, Escape and focus return`,
      async () => {
        const dialog = page.getByRole("dialog");
        await dialog.waitFor();
        const last = dialog.getByRole("link", { name: "了解凛迹雪客" });
        await last.focus();
        await page.keyboard.press("Tab");
        assert.equal(
          await page.evaluate(() =>
            document.activeElement?.getAttribute("aria-label"),
          ),
          "关闭目录",
        );
        await page.keyboard.press("Shift+Tab");
        assert.ok(await last.evaluate((el) => el === document.activeElement));
        await page.keyboard.press("Escape");
        assert.equal(await dialog.isVisible(), false);
        assert.ok(
          await page
            .getByRole("button", { name: "浏览目录" })
            .evaluate((el) => el === document.activeElement),
        );
      },
    );
    if (width === 1440 || width === 390)
      await page.screenshot({
        path: resolve(out, `home-${width}.png`),
        fullPage: true,
      });
    await page.close();
  }
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin.href, { waitUntil: "networkidle" });
  await check(
    "Next homepage reduced motion has no pixel animation",
    async () => {
      const tiles = page.locator('[style*="--tile-delay"]').first();
      assert.equal(
        await tiles.evaluate((el) => getComputedStyle(el).animationName),
        "none",
      );
    },
  );
  await page.goto("http://127.0.0.1:4313/", { waitUntil: "networkidle" });
  await check(
    "Gallery fixture: image load, mobile fit and horizontal navigation",
    async () => {
      await page.getByRole("link", { name: "放大验收照片第 1 张" }).waitFor();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.getByRole("button", { name: "下一张照片" }).click();
      await page.waitForFunction(
        () =>
          document
            .querySelector("[data-gallery-controls] span")
            ?.textContent?.trim() === "2 / 3",
      );
      assert.ok(
        await page
          .locator("img")
          .first()
          .evaluate((el) => el.complete && el.naturalWidth > 0),
      );
    },
  );
  await page.getByRole("link", { name: "放大验收照片第 2 张" }).click();
  await check(
    "Gallery fixture: dialog, scroll lock, arrows and focus trap",
    async () => {
      const dialog = page.getByRole("dialog");
      assert.ok(await dialog.isVisible());
      assert.equal(
        await page.evaluate(() => document.documentElement.style.overflow),
        "hidden",
      );
      await page.keyboard.press("ArrowRight");
      await page.waitForFunction(() =>
        document
          .querySelector("dialog [aria-live]")
          ?.textContent?.includes("3 / 3"),
      );
      const previous = dialog.getByRole("button", {
        name: "上一张",
        exact: true,
      });
      await previous.focus();
      await page.keyboard.press("Tab");
      assert.ok(
        await dialog
          .getByRole("button", { name: "关闭大图" })
          .evaluate((el) => el === document.activeElement),
      );
      await page.screenshot({
        path: resolve(out, "gallery-mobile.png"),
        fullPage: true,
      });
      await page.keyboard.press("Escape");
      await page.waitForFunction(
        () => document.documentElement.style.overflow === "",
      );
      assert.equal(
        await page.evaluate(() => document.documentElement.style.overflow),
        "",
      );
      assert.ok(
        await page
          .getByRole("link", { name: "放大验收照片第 2 张" })
          .evaluate((el) => el === document.activeElement),
      );
    },
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: resolve(out, "gallery-desktop.png"),
    fullPage: true,
  });
  await check(
    "Gallery fixture: image failure offers fresh-page URL recovery",
    async () => {
      await page
        .locator("img")
        .first()
        .dispatchEvent("error", { bubbles: false });
      assert.ok(
        await page
          .getByRole("button", { name: "重新读取页面图片" })
          .isVisible(),
      );
    },
  );
  const noJs = await browser.newPage({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  await noJs.goto(origin.href);
  await check(
    "Next SSR without JavaScript keeps heading and separate login link",
    async () => {
      assert.ok(await noJs.locator("h1").isVisible());
      assert.ok(
        await noJs.getByRole("link", { name: "登录 / 注册" }).isVisible(),
      );
      assert.equal(await noJs.locator('input[name="password"]').count(), 0);
    },
  );
  await check(
    "No page runtime errors in checked routes and isolated fixture",
    async () => assert.deepEqual(errors, []),
  );
  successful = true;
} finally {
  await writeFile(
    resolve(out, "report.json"),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        passed: successful,
        checks,
        errors,
        scope:
          (process.env.UI_PREVIEW_SCOPE ??
            "Local existing Next server homepage/navigation read-only") +
          ". Gallery real component in isolated Vite fixture with next/image substitute and synthetic SVGs. No production content, authentication submission, Android/iOS or production build acceptance.",
      },
      null,
      2,
    ) + "\n",
  );
  await browser.close();
  await fixture.close();
}
console.log(`${checks.length} browser checks passed`);
