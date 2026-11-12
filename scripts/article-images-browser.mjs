import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const live = process.env.IMAGE_LIVE === "1";
const origin = live ? "https://lichcarlos.top" : "http://127.0.0.1:3313";
const api = "https://lichcarlos.top/snow-api/api/v1";
const out = `docs/validation/article-images-${live ? "live" : "local"}-20261112`;
mkdirSync(out, { recursive: true });
const report = {
  passed: false,
  live,
  mockedApi: true,
  checks: [],
  pageErrors: [],
  mockedWrites: [],
  realContentWrites: [],
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
page.on("pageerror", (error) => report.pageErrors.push(String(error)));
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF1kAAAAASUVORK5CYII=",
  "base64",
);
const images = [];
let savedContent = "";
const date = "2026-11-12T09:00:00Z";
await context.route("https://image-fixture.invalid/**", (route) =>
  route.fulfill({ contentType: "image/png", body: png }),
);
await context.route(`${api}/**`, async (route) => {
  const req = route.request(),
    path = new URL(req.url()).pathname.replace("/snow-api/api/v1", "");
  const headers = {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
    "access-control-allow-headers": "content-type,x-csrf-token",
  };
  const json = (data) =>
    route.fulfill({
      headers,
      contentType: "application/json",
      body: JSON.stringify({
        code: 200,
        msg: "OK",
        data,
        traceId: "image-fixture",
      }),
    });
  if (req.method() === "OPTIONS")
    return route.fulfill({ status: 204, headers });
  if (path === "/auth/me")
    return json({
      userId: 7,
      account: "image.fixture",
      nickname: "图片验证",
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
  if (path === "/auth/csrf") return json({ csrfToken: "fixture-csrf" });
  if (req.method() === "GET" && path.startsWith("/public/"))
    return route.fulfill({ response: await route.fetch(), headers });
  if (path === "/assets" && req.method() === "POST") {
    const assetId = String(images.length + 1),
      url = `https://image-fixture.invalid/${assetId}.png`;
    images.push({ assetId, url });
    report.mockedWrites.push({ method: "POST", path });
    return json({ assetId, url, status: "ready" });
  }
  if (path === "/dynamics" && req.method() === "POST") {
    const input = req.postDataJSON();
    assert.deepEqual(
      input.imageAssetIds,
      images.map((x) => x.assetId),
    );
    assert.equal(input.imageAssetIds.length, 150);
    savedContent = input.content;
    report.mockedWrites.push({ method: "POST", path, imageCount: 150 });
    return json({ dynamicId: 7, status: "pending", createdAt: date });
  }
  if (path === "/me/dynamics/7")
    return json({
      dynamicId: 7,
      author: { userId: 7, nickname: "图片验证", avatarUrl: null },
      summary: "雪上记录",
      coverUrl: images[0]?.url ?? null,
      imageCount: images.length,
      resort: null,
      likeCount: 0,
      commentCount: 0,
      likedByMe: false,
      status: "pending",
      createdAt: date,
      updatedAt: date,
      version: 1,
      content: savedContent,
      contentFormat: "markdown_v1",
      images,
      bodyAssets: images,
    });
  if (path === "/me/dynamics")
    return json({ items: [], page: 1, pageSize: 12, total: 0, hasNext: false });
  if (path === "/resorts") return json({ items: [] });
  if (req.method() !== "GET") {
    report.realContentWrites.push({ method: req.method(), path });
    return route.abort();
  }
  throw new Error(`Unexpected fixture API ${req.method()} ${path}`);
});
async function check(name, action) {
  await action();
  report.checks.push({ name, passed: true });
}
try {
  await page.goto(`${origin}/snow/me/new`);
  const shell = page.locator("[data-note-editor]");
  const upload = shell.getByRole("button", { name: "插入图片", exact: true });
  await upload.waitFor();
  await check("no count ceiling guidance is shown", async () => {
    assert.equal(await shell.getByText(/最多.*张图片/).count(), 0);
    await shell.getByText("已添加 0 张图片", { exact: true }).waitFor();
  });
  for (let n = 1; n <= 150; n++) {
    await shell
      .locator('input[type="file"]')
      .first()
      .setInputFiles({
        name: `snow-${n}.png`,
        mimeType: "image/png",
        buffer: png,
      });
    await shell.getByText(`已添加 ${n} 张图片`, { exact: true }).waitFor();
    if ([10, 31, 101, 150].includes(n))
      await check(`upload remains available at ${n} images`, async () => {
        await page.waitForFunction(() =>
          [...document.querySelectorAll("[data-note-editor] button")].some(
            (el) => el.textContent === "插入图片" && !el.disabled,
          ),
        );
        assert.equal(await shell.locator(".tiptap img").count(), n);
      });
  }
  await check(
    "all 150 references survive source, preview and writing",
    async () => {
      await shell
        .getByRole("button", { name: "Markdown 源文", exact: true })
        .click();
      const source = await shell
        .getByRole("textbox", { name: "Markdown 源文", exact: true })
        .inputValue();
      assert.equal((source.match(/asset:/g) ?? []).length, 150);
      await shell
        .getByRole("button", { name: "阅读预览", exact: true })
        .click();
      assert.equal(await shell.locator("img").count(), 150);
      await shell.getByRole("button", { name: "写作", exact: true }).click();
      assert.equal(await shell.locator(".tiptap img").count(), 150);
      await shell.locator("footer").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${out}/150-images-footer.png` });
    },
  );
  await check("submission sends every image ID in order", async () => {
    await page.getByRole("button", { name: "提交审核", exact: true }).click();
    await page
      .getByRole("heading", { name: "已提交，等待管理员审核", exact: true })
      .waitFor();
    assert.ok(savedContent.includes("asset:150"));
  });
  await check("reopening the note retains 150 editable images", async () => {
    await page.goto(`${origin}/snow/me/notes/7`);
    await shell.getByText("已添加 150 张图片", { exact: true }).waitFor();
    assert.equal(await shell.locator(".tiptap img").count(), 150);
    assert.equal(await upload.isEnabled(), true);
    await page.getByText("笔记图片 · 150 张", { exact: true }).waitFor();
  });
  await check(
    "small viewports retain the count without page overflow",
    async () => {
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        await shell.locator("footer").scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${out}/${width}-footer.png` });
      }
    },
  );
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.realContentWrites, []);
  report.passed = true;
} finally {
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2) + "\n");
  await browser.close();
}
console.log(
  JSON.stringify({ ...report, mockedWrites: report.mockedWrites.length }),
);
