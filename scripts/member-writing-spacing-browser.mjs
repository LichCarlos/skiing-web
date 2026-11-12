import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

// Reuse the established writing flow, adding geometry checks to the final package.
const live = process.env.WRITING_LIVE === "1";
const out = `docs/validation/member-writing-spacing-${live ? "live" : "local"}-20261112`;
mkdirSync(out, { recursive: true });
let script = readFileSync("scripts/member-writing-browser.mjs", "utf8")
  .replace('"http://127.0.0.1:3110"', '"http://127.0.0.1:3312"')
  .replace(
    '`docs/validation/member-writing-${live ? "live-" : ""}20261109`',
    JSON.stringify(out),
  )
  .replace(
    "D:/linji-local/20261109/member-writing-release/release-manifest.json",
    "D:/linji-local/20261112/member-writing-spacing-release/release-manifest.json",
  );
const geometry = String.raw`
  await check("desktop writing uses the full frame with symmetric 24px insets", async () => {
    report.geometry = [];
    for (const width of [1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      const metrics = await editor.evaluate(el => {
        const shell = el.closest('[data-note-editor]');
        const a = shell.getBoundingClientRect(), b = el.getBoundingClientRect();
        return { viewport: innerWidth, frame: a.width, body: b.width,
          left: b.left - a.left, right: a.right - b.right,
          maxWidth: getComputedStyle(el).maxWidth };
      });
      assert.ok(Math.abs(metrics.left - 26) < 1, JSON.stringify(metrics));
      assert.ok(Math.abs(metrics.right - 26) < 1, JSON.stringify(metrics));
      assert.equal(metrics.maxWidth, 'none');
      report.geometry.push(metrics);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await screenshot("desktop-full-width");
  });
  await check("long paragraphs, source and preview align without overflow", async () => {
    await shell.getByRole('button', { name: 'Markdown 源文', exact: true }).click();
    const source = page.getByRole('textbox', { name: 'Markdown 源文', exact: true });
    await source.fill('# 我的滑雪记录\n\n' + '从山顶到山脚，记录雪况和每一次转弯。'.repeat(45) + '\n\n- 头盔\n- 雪镜');
    for (const mode of ['Markdown 源文', '阅读预览', '写作']) {
      await shell.getByRole('button', { name: mode, exact: true }).click();
      const content = mode === 'Markdown 源文' ? source
        : mode === '阅读预览' ? shell.getByRole('heading', { name: '我的滑雪记录' }) : editor;
      const left = await content.evaluate(el => el.getBoundingClientRect().left - el.closest('[data-note-editor]').getBoundingClientRect().left);
      assert.ok(Math.abs(left - 26) < 1, mode + ': ' + left);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await screenshot('desktop-long-writing');
  });
`;
script = script.replace(
  '  const search = page.getByRole("searchbox", { name: "搜索雪场名称" });',
  geometry +
    '\n  const search = page.getByRole("searchbox", { name: "搜索雪场名称" });',
);
const temp = new URL("./.member-writing-spacing-run.mjs", import.meta.url);
writeFileSync(temp, script);
try {
  await import(temp.href);
} finally {
  const { unlinkSync } = await import("node:fs");
  unlinkSync(temp);
}
