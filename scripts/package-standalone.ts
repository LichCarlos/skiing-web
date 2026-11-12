import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type ReleaseApp = "web" | "admin";
type FileEntry = { path: string; size: number; sha256: string };
type LinkEntry = { path: string; target: string };
type Inventory = { files: FileEntry[]; links: LinkEntry[] };
type ReleaseManifest = Inventory & {
  schemaVersion: 1;
  app: ReleaseApp;
  platform: string;
  arch: string;
  nodeMajor: number;
  nextVersion: string;
  buildId: string;
  openapi: { version: string; sha256: string };
};
const repository = fileURLToPath(new URL("../", import.meta.url));
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const slash = (value: string) => value.split(path.sep).join("/");

function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

export function releaseApp(value: string | undefined): ReleaseApp {
  if (value !== "web" && value !== "admin")
    throw new Error("App must be web or admin");
  return value;
}

function allowed(relative: string): boolean {
  return !slash(relative)
    .split("/")
    .some(
      (name) =>
        name === ".git" ||
        name === ".env" ||
        name.startsWith(".env.") ||
        name.endsWith(".log"),
    );
}

function inventory(root: string): Inventory {
  const files: FileEntry[] = [];
  const links: LinkEntry[] = [];
  function walk(directory: string): void {
    for (const entry of readdirSync(directory).sort()) {
      const absolute = path.join(directory, entry);
      const relative = slash(path.relative(root, absolute));
      if (!allowed(relative))
        throw new Error(`Disallowed release input: ${relative}`);
      if (relative === "release-manifest.json") continue;
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        const target = readlinkSync(absolute);
        if (
          path.isAbsolute(target) ||
          !inside(root, path.resolve(directory, target)) ||
          !inside(root, realpathSync(absolute))
        ) {
          throw new Error(`Release link escapes artifact: ${relative}`);
        }
        links.push({ path: relative, target: slash(target) });
      } else if (stat.isDirectory()) walk(absolute);
      else if (stat.isFile())
        files.push({
          path: relative,
          size: stat.size,
          sha256: hash(readFileSync(absolute)),
        });
      else throw new Error(`Unsupported release entry: ${relative}`);
    }
  }
  walk(root);
  return { files, links };
}

// Copy curated Next tracing output. Never follow links into the source workspace.
// Windows junction targets are rebased onto their equivalent traced artifact path.
function copyTree(
  source: string,
  destination: string,
  sourceRoot: string,
  tracingRoot: string,
  outputRoot = destination,
): void {
  const stat = lstatSync(source);
  if (stat.isSymbolicLink()) {
    const resolved = path.resolve(path.dirname(source), readlinkSync(source));
    const traced = inside(sourceRoot, resolved)
      ? resolved
      : inside(tracingRoot, resolved)
        ? path.join(sourceRoot, path.relative(tracingRoot, resolved))
        : null;
    if (!traced || !inside(sourceRoot, traced) || !existsSync(traced)) {
      throw new Error(
        `Unresolved traced link: ${path.relative(sourceRoot, source)}`,
      );
    }
    const outputTarget = path.join(
      outputRoot,
      path.relative(sourceRoot, traced),
    );
    mkdirSync(path.dirname(destination), { recursive: true });
    symlinkSync(
      path.relative(path.dirname(destination), outputTarget),
      destination,
      statSync(traced).isDirectory() ? "dir" : "file",
    );
    return;
  }
  if (stat.isDirectory()) {
    mkdirSync(destination, { recursive: true });
    for (const name of readdirSync(source).sort()) {
      const next = path.join(source, name);
      if (!allowed(path.relative(sourceRoot, next)))
        throw new Error("Environment files and logs cannot enter a release");
      copyTree(
        next,
        path.join(destination, name),
        sourceRoot,
        tracingRoot,
        outputRoot,
      );
    }
    return;
  }
  if (!stat.isFile()) throw new Error("Unsupported release input");
  mkdirSync(path.dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}

export function packageStandalone(
  root: string,
  app: ReleaseApp,
  output: string,
): ReleaseManifest {
  root = realpathSync(root);
  const appRoot = path.join(root, "apps", app);
  const build = path.join(appRoot, ".next");
  const source = path.join(build, "standalone");
  let ancestor = path.resolve(root, output);
  const suffix: string[] = [];
  while (!existsSync(ancestor)) {
    suffix.unshift(path.basename(ancestor));
    const parent = path.dirname(ancestor);
    if (parent === ancestor)
      throw new Error("Release output drive is unavailable");
    ancestor = parent;
  }
  const destination = path.join(realpathSync(ancestor), ...suffix);
  const standard = path.join(build, "release");
  if (
    inside(root, destination) &&
    destination !== standard &&
    !inside(path.join(root, "dist"), destination)
  ) {
    throw new Error(
      "In-repository output must be this app .next/release or dist",
    );
  }
  if (inside(source, destination) || inside(destination, source))
    throw new Error("Release output overlaps its tracing input");
  if (existsSync(destination))
    throw new Error(
      "Release destination must not exist; choose a new output directory",
    );
  for (const file of [
    path.join(source, "apps", app, "server.js"),
    path.join(build, "BUILD_ID"),
    path.join(build, "static"),
  ]) {
    if (!existsSync(file))
      throw new Error("Standalone build is missing; build this app first");
  }
  const contractBytes = readFileSync(
    path.join(root, "contracts", "openapi.json"),
  );
  const contract = JSON.parse(contractBytes.toString("utf8")) as {
    info: { version: string };
  };
  const lock = JSON.parse(
    readFileSync(path.join(root, "contracts", "openapi.lock.json"), "utf8"),
  ) as { version: string; sha256: string };
  if (
    hash(contractBytes) !== lock.sha256 ||
    contract.info.version !== lock.version
  )
    throw new Error("OpenAPI lock mismatch");
  const other = app === "web" ? "admin" : "web";
  if (existsSync(path.join(source, "apps", other)))
    throw new Error("Artifact contains the other app");
  copyTree(source, destination, source, root);
  const runtime = path.join(destination, "apps", app);
  copyTree(
    path.join(build, "static"),
    path.join(runtime, ".next", "static"),
    path.join(build, "static"),
    root,
  );
  const publicDirectory = path.join(appRoot, "public");
  if (existsSync(publicDirectory))
    copyTree(
      publicDirectory,
      path.join(runtime, "public"),
      publicDirectory,
      root,
    );
  writeFileSync(
    path.join(destination, "start.mjs"),
    `process.env.PORT ??= "${app === "web" ? "3000" : "3001"}";\nprocess.env.HOSTNAME ??= "127.0.0.1";\nawait import("./apps/${app}/server.js");\n`,
  );
  const next = JSON.parse(
    readFileSync(
      path.join(runtime, "node_modules", "next", "package.json"),
      "utf8",
    ),
  ) as { version: string };
  const manifest: ReleaseManifest = {
    schemaVersion: 1,
    app,
    platform: process.platform,
    arch: process.arch,
    nodeMajor: Number(process.versions.node.split(".")[0]),
    nextVersion: next.version,
    buildId: readFileSync(path.join(build, "BUILD_ID"), "utf8").trim(),
    openapi: { version: lock.version, sha256: lock.sha256 },
    ...inventory(destination),
  };
  writeFileSync(
    path.join(destination, "release-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  verifyStandalone(destination, app);
  return manifest;
}

export function verifyStandalone(
  destination: string,
  app: ReleaseApp,
): ReleaseManifest {
  destination = realpathSync(destination);
  if (!lstatSync(path.join(destination, "release-manifest.json")).isFile())
    throw new Error("Artifact manifest must be a regular file");
  const manifest = JSON.parse(
    readFileSync(path.join(destination, "release-manifest.json"), "utf8"),
  ) as ReleaseManifest;
  if (
    manifest.schemaVersion !== 1 ||
    manifest.app !== app ||
    manifest.nodeMajor !== 22 ||
    manifest.nodeMajor !== Number(process.versions.node.split(".")[0]) ||
    manifest.platform !== process.platform ||
    manifest.arch !== process.arch
  ) {
    throw new Error("Artifact app/platform/Node version mismatch");
  }
  const actual = inventory(destination);
  if (
    JSON.stringify(actual) !==
    JSON.stringify({ files: manifest.files, links: manifest.links })
  )
    throw new Error("Artifact integrity mismatch");
  const resolver = createRequire(
    path.join(destination, "apps", app, "server.js"),
  );
  const nextPackage = resolver.resolve("next/package.json");
  const nextResolver = createRequire(nextPackage);
  for (const resolved of [
    nextPackage,
    resolver.resolve("next/dist/server/lib/start-server.js"),
    nextResolver.resolve("react/package.json"),
    nextResolver.resolve("react-dom/package.json"),
  ]) {
    if (!inside(destination, realpathSync(resolved)))
      throw new Error("Runtime dependency resolves outside artifact");
  }
  const actualNext = JSON.parse(readFileSync(nextPackage, "utf8")) as {
    version: string;
  };
  if (
    actualNext.version !== manifest.nextVersion ||
    readFileSync(
      path.join(destination, "apps", app, ".next", "BUILD_ID"),
      "utf8",
    ).trim() !== manifest.buildId
  )
    throw new Error("Artifact build metadata mismatch");
  for (const file of [
    "start.mjs",
    `apps/${app}/server.js`,
    `apps/${app}/.next/BUILD_ID`,
  ]) {
    if (!existsSync(path.join(destination, file)))
      throw new Error("Artifact entry is incomplete");
  }
  return manifest;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [command, name, output, ...extra] = process.argv.slice(2);
  if (!output || extra.length || (command !== "pack" && command !== "verify"))
    throw new Error(
      "Usage: package-standalone.ts pack|verify web|admin OUTPUT",
    );
  const app = releaseApp(name);
  const manifest =
    command === "pack"
      ? packageStandalone(repository, app, output)
      : verifyStandalone(path.resolve(repository, output), app);
  console.log(
    JSON.stringify({
      app: manifest.app,
      buildId: manifest.buildId,
      nextVersion: manifest.nextVersion,
      files: manifest.files.length,
      links: manifest.links.length,
      openapi: manifest.openapi,
      output: path.resolve(repository, output),
    }),
  );
}
