import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

process.env.WRITING_LIVE = "1";
const script = readFileSync("scripts/member-writing-browser.mjs", "utf8")
  .replace(
    '`docs/validation/member-writing-${live ? "live-" : ""}20261109`',
    '"docs/validation/article-images-auth-live-20261112"',
  )
  .replace(
    "D:/linji-local/20261109/member-writing-release/release-manifest.json",
    "D:/linji-local/20261112/article-images-release/web-release-manifest.json",
  )
  .replace(
    "    await editor.focus();\n    await oneFrame(editor);",
    '    await shell.getByText("已添加 0 张图片", { exact: true }).waitFor();\n    await editor.focus();\n    await oneFrame(editor);',
  );
const temp = new URL("./.article-images-live-smoke-run.mjs", import.meta.url);
writeFileSync(temp, script);
try {
  await import(temp.href);
} finally {
  unlinkSync(temp);
}
