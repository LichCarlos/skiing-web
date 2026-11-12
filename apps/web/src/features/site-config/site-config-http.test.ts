import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "@common/api-contracts/client";
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
import { apiRequest } from "@/platform/api";
import {
  readSiteConfig,
  type SiteConfig,
} from "@/features/site-config/site-config-api";
import {
  SiteConfigRun,
  type ConfigState,
} from "@/features/site-config/site-config-run";
const data: SiteConfig = {
  siteName: "雪客",
  tagline: "滑雪平台",
  about: "公开介绍",
  contactEmail: null,
  privacyPolicy: "隐私正文\n第二段",
  termsOfService: null,
  revision: "a".repeat(64),
};
let server: Server;
let mode: "valid" | "invalid" | "unauthorized" | "slow";
let requests: string[];
let received: () => void;
let disconnected: () => void;
beforeEach(async () => {
  mode = "valid";
  requests = [];
  received = () => {};
  disconnected = () => {};
  server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    response.on("close", () => disconnected());
    if (mode === "slow") {
      response.writeHead(200, { "content-type": "application/json" });
      response.write('{"code":200,"msg":"success","data":');
      received();
      return;
    }
    const code = mode === "unauthorized" ? 401 : 200;
    response.writeHead(code, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        code,
        msg: code === 401 ? "Unauthorized" : "success",
        traceId: "loopback-public-config",
        data:
          mode === "unauthorized"
            ? null
            : {
                ...data,
                ...(mode === "invalid" ? { privacyPolicy: {} } : {}),
                privateKey: "not-public",
              },
      }),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing loopback address");
  const client = createApiClient(`http://127.0.0.1:${address.port}/api/v1`, {
    credentials: "include",
    csrfProtection: true,
  });
  vi.mocked(apiRequest).mockImplementation(client.request);
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  vi.clearAllMocks();
});
describe("public config wire adapter (real Node HTTP, synthetic API)", () => {
  it("unwraps the existing envelope, validates and strips nonpublic fields", async () => {
    expect(await readSiteConfig()).toEqual(data);
    expect(requests).toEqual(["GET /api/v1/public/config"]);
  });
  it("rejects malformed content in a successful HTTP envelope", async () => {
    mode = "invalid";
    await expect(readSiteConfig()).rejects.toThrow(TypeError);
    expect(requests).toHaveLength(1);
  });
  it("does not issue csrf or refresh requests after a public HTTP 401", async () => {
    mode = "unauthorized";
    await expect(readSiteConfig()).rejects.toMatchObject({
      status: 401,
      traceId: "loopback-public-config",
    });
    expect(requests).toEqual(["GET /api/v1/public/config"]);
  });
  it("cancels an unfinished JSON body and closes the connection", async () => {
    mode = "slow";
    const started = new Promise<void>((resolve) => {
      received = resolve;
    });
    const closed = new Promise<void>((resolve) => {
      disconnected = resolve;
    });
    const abort = new AbortController();
    const work = readSiteConfig(abort.signal);
    const rejected = expect(work).rejects.toBeDefined();
    await started;
    abort.abort();
    await rejected;
    await closed;
    expect(requests).toHaveLength(1);
  });
  it("moves from an invalid wire response to an explicit successful page retry", async () => {
    mode = "invalid";
    const states: ConfigState[] = [];
    const run = new SiteConfigRun({
      pathname: () => "/privacy",
      read: readSiteConfig,
      changed: (state) => {
        states.push(state);
      },
    });
    const cleanup = run.activate("/privacy");
    await vi.waitFor(() =>
      expect(states.at(-1)).toMatchObject({
        error: true,
        loading: false,
        data: null,
      }),
    );
    mode = "valid";
    await run.reload("/privacy");
    expect(states.at(-1)).toMatchObject({ data, error: false, loading: false });
    expect(requests).toHaveLength(2);
    cleanup();
  });
});
