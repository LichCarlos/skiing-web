import assert from "node:assert/strict";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const source = fileURLToPath(new URL("../", import.meta.url));
const cases = [
  ["current public imports pass", null, null],
  [
    "reject cross-app relative import",
    "apps/web/src/probe.ts",
    'import "../../admin/src/app/page";',
    /禁止跨包相对导入/,
  ],
  [
    "reject alias traversal",
    "apps/web/src/probe.ts",
    'import "@/../../admin/src/app/page";',
    /只能指向当前应用/,
  ],
  [
    "reject unknown common package",
    "apps/web/src/probe.ts",
    'import "@common/not-declared";',
    /工作空间包尚未创建/,
  ],
  [
    "reject unexported source via type import",
    "apps/web/src/probe.ts",
    'type T = import("@common/ui/src/private").T;',
    /未公开的包入口/,
  ],
  [
    "reject undeclared external dependency",
    "apps/web/src/probe.ts",
    'import "unlisted-library";',
    /未声明外部依赖/,
  ],
  [
    "reject package self-import",
    "packages/ui/src/probe.ts",
    'import { Button } from "@common/ui";',
    /不自引用公开入口/,
  ],
  [
    "reject app relative source import",
    "apps/web/src/probe.ts",
    'import "./config/routes";',
    /应用内部统一使用/,
  ],
  [
    "reject cross-package CSS",
    "apps/web/src/probe.css",
    '@import "../../../../packages/ui/src/styles/globals.css";',
    /禁止跨包相对导入/,
  ],
  [
    "reject computed import",
    "apps/web/src/probe.ts",
    'const x = "@common/ui"; import(x);',
    /模块路径必须为静态字符串/,
  ],
  [
    "reject nonexistent exported target",
    "packages/ui/package.json",
    (json) => {
      json.exports["."] = "./src/missing.ts";
    },
    /无效的 exports/,
  ],
  [
    "reject null exported entry",
    "packages/ui/package.json",
    (json) => {
      json.exports["."] = null;
    },
    /未公开的包入口/,
  ],
  [
    "reject masked package alias",
    "apps/web/tsconfig.json",
    (json) => {
      json.compilerOptions.paths["@common/ui"] = ["./src/app/page.tsx"];
    },
    /不得遮蔽工作空间包/,
  ],
  [
    "reject shared package depending on app",
    "packages/ui/package.json",
    (json) => {
      json.dependencies["@common/web"] = "workspace:*";
    },
    /禁止依赖应用/,
  ],
  [
    "reject non-workspace internal version",
    "apps/web/package.json",
    (json) => {
      json.dependencies["@common/ui"] = "*";
    },
    /必须使用 workspace/,
  ],
  [
    "reject workspace dependency cycle",
    "packages/theme/package.json",
    (json) => {
      json.devDependencies["@common/ui"] = "workspace:*";
    },
    /workspace 依赖循环/,
  ],
];

for (const [name, file, mutation, error] of cases) {
  test(name, () => {
    const fixture = mkdtempSync(path.join(tmpdir(), "common-boundary-"));
    try {
      cpSync(source, fixture, {
        recursive: true,
        filter: (item) =>
          !["node_modules", ".next", ".turbo", ".git", ".env"].includes(
            path.basename(item),
          ) && !item.endsWith(".tsbuildinfo"),
      });
      const directories = [
        "",
        ...["apps", "packages", "tooling"].flatMap((kind) =>
          readdirSync(path.join(source, kind)).map((name) => `${kind}/${name}`),
        ),
      ];
      for (const dir of directories) {
        const modules = path.join(source, dir, "node_modules");
        if (existsSync(modules))
          symlinkSync(
            modules,
            path.join(fixture, dir, "node_modules"),
            "junction",
          );
      }
      if (file) {
        const target = path.join(fixture, file);
        if (typeof mutation === "function") {
          const json = JSON.parse(readFileSync(target, "utf8"));
          mutation(json);
          writeFileSync(target, JSON.stringify(json));
        } else writeFileSync(target, mutation);
      }
      // Add the other edge only in the cycle fixture.
      if (name === "reject workspace dependency cycle") {
        const target = path.join(fixture, "packages/ui/package.json");
        const json = JSON.parse(readFileSync(target, "utf8"));
        json.dependencies["@common/theme"] = "workspace:*";
        writeFileSync(target, JSON.stringify(json));
      }
      const result = spawnSync(
        process.execPath,
        ["scripts/check-boundaries.mjs"],
        { cwd: fixture, encoding: "utf8" },
      );
      assert.equal(result.status, error ? 1 : 0, result.stderr);
      if (error) assert.match(result.stderr, error);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
}
