import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const origin = "https://lichcarlos.top";
const api = `${origin}/snow-api/api/v1`;
const release = "D:/linji-local/20261109/member-ai-viewport-final-release";
const expected = JSON.parse(
  readFileSync(`${release}/release-manifest.json`, "utf8"),
).buildId;
const credentials = Object.fromEntries(
  readFileSync("D:/linji-local/20261105/private/admin-initial.txt", "utf8")
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const index = line.indexOf(": ");
      return [line.slice(0, index), line.slice(index + 2)];
    }),
);
assert.ok(credentials.Account && credentials.Password);
const out = resolve("docs/validation/member-ai-viewport-live-20261109");
mkdirSync(out, { recursive: true });
const report = {
  passed: false,
  at: new Date().toISOString(),
  buildId: expected,
  checks: [],
  pageErrors: [],
  realAiTurns: [],
  createdConversationId: null,
  testConversationDeleted: false,
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
await page.addInitScript(() => {
  const originalFetch = window.fetch;
  window.__aiStream = null;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    if (
      response.url.endsWith("/messages") &&
      response.headers.get("content-type")?.includes("text/event-stream")
    ) {
      const capture = { text: "", finished: false, error: null };
      window.__aiStream = capture;
      const reader = response.clone().body.getReader();
      const decoder = new TextDecoder();
      void (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              capture.text += decoder.decode();
              break;
            }
            capture.text += decoder.decode(value, { stream: true });
          }
        } catch (error) {
          capture.error = String(error);
        } finally {
          capture.finished = true;
          reader.releaseLock();
        }
      })();
    }
    return response;
  };
});
page.on("pageerror", (error) => report.pageErrors.push(String(error)));
async function check(name, action) {
  await action();
  report.checks.push({ name, passed: true });
}
async function get(path) {
  const response = await fetch(origin + path, {
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 200, path);
  return response;
}
async function canvas(color = "rgb(244, 233, 225)") {
  assert.equal(
    await page
      .locator("body")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    color,
  );
  assert.equal(
    await page
      .locator("[data-site-navigation]")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    color,
  );
  assert.equal(
    await page
      .locator("footer")
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    color,
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
}
async function viewport() {
  await page.waitForFunction(
    () =>
      Math.abs(
        document.querySelector("#ai-workspace").getBoundingClientRect().top -
          16,
      ) < 2,
  );
  const result = await page.evaluate(() => {
    const panel = document
      .querySelector("#ai-workspace")
      .getBoundingClientRect();
    const input = document
      .querySelector("#ai-question")
      ?.getBoundingClientRect();
    const button = [...document.querySelectorAll("button")]
      .find((el) => el.textContent.trim() === "发送问题")
      ?.getBoundingClientRect();
    return {
      width: innerWidth,
      height: innerHeight,
      top: panel.top,
      bottom: panel.bottom,
      inputBottom: input?.bottom,
      sendBottom: button?.bottom,
    };
  });
  assert.ok(
    result.top >= 14 && result.bottom <= result.height - 14,
    JSON.stringify(result),
  );
  if (result.inputBottom)
    assert.ok(
      result.inputBottom < result.height && result.sendBottom < result.height,
      JSON.stringify(result),
    );
  report.checks.push({ name: "viewport alignment", ...result, passed: true });
}
async function browserApi(method, path, body) {
  return page.evaluate(
    async ({ api, method, path, body }) => {
      const headers = { "Content-Type": "application/json" };
      if (method !== "GET") {
        const csrf = await (
          await fetch(`${api}/auth/csrf`, { credentials: "include" })
        ).json();
        headers["X-CSRF-Token"] = csrf.data.csrfToken;
      }
      const response = await fetch(api + path, {
        method,
        credentials: "include",
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      return {
        status: response.status,
        value: text ? JSON.parse(text).data : null,
      };
    },
    { api, method, path, body },
  );
}
async function turn(question) {
  await page.getByRole("textbox", { name: "你的问题" }).fill(question);
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/messages") &&
      response.request().method() === "POST",
    { timeout: 45000 },
  );
  await page.getByRole("button", { name: "发送问题", exact: true }).click();
  const response = await responsePromise;
  assert.equal(response.status(), 200, `AI stream HTTP ${response.status()}`);
  assert.ok(response.headers()["content-type"]?.includes("text/event-stream"));
  await page
    .getByRole("textbox", { name: "你的问题" })
    .waitFor({ timeout: 190000 });
  await page.waitForFunction(() => window.__aiStream?.finished, undefined, {
    timeout: 190000,
  });
  const content = await page.evaluate(() => window.__aiStream.text);
  const completed = [
    ...content.matchAll(/event:\s*completed\r?\ndata:\s*([^\r\n]+)/g),
  ].at(-1);
  assert.ok(completed, "No completed AI event");
  const message = JSON.parse(completed[1]);
  assert.equal(message.role, "assistant");
  assert.equal(message.status, "complete");
  assert.ok(message.content.trim().length > 0);
  await page
    .getByRole("log")
    .getByText(message.content, { exact: true })
    .waitFor();
  const entry = {
    question,
    messageId: message.messageId,
    characters: message.content.length,
    citations: message.citations.map((item) => ({
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      title: item.title,
    })),
    deltaEvents: (content.match(/event:\s*delta/g) || []).length,
    completed: true,
  };
  report.realAiTurns.push(entry);
  return message;
}
try {
  await check("new build and official pages serve HTTPS 200", async () => {
    for (const path of [
      "/snow",
      "/snow/me",
      "/snow/me/ai",
      "/snow/me/new",
      "/snow/login",
      "/snow/resorts",
      "/snow/knowledge",
      "/snow/knowledge/1",
      "/snow/dynamics",
      "/snow/about",
    ]) {
      const html = await (await get(path)).text();
      assert.ok(html.includes(expected), `${path} wrong build`);
      if (path.includes("/me")) assert.ok(html.includes("noindex"));
      if (path === "/snow/me/ai") {
        const assets = [
          ...new Set(
            [
              ...html.matchAll(
                /(?:src|href)="(\/snow\/_next\/static\/[^"<>]+)"/g,
              ),
            ].map((match) => match[1].replaceAll("&amp;", "&")),
          ),
        ];
        for (const asset of assets)
          assert.ok((await (await get(asset)).arrayBuffer()).byteLength > 0);
        report.checks.push({
          name: "AI page static resources",
          count: assets.length,
          passed: true,
        });
      }
    }
  });
  await check(
    "API healthy; anonymous private conversations rejected",
    async () => {
      const health = await (await get("/snow-api/api/v1/health")).json();
      assert.equal(health.data.status, "ok");
      assert.equal((await fetch(api + "/ai/conversations")).status, 401);
      const schema = await (await get("/snow-api/api/docs-json")).json();
      assert.equal(schema.info.version, "1.54.0");
    },
  );
  await check(
    "article and personal-center canvas use reference color",
    async () => {
      await page.goto(`${origin}/snow/knowledge/1`);
      await canvas();
      await page.screenshot({
        path: resolve(out, "article-desktop.png"),
        fullPage: true,
      });
      await page.goto(`${origin}/snow/me`);
      await page
        .getByRole("link", { name: "登录 / 注册", exact: true })
        .waitFor();
      await canvas();
    },
  );
  await check(
    "real login returns to personal center with AI entry",
    async () => {
      await page
        .getByRole("link", { name: "登录 / 注册", exact: true })
        .click();
      await page
        .getByRole("textbox", { name: "账号", exact: true })
        .fill(credentials.Account);
      await page.getByLabel("密码", { exact: true }).fill(credentials.Password);
      await page
        .getByRole("button", { name: "登录，继续雪上旅程", exact: true })
        .click();
      await page
        .getByRole("navigation", { name: "个人中心", exact: true })
        .waitFor();
      const current = await browserApi("GET", "/auth/me");
      assert.equal(current.status, 200);
      assert.ok(
        current.value.permissionKeys.includes("ai:conversation:use"),
        "Acceptance account lacks AI permission",
      );
      await page
        .getByRole("navigation", { name: "个人中心", exact: true })
        .getByRole("link", { name: "我的 AI 对话", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "我的 AI 对话", exact: true })
        .waitFor();
      await canvas();
    },
  );
  await check("real conversation creation through website", async () => {
    const createdResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/ai/conversations") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "新建对话", exact: true }).click();
    const response = await createdResponse;
    assert.equal(response.status(), 201);
    report.createdConversationId = (await response.json()).data.conversationId;
    await page.getByRole("textbox", { name: "你的问题" }).waitFor();
    await viewport();
  });
  await check(
    "real model streams first answer with saved completion",
    async () => {
      await turn("第一次滑雪前，应该检查哪些基本装备？请简要回答。");
    },
  );
  await check("real continuous follow-up and history restoration", async () => {
    const answer = await turn(
      "根据刚才的建议，头盔应该怎样检查是否合适？请简要回答。",
    );
    const result = await browserApi(
      "GET",
      `/ai/conversations/${report.createdConversationId}`,
    );
    assert.equal(result.status, 200);
    assert.equal(result.value.messages.length, 4);
    assert.equal(result.value.messages.at(-1).messageId, answer.messageId);
    await page.reload();
    await page
      .getByRole("log")
      .getByText(answer.content, { exact: true })
      .waitFor();
    await viewport();
    await page.screenshot({
      path: resolve(out, "ai-desktop.png"),
      fullPage: false,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await canvas();
    await page
      .locator("#ai-workspace")
      .evaluate((el) =>
        el.scrollIntoView({ block: "start", behavior: "instant" }),
      );
    await viewport();
    await page.screenshot({
      path: resolve(out, "ai-mobile.png"),
      fullPage: false,
    });
  });
  await check(
    "mobile history opens and restores the same conversation",
    async () => {
      await page.getByRole("button", { name: "历史对话", exact: true }).click();
      const current = page.locator('#ai-history a[aria-current="page"]');
      await current.click();
      await page.getByRole("textbox", { name: "你的问题" }).waitFor();
      await viewport();
    },
  );
  await check(
    "delete only the acceptance conversation through website",
    async () => {
      await page.getByRole("button", { name: "删除对话", exact: true }).click();
      await page.getByRole("button", { name: "确认删除", exact: true }).click();
      await page
        .getByRole("heading", { name: "今天想了解什么？", exact: true })
        .waitFor();
      assert.equal(
        (
          await browserApi(
            "GET",
            `/ai/conversations/${report.createdConversationId}`,
          )
        ).status,
        404,
      );
      report.testConversationDeleted = true;
    },
  );
  await check("real logout clears private UI", async () => {
    await page.getByRole("button", { name: "退出登录", exact: true }).click();
    await page
      .getByRole("link", { name: "登录 / 注册", exact: true })
      .waitFor();
    assert.equal(await page.getByRole("log").count(), 0);
  });
  await check("homepage and directory colors remain", async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const [path, color] of [
      ["", "rgb(255, 218, 61)"],
      ["/resorts", "rgb(36, 85, 245)"],
      ["/knowledge", "rgb(0, 173, 71)"],
      ["/dynamics", "rgb(220, 47, 67)"],
    ]) {
      await page.goto(`${origin}/snow${path}`);
      await canvas(color);
    }
  });
  assert.deepEqual(report.pageErrors, []);
  report.passed = true;
} catch (error) {
  report.error = String(error);
  await page
    .screenshot({ path: resolve(out, "failure.png"), fullPage: true })
    .catch(() => {});
  console.error(
    page.url(),
    (
      await page
        .locator("body")
        .innerText()
        .catch(() => "")
    ).slice(0, 2200),
  );
  process.exitCode = 1;
} finally {
  if (report.createdConversationId && !report.testConversationDeleted) {
    try {
      const result = await browserApi(
        "DELETE",
        `/ai/conversations/${report.createdConversationId}`,
      );
      report.testConversationDeleted = [204, 404].includes(result.status);
    } catch {
      report.cleanupRequired = true;
    }
  }
  if (!report.passed) {
    try {
      await browserApi("POST", "/auth/logout", {});
    } catch {}
  }
  writeFileSync(resolve(out, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify(report));
}
