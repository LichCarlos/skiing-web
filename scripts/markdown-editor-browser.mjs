import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

// No production/API requests: all fixture API traffic is intercepted in-browser.
const origin = "http://127.0.0.1:3301",
  api = "http://127.0.0.1:18080/api/v1";
const out = "docs/validation/markdown-editor-20261106";
await mkdir(out, { recursive: true });
const user = {
  userId: 1,
  account: "synthetic_editor",
  nickname: "测试编辑",
  avatarUrl: null,
  merchant: null,
  roles: [{ roleKey: "editor", roleName: "编辑" }],
  menuTree: [],
  permissionKeys: [
    "management:portal:enter",
    "content:article:manage",
    "system:dict:list",
    "asset:upload",
  ],
};
let article = {
  articleId: 7,
  title: "测试滑雪笔记",
  summary: "仅浏览器内的合成资料",
  body: "## 安全滑雪\n\n**先热身**，再上雪道。",
  contentFormat: "markdown_v1",
  bodyAssets: [],
  category: { value: "beginner", label: "入门" },
  coverAssetId: null,
  coverUrl: null,
  authorName: "测试编辑",
  status: "draft",
  publishTime: null,
  version: 1,
  customFields: {},
  createTime: "2026-11-01T00:00:00.000Z",
  updateTime: "2026-11-01T00:00:00.000Z",
};
const writes = [],
  checks = [],
  errors = [];
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
});
const page = await context.newPage();
page.setDefaultTimeout(25000);
page.on("pageerror", (error) => errors.push(error.message));
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);
await context.route("**/*", async (route) => {
  const request = route.request(),
    url = new URL(request.url());
  if (url.origin === origin) return route.continue();
  if (url.origin !== "http://127.0.0.1:18080") return route.abort();
  const headers = {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
    "access-control-allow-headers": "content-type,x-csrf-token",
  };
  if (request.method() === "OPTIONS")
    return route.fulfill({ status: 204, headers });
  if (url.pathname === "/fixture.png")
    return route.fulfill({
      status: 200,
      headers,
      contentType: "image/png",
      body: png,
    });
  const path = url.pathname.replace("/api/v1", "");
  let data;
  if (path === "/auth/me") data = user;
  else if (path === "/auth/csrf") data = { csrfToken: "synthetic-only" };
  else if (path === "/admin/articles/custom-fields")
    data = { entityType: "article", groups: [] };
  else if (path === "/admin/dictionaries/knowledge.article_category")
    data = {
      dictType: "knowledge.article_category",
      dictName: "文章分类",
      groupKey: "knowledge",
      status: "active",
      publiclyReadable: true,
      items: [
        {
          itemId: 1,
          parentId: null,
          value: "beginner",
          label: "入门",
          status: "active",
          sortOrder: 0,
          isDefault: true,
          color: null,
          children: [],
        },
      ],
    };
  else if (path === "/assets" && request.method() === "POST") {
    writes.push({ path, method: "POST" });
    data = {
      assetId: "12",
      originalName: "snow.png",
      mimeType: "image/png",
      status: "ready",
      url: "http://127.0.0.1:18080/fixture.png",
    };
  } else if (path === "/admin/articles/7" && request.method() === "PATCH") {
    const body = request.postDataJSON();
    writes.push({ path, method: "PATCH", body });
    assert.equal(body.contentFormat, "markdown_v1");
    assert.equal(body.expectedVersion, article.version);
    article = {
      ...article,
      ...body,
      version: article.version + 1,
      updateTime: new Date().toISOString(),
      bodyAssets: body.body.includes("asset:12")
        ? [{ assetId: "12", url: "http://127.0.0.1:18080/fixture.png" }]
        : [],
    };
    data = article;
  } else if (path === "/admin/articles/7") data = article;
  else
    return route.fulfill({
      status: 404,
      headers,
      contentType: "application/json",
      body: JSON.stringify({
        code: 404,
        msg: "No fixture",
        data: null,
        traceId: "synthetic-browser",
      }),
    });
  return route.fulfill({
    status: 200,
    headers,
    contentType: "application/json",
    body: JSON.stringify({
      code: 200,
      msg: "success",
      data,
      traceId: "synthetic-browser",
    }),
  });
});
async function check(name, run) {
  await run();
  checks.push({ name, passed: true });
}
try {
  await page.goto(`${origin}/admin/content/articles/7/edit`);
  const editor = page.getByRole("textbox", { name: "文章富文本正文" });
  await editor.waitFor();
  await check(
    "Tiptap hydrated existing Markdown without raw syntax",
    async () => {
      assert.equal(await editor.locator("h2").innerText(), "安全滑雪");
      assert.equal(await editor.locator("strong").innerText(), "先热身");
    },
  );
  await check("typed content, toolbar heading and undo/redo", async () => {
    await editor.click();
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("合成雪场体验");
    await page.getByRole("button", { name: "标题 2", exact: true }).click();
    assert.ok(
      (await editor.locator("h2").allTextContents()).includes("合成雪场体验"),
    );
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await page.getByRole("button", { name: "重做", exact: true }).click();
  });
  await check("logical document and resort link insertion", async () => {
    await page.getByRole("button", { name: "插入链接", exact: true }).click();
    await page.getByRole("dialog").getByLabel("显示文字").fill("万龙雪场");
    await page.getByRole("dialog").getByLabel("链接地址").fill("resort:7");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /确\s*定/ })
      .click();
    assert.equal(
      await editor.locator('a[href="resort:7"]').innerText(),
      "万龙雪场",
    );
  });
  await check(
    "image upload inserts Asset ID and resolves controlled preview",
    async () => {
      await page
        .locator('input[type=file][accept="image/jpeg,image/png,image/webp"]')
        .last()
        .setInputFiles({
          name: "snow.png",
          mimeType: "image/png",
          buffer: png,
        });
      await editor.locator("img").waitFor();
      assert.equal(
        await editor.locator("img").getAttribute("src"),
        "http://127.0.0.1:18080/fixture.png",
      );
    },
  );
  await check(
    "preview renders link and image; save uses versioned source, not signed URLs",
    async () => {
      await page.getByRole("button", { name: "阅读预览", exact: true }).click();
      await page.locator('a[href="http://127.0.0.1:3300/resorts/7"]').waitFor();
      await page
        .getByRole("button", { name: /^保\s*存$/, exact: true })
        .click();
      await page.waitForTimeout(800);
      const saved = writes.find((write) => write.method === "PATCH");
      assert.ok(saved, "save request captured");
      assert.ok(saved.body.body.includes("asset:12"));
      assert.ok(saved.body.body.includes("resort:7"));
      assert.ok(!saved.body.body.includes("fixture.png"));
    },
  );
  await check("MD import, table preview and semantic export", async () => {
    const imported =
      "# 合成导入笔记\n\n|装备|建议|\n|---|---|\n|头盔|必备|\n\n[站内知识](article:9)";
    await page
      .locator('input[type=file][accept=".md,text/markdown"]')
      .setInputFiles({
        name: "synthetic.md",
        mimeType: "text/markdown",
        buffer: Buffer.from(imported),
      });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /确\s*定/ })
      .click();
    await page.getByRole("button", { name: "阅读预览", exact: true }).click();
    await page.locator("table").waitFor();
    assert.ok((await page.locator("table").innerText()).includes("头盔"));
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "导出 .md", exact: true }).click(),
    ]);
    const stream = await download.createReadStream();
    let content = "";
    for await (const chunk of stream) content += chunk.toString();
    assert.ok(content.includes("article:9"));
    assert.ok(content.includes("|装备|"));
  });
  await page.screenshot({ path: `${out}/desktop.png`, fullPage: true });
  await check("narrow viewport keeps editor controls reachable", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${out}/mobile.png`, fullPage: true });
    assert.ok(
      await page
        .getByRole("button", { name: "阅读预览", exact: true })
        .isVisible(),
    );
  });
  assert.deepEqual(errors, []);
  await writeFile(
    `${out}/report.json`,
    JSON.stringify(
      {
        scope:
          "Synthetic browser API fixtures only; not server or native device acceptance",
        checks,
        writes,
        errors,
        passed: true,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: true, checks: checks.length }));
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png`, fullPage: true });
  await writeFile(
    `${out}/failure.json`,
    JSON.stringify(
      {
        error: String(error),
        body: (await page.locator("body").innerText()).slice(-6000),
        checks,
        errors,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
