import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  packageStandalone,
  releaseApp,
  verifyStandalone,
  type ReleaseApp,
} from "./package-standalone.ts";

function fixture(app: ReleaseApp = "web") {
  const temporary = mkdtempSync(path.join(tmpdir(), "linji-web-release-"));
  const root = path.join(temporary, "workspace");
  const build = path.join(root, "apps", app, ".next");
  const raw = path.join(build, "standalone");
  const output = path.join(temporary, "artifact");
  function write(file: string, value: string) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, value);
  }
  write(path.join(build, "BUILD_ID"), "release-build");
  write(path.join(build, "static", "chunk.js"), "globalThis.release = true;");
  write(
    path.join(raw, "apps", app, "server.js"),
    'throw new Error("Must never start a service during packaging");',
  );
  write(path.join(raw, "apps", app, ".next", "BUILD_ID"), "release-build");
  write(path.join(root, "apps", app, "public", "logo.svg"), "<svg/>");
  for (const name of ["next", "react", "react-dom"]) {
    const source = path.join(
      root,
      "node_modules",
      ".pnpm",
      name,
      "node_modules",
      name,
    );
    const traced = path.join(
      raw,
      "node_modules",
      ".pnpm",
      name,
      "node_modules",
      name,
    );
    write(
      path.join(source, "package.json"),
      JSON.stringify({ name, version: "16.3.5" }),
    );
    write(
      path.join(source, "untraced-secret.txt"),
      "Not in the tracing output",
    );
    write(
      path.join(traced, "package.json"),
      JSON.stringify({ name, version: "16.3.5" }),
    );
    if (name === "next")
      write(
        path.join(traced, "dist", "server", "lib", "start-server.js"),
        "export {};",
      );
    const link =
      name === "next"
        ? path.join(raw, "apps", app, "node_modules", name)
        : path.join(raw, "node_modules", ".pnpm", "next", "node_modules", name);
    mkdirSync(path.dirname(link), { recursive: true });
    // Emulate absolute Windows pnpm junctions, even on Linux.
    symlinkSync(
      source,
      link,
      process.platform === "win32" ? "junction" : "dir",
    );
  }
  const contract = JSON.stringify({ info: { version: "1.50.0" } });
  write(path.join(root, "contracts", "openapi.json"), contract);
  write(
    path.join(root, "contracts", "openapi.lock.json"),
    JSON.stringify({
      version: "1.50.0",
      sha256: createHash("sha256").update(contract).digest("hex"),
    }),
  );
  write(path.join(root, ".env"), "PRIVATE_KEY=must-not-enter-artifact");
  return {
    temporary,
    root,
    build,
    raw,
    output,
    write,
    close() {
      const target = realpathSync(temporary);
      assert.equal(path.dirname(target), realpathSync(tmpdir()));
      assert.ok(path.basename(target).startsWith("linji-web-release-"));
      rmSync(target, { recursive: true, force: true });
    },
  };
}

for (const app of ["web", "admin"] as const) {
  test(`${app}: relocated package resolves curated dependencies after the source is moved away`, () => {
    const f = fixture(app);
    try {
      const manifest = packageStandalone(f.root, app, f.output);
      assert.equal(manifest.app, app);
      assert.equal(manifest.nextVersion, "16.3.5");
      assert.equal(manifest.links.length, 3);
      assert.equal(existsSync(path.join(f.output, ".env")), false);
      assert.equal(
        existsSync(
          path.join(
            f.output,
            "apps",
            app,
            "node_modules",
            "next",
            "untraced-secret.txt",
          ),
        ),
        false,
      );
      assert.equal(
        readFileSync(
          path.join(f.output, "apps", app, "public", "logo.svg"),
          "utf8",
        ),
        "<svg/>",
      );
      assert.equal(
        existsSync(
          path.join(f.output, "apps", app, ".next", "static", "chunk.js"),
        ),
        true,
      );
      const relocated = path.join(f.temporary, "relocated");
      assert.equal(
        path.dirname(realpathSync(f.output)),
        realpathSync(f.temporary),
      );
      assert.equal(path.dirname(relocated), f.temporary);
      renameSync(f.output, relocated);
      const offline = path.join(f.temporary, "workspace-offline");
      assert.equal(
        path.dirname(realpathSync(f.root)),
        realpathSync(f.temporary),
      );
      assert.equal(path.dirname(offline), f.temporary);
      renameSync(f.root, offline);
      verifyStandalone(relocated, app);
    } finally {
      f.close();
    }
  });
}

test("rejects existing destinations without replacing their contents", () => {
  const f = fixture();
  try {
    f.write(path.join(f.output, "keep.txt"), "existing content");
    assert.throws(
      () => packageStandalone(f.root, "web", f.output),
      /must not exist/,
    );
    assert.equal(
      readFileSync(path.join(f.output, "keep.txt"), "utf8"),
      "existing content",
    );
  } finally {
    f.close();
  }
});

test("rejects symlinked output ancestors into the tracing input", () => {
  const f = fixture();
  try {
    const alias = path.join(f.temporary, "alias");
    symlinkSync(
      f.raw,
      alias,
      process.platform === "win32" ? "junction" : "dir",
    );
    assert.throws(
      () => packageStandalone(f.root, "web", path.join(alias, "nested")),
      /output/,
    );
    assert.equal(existsSync(path.join(f.raw, "nested")), false);
  } finally {
    f.close();
  }
});

for (const missing of ["BUILD_ID", "static"]) {
  test(`rejects missing ${missing} before creating output`, () => {
    const f = fixture();
    try {
      // Only mutate this fixture: rename, no recursive deletion.
      renameSync(
        path.join(f.build, missing),
        path.join(f.build, `${missing}-offline`),
      );
      assert.throws(
        () => packageStandalone(f.root, "web", f.output),
        /build is missing/,
      );
      assert.equal(existsSync(f.output), false);
    } finally {
      f.close();
    }
  });
}

for (const forbidden of [".env", ".env.production", "runtime.log"]) {
  test(`rejects traced ${forbidden}`, () => {
    const f = fixture();
    try {
      f.write(path.join(f.raw, forbidden), "must-not-copy");
      assert.throws(
        () => packageStandalone(f.root, "web", f.output),
        /Environment files/,
      );
      assert.equal(existsSync(path.join(f.output, forbidden)), false);
    } finally {
      f.close();
    }
  });
}

test("rejects mismatched OpenAPI bytes before copying", () => {
  const f = fixture();
  try {
    f.write(path.join(f.root, "contracts", "openapi.json"), "{}");
    assert.throws(
      () => packageStandalone(f.root, "web", f.output),
      /lock mismatch/,
    );
    assert.equal(existsSync(f.output), false);
  } finally {
    f.close();
  }
});

test("rejects inclusion of the other application", () => {
  const f = fixture();
  try {
    f.write(path.join(f.raw, "apps", "admin", "server.js"), "");
    assert.throws(
      () => packageStandalone(f.root, "web", f.output),
      /other app/,
    );
  } finally {
    f.close();
  }
});

test("rejects a traced link outside the artifact and workspace", () => {
  const f = fixture();
  try {
    f.write(path.join(f.temporary, "private", "secret.txt"), "private");
    symlinkSync(
      path.join(f.temporary, "private"),
      path.join(f.raw, "outside"),
      process.platform === "win32" ? "junction" : "dir",
    );
    assert.throws(
      () => packageStandalone(f.root, "web", f.output),
      /Unresolved traced link/,
    );
  } finally {
    f.close();
  }
});

for (const change of [
  "mutate",
  "extra",
  "missing",
  "wrong-platform",
  "wrong-app",
] as const) {
  test(`artifact verification rejects ${change}`, () => {
    const f = fixture();
    try {
      packageStandalone(f.root, "web", f.output);
      const chunk = path.join(
        f.output,
        "apps",
        "web",
        ".next",
        "static",
        "chunk.js",
      );
      if (change === "mutate") f.write(chunk, "changed");
      if (change === "extra")
        f.write(path.join(f.output, "unexpected.txt"), "extra");
      if (change === "missing") renameSync(chunk, `${chunk}.lost`);
      if (change === "wrong-platform") {
        const file = path.join(f.output, "release-manifest.json");
        const manifest = JSON.parse(readFileSync(file, "utf8")) as {
          platform: string;
        };
        manifest.platform = "different-platform";
        f.write(file, JSON.stringify(manifest));
      }
      assert.throws(
        () =>
          verifyStandalone(f.output, change === "wrong-app" ? "admin" : "web"),
        /mismatch/,
      );
    } finally {
      f.close();
    }
  });
}

for (const name of ["../backend", "mobile", undefined]) {
  test(`rejects an unknown app ${name}`, () =>
    assert.throws(() => releaseApp(name), /must be web or admin/));
}
