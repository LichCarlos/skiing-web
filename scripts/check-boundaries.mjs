import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { isBuiltin } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const fields = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];
const workspaces = ["apps", "packages", "tooling"].flatMap((kind) =>
  readdirSync(path.join(root, kind), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = path.join(root, kind, entry.name);
      const manifest = JSON.parse(
        readFileSync(path.join(dir, "package.json"), "utf8"),
      );
      return {
        dir,
        kind,
        manifest,
        deps: Object.assign({}, ...fields.map((field) => manifest[field])),
      };
    }),
);
const failures = [];
const fail = (file, reason) =>
  failures.push(`${path.relative(root, file)}: ${reason}`);
const inside = (file, dir) => file === dir || file.startsWith(dir + path.sep);
const canonical = (file) =>
  existsSync(file) ? realpathSync(file) : path.resolve(file);
const ownerOf = (file) =>
  workspaces.find((w) => inside(canonical(file), w.dir));
const byName = new Map(workspaces.map((w) => [w.manifest.name, w]));
const packageName = (specifier) =>
  specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : specifier.split("/")[0];
const exportTargets = (value) =>
  typeof value === "string"
    ? [value]
    : value && typeof value === "object"
      ? Object.values(value).flatMap(exportTargets)
      : [];
function sourceTarget(file) {
  return [
    file,
    ...[
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      ".mjs",
      ".mts",
      ".cts",
      ".cjs",
      ".json",
      ".css",
    ].map((ext) => file + ext),
    ...["index.ts", "index.tsx", "index.js"].map((name) =>
      path.join(file, name),
    ),
  ].find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}
function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (
      ["node_modules", ".next", ".turbo", "dist", "coverage"].includes(
        entry.name,
      )
    )
      continue;
    const file = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      fail(file, "源码不能通过符号链接绕过 workspace 边界");
    } else if (entry.isDirectory()) yield* files(file);
    else yield file;
  }
}

for (const workspace of workspaces) {
  const manifestPath = path.join(workspace.dir, "package.json");
  for (const field of fields) {
    for (const [name, version] of Object.entries(
      workspace.manifest[field] ?? {},
    )) {
      const target = byName.get(name);
      if (!target) {
        if (name.startsWith("@common/"))
          fail(manifestPath, `工作空间包尚未创建 ${name}`);
        continue;
      }
      if (version !== "workspace:*")
        fail(manifestPath, `${name} 必须使用 workspace:*`);
      if (target.kind === "apps") fail(manifestPath, `禁止依赖应用 ${name}`);
      if (target === workspace) fail(manifestPath, "禁止包依赖自身");
    }
  }
  for (const [key, value] of Object.entries(workspace.manifest.exports ?? {})) {
    if (!key.startsWith(".") || key.includes("*"))
      fail(manifestPath, `请显式登记公开 exports，不使用通配符：${key}`);
    for (const target of exportTargets(value)) {
      const resolved = path.resolve(workspace.dir, target);
      if (
        !target.startsWith("./") ||
        target.includes("*") ||
        ownerOf(resolved) !== workspace ||
        !existsSync(resolved)
      )
        fail(manifestPath, `无效的 exports 目标 ${key}: ${target}`);
    }
  }

  const check = (file, specifier, css = false) => {
    if (specifier.startsWith("@/")) {
      const src = path.join(workspace.dir, "src");
      const resolved = path.resolve(src, specifier.slice(2));
      const target = sourceTarget(resolved);
      if (
        workspace.kind !== "apps" ||
        !inside(canonical(target ?? resolved), src)
      )
        fail(file, `@/ 只能指向当前应用 src：${specifier}`);
      else if (!target) fail(file, `本端模块不存在 ${specifier}`);
      return;
    }
    if (specifier.startsWith(".")) {
      const resolved = path.resolve(path.dirname(file), specifier);
      const target = sourceTarget(resolved);
      if (ownerOf(target ?? resolved) !== workspace)
        fail(file, `禁止跨包相对导入 ${specifier}`);
      if (
        !css &&
        workspace.kind === "apps" &&
        inside(file, path.join(workspace.dir, "src"))
      )
        fail(file, `应用内部统一使用 @/：${specifier}`);
      return;
    }
    if (isBuiltin(specifier)) return;
    if (
      path.isAbsolute(specifier) ||
      specifier.includes(":") ||
      specifier.startsWith("#")
    ) {
      fail(file, `不支持绕过包名和 @/ 的模块路径 ${specifier}`);
      return;
    }
    const name = packageName(specifier);
    const target = byName.get(name);
    if (!target) {
      if (name.startsWith("@common/")) fail(file, `工作空间包尚未创建 ${name}`);
      else if (!workspace.deps[name])
        fail(file, `未声明外部依赖或未知别名 ${name}`);
      return;
    }
    if (target === workspace)
      fail(file, `包内实现使用相对路径，不自引用公开入口 ${specifier}`);
    if (target.kind === "apps") fail(file, `禁止引用应用 ${specifier}`);
    if (!workspace.deps[name] && target !== workspace)
      fail(file, `未声明依赖 ${name}`);
    const subpath = specifier.slice(name.length);
    if (subpath.split("/").some((part) => ["..", ".", "src"].includes(part)))
      fail(file, `禁止深层源码或路径回退导入 ${specifier}`);
    const key = "." + subpath;
    if (!exportTargets(target.manifest.exports?.[key]).length)
      fail(file, `未公开的包入口 ${specifier}`);
  };

  const tsconfig = path.join(workspace.dir, "tsconfig.json");
  if (existsSync(tsconfig)) {
    const raw = ts.readConfigFile(tsconfig, ts.sys.readFile);
    if (raw.error) fail(tsconfig, "无法解析 TypeScript 配置");
    for (const extension of [raw.config?.extends ?? []].flat())
      check(tsconfig, extension);
    const config = ts.getParsedCommandLineOfConfigFile(
      tsconfig,
      {},
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: () =>
          fail(tsconfig, "无法解析 TypeScript 配置"),
      },
    );
    const options = config?.options;
    if (workspace.kind === "apps") {
      const aliases = options?.paths ?? {};
      if (
        Object.keys(aliases).length !== 1 ||
        aliases["@/*"]?.length !== 1 ||
        path.resolve(
          options?.baseUrl ?? workspace.dir,
          aliases["@/*"]?.[0] ?? "",
        ) !== path.join(workspace.dir, "src/*")
      )
        fail(
          tsconfig,
          "应用只使用 @/* -> ./src/*，不得遮蔽工作空间包或添加其他源码别名",
        );
    }
    for (const [alias, targets] of Object.entries(options?.paths ?? {})) {
      if (alias.startsWith("@common/") || alias === "*")
        fail(tsconfig, `不能用 paths 覆盖包名 ${alias}`);
      for (const target of targets) {
        if (
          ownerOf(
            path.resolve(
              options.baseUrl ?? workspace.dir,
              target.replaceAll("*", "__alias__"),
            ),
          ) !== workspace
        )
          fail(tsconfig, `别名 ${alias} 越过 workspace 边界`);
      }
    }
  }
  for (const file of files(workspace.dir)) {
    if (path.basename(file).startsWith(".env"))
      fail(file, "环境文件只能放在项目根目录");
    if (path.basename(file) === "next-env.d.ts") continue;
    if (file.endsWith(".css")) {
      const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const match of css.matchAll(
        /@import\s+(?:url\(\s*)?["']([^"']+)["']/g,
      ))
        check(file, match[1], true);
      continue;
    }
    if (!/\.(?:[cm]?[jt]s|[jt]sx)$/.test(file)) continue;
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const literal = (node) => {
      if (
        node &&
        (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      )
        check(file, node.text);
      else fail(file, "模块路径必须为静态字符串，不能动态拼接绕过边界检查");
    };
    const visit = (node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier
      )
        literal(node.moduleSpecifier);
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          node.expression.getText(source) === "require")
      )
        literal(node.arguments[0]);
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
        literal(node.argument.literal);
      if (ts.isExternalModuleReference(node)) literal(node.expression);
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
}

// Workspace cycles affect independent builds even when every individual import is public.
const visited = new Set();
const active = new Set();
function visitWorkspace(workspace, trail = []) {
  const name = workspace.manifest.name;
  if (active.has(name)) {
    fail(
      path.join(workspace.dir, "package.json"),
      `workspace 依赖循环：${[...trail, name].join(" -> ")}`,
    );
    return;
  }
  if (visited.has(name)) return;
  active.add(name);
  for (const dependency of Object.keys(workspace.deps)) {
    if (byName.has(dependency))
      visitWorkspace(byName.get(dependency), [...trail, name]);
  }
  active.delete(name);
  visited.add(name);
}
workspaces.forEach((workspace) => visitWorkspace(workspace));
if (failures.length) {
  console.error([...new Set(failures)].join("\n"));
  process.exitCode = 1;
} else console.log(`依赖边界检查通过：${workspaces.length} 个 workspace`);
