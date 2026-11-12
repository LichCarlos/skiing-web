import { createRequire } from "node:module";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { once } from "node:events";

// Own temporary read-only preview; no .env rewrite, production access or existing-process stop.
// Run only when this repository has no concurrent Next dev/build process.
const root = resolve(import.meta.dirname, "..");
const require = createRequire(resolve(root, "apps/web/package.json"));
process.env.NEXT_PUBLIC_WEB_API_BASE_URL = "http://127.0.0.1:4314/api/v1";
process.env.NEXT_PUBLIC_WEB_BASE_PATH = "/snow";
process.env.NEXT_PUBLIC_WEB_SITE_ORIGIN = "http://127.0.0.1:4312";
const api = createServer((req, res) => {
  res.setHeader("access-control-allow-origin", "http://127.0.0.1:4312");
  res.setHeader("access-control-allow-credentials", "true");
  res.setHeader("content-type", "application/json");
  if (req.method !== "GET") {
    res.writeHead(405);
    res.end();
    return;
  }
  const path = new URL(req.url, "http://127.0.0.1").pathname;
  const publicList = [
    "/api/v1/resorts",
    "/api/v1/articles",
    "/api/v1/dynamics",
  ].includes(path);
  const status = publicList ? 200 : 401;
  res.writeHead(status);
  res.end(
    JSON.stringify({
      code: status,
      msg: publicList ? "Isolated empty public fixture" : "Anonymous fixture",
      data: publicList
        ? {
            items: [],
            total: 0,
            page: 1,
            pageSize: 3,
            hasNext: false,
            nextCursor: null,
          }
        : null,
    }),
  );
});
api.listen(4314, "127.0.0.1");
await once(api, "listening");
const next = require("next");
const app = next({
  dev: true,
  dir: resolve(root, "apps/web"),
  hostname: "127.0.0.1",
  port: 4312,
  webpack: true,
});
let server;
try {
  await app.prepare();
  server = createServer(app.getRequestHandler());
  server.listen(4312, "127.0.0.1");
  await once(server, "listening");
  const runner = spawn(
    process.execPath,
    [resolve(root, "scripts/community-ui-browser.mjs")],
    {
      cwd: root,
      stdio: "inherit",
      env: {
        ...process.env,
        UI_PREVIEW_ORIGIN: "http://127.0.0.1:4312/snow",
        UI_PREVIEW_SCOPE:
          "Own temporary Next custom dev server with read-only empty API fixture; no production access",
      },
    },
  );
  const [code] = await once(runner, "exit");
  process.exitCode = code ?? 1;
} finally {
  server?.closeAllConnections();
  if (server) await new Promise((done) => server.close(done));
  await app.close();
  api.closeAllConnections();
  await new Promise((done) => api.close(done));
}
process.exit(process.exitCode ?? 0);
