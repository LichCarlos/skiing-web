import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

// All auth/AI writes below are browser fixtures. Public page data uses read-only production API.
const origin = "http://127.0.0.1:3110";
const api = "https://lichcarlos.top/snow-api/api/v1";
const out = resolve("docs/validation/member-ai-viewport-20261109");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
const errors = [];
const id = "ad4117b2-1f3e-4d13-ae12-f15d65b8fdef";
const newId = "b9fef499-7d12-4d88-b9ab-9e08936a6cc0";
const time = "2026-11-07T08:00:00Z";
const account = {
  userId: 7,
  account: "snow.user",
  nickname: "雪友",
  avatarUrl: null,
  roles: [{ roleKey: "user", roleName: "用户" }],
  permissionKeys: [
    "account:profile:read",
    "member:favorite:toggle",
    "community:dynamic:read-own",
    "ai:conversation:use",
  ],
  menuTree: [],
  merchant: null,
};
const sample = {
  messageId: "2",
  role: "assistant",
  status: "complete",
  content: "先选择适合初学者的雪道，并检查头盔和护具。",
  citations: [
    {
      sourceType: "article",
      sourceId: "1",
      title: "滑雪入门",
      excerpt: "出发前检查装备。",
      href: "javascript:alert(1)",
    },
  ],
  createdAt: time,
};
const summary = {
  conversationId: id,
  title: "第一次滑雪的准备",
  status: "active",
  createdAt: time,
  updatedAt: time,
  messageCount: 1,
};
async function setup(width, opts = {}) {
  const context = await browser.newContext({
    viewport: { width, height: opts.height ?? 900 },
    reducedMotion: opts.motion ?? "reduce",
  });
  const state = {
    loggedIn: true,
    allowed: true,
    deleted: false,
    truncate: false,
    posts: [],
    conversations: [{ ...summary, messages: [sample] }],
    ...opts,
  };
  const cors = {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type,x-csrf-token",
  };
  await context.route(`${api}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/snow-api/api/v1", "");
    const method = request.method();
    const json = (data, status = 200) =>
      route.fulfill({
        status,
        headers: { ...cors, "content-type": "application/json" },
        body: JSON.stringify({
          code: status,
          msg: status < 400 ? "OK" : "Unavailable",
          data,
          traceId: "browser-fixture",
        }),
      });
    if (method === "OPTIONS")
      return route.fulfill({ status: 204, headers: cors });
    if (path === "/auth/me")
      return json(
        state.allowed ? account : { ...account, permissionKeys: [] },
        state.loggedIn ? 200 : 401,
      );
    if (path === "/auth/csrf") return json({ csrfToken: "browser-csrf" });
    if (path === "/auth/refresh") return json(null, 401);
    if (path === "/auth/logout") {
      state.loggedIn = false;
      return json({ loggedOut: true });
    }
    if (path === "/me/dynamics")
      return json({
        items: [],
        page: 1,
        pageSize: 12,
        total: 0,
        hasNext: false,
      });
    if (path === "/ai/conversations" && method === "GET") {
      const page = Number(url.searchParams.get("page") || 1);
      return json({
        items: state.conversations
          .slice((page - 1) * 20, page * 20)
          .map(({ messages, ...item }) => ({
            ...item,
            messageCount: messages.length,
          })),
        total: state.conversations.length,
        page,
        pageSize: 20,
      });
    }
    if (path === "/ai/conversations" && method === "POST") {
      assert.equal(request.headers()["x-csrf-token"], "browser-csrf");
      const item = {
        ...summary,
        conversationId: newId,
        title: null,
        messageCount: 0,
        messages: [],
      };
      state.conversations.unshift(item);
      const { messages, ...created } = item;
      return json(created, 201);
    }
    const match = /^\/ai\/conversations\/([^/]+)(\/messages)?$/.exec(path);
    if (match) {
      const conversation = state.conversations.find(
        (item) => item.conversationId === match[1],
      );
      if (!conversation) return json(null, 404);
      if (method === "GET")
        return json({
          ...conversation,
          messageCount: conversation.messages.length,
        });
      if (method === "DELETE") {
        state.conversations = state.conversations.filter(
          (item) => item !== conversation,
        );
        return route.fulfill({ status: 204, headers: cors });
      }
      if (method === "POST" && match[2]) {
        assert.equal(request.headers()["x-csrf-token"], "browser-csrf");
        const body = request.postDataJSON();
        state.posts.push(body);
        const delta = `event: delta\r\ndata: ${JSON.stringify({ text: "先检查头盔与护具。" })}\r\n\r\n`;
        if (state.truncate) {
          state.truncate = false;
          return route.fulfill({
            headers: { ...cors, "content-type": "text/event-stream" },
            body: delta,
          });
        }
        const message = {
          ...sample,
          messageId: String(conversation.messages.length + 2),
          content: `建议：${body.content}，先检查头盔与护具。`,
        };
        conversation.messages.push(
          {
            messageId: String(conversation.messages.length + 1),
            role: "user",
            status: "complete",
            content: body.content,
            citations: [],
            createdAt: time,
          },
          message,
        );
        return route.fulfill({
          headers: { ...cors, "content-type": "text/event-stream" },
          body: `${delta}event: completed\r\ndata: ${JSON.stringify(message)}\r\n\r\n`,
        });
      }
    }
    if (method === "GET" && path.startsWith("/public/")) {
      const response = await fetch(request.url(), {
        headers: { Origin: "https://lichcarlos.top" },
      });
      return route.fulfill({
        status: response.status,
        headers: { ...cors, "content-type": "application/json" },
        body: await response.text(),
      });
    }
    throw new Error(`Unexpected fixture request: ${method} ${path}`);
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
  return { context, page, state };
}
async function check(name, action) {
  await action();
  results.push({ name, status: "passed" });
}
async function viewport(page) {
  const box = await page.evaluate(() => {
    const panel = document
      .querySelector("#ai-workspace")
      .getBoundingClientRect();
    const input = document
      .querySelector("#ai-question")
      .getBoundingClientRect();
    const send = [...document.querySelectorAll("button")]
      .find((el) => el.textContent.trim() === "发送问题")
      .getBoundingClientRect();
    const log = document.querySelector('[role="log"]');
    return {
      top: panel.top,
      bottom: panel.bottom,
      height: innerHeight,
      inputBottom: input.bottom,
      sendBottom: send.bottom,
      logHeight: log.clientHeight,
      logScroll: log.scrollHeight,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  assert.ok(
    box.top >= 14 && box.bottom <= box.height - 14,
    JSON.stringify(box),
  );
  assert.ok(
    box.inputBottom <= box.height && box.sendBottom <= box.height,
    JSON.stringify(box),
  );
  assert.ok(
    box.logHeight > 40 && box.logScroll > box.logHeight,
    JSON.stringify(box),
  );
  assert.equal(box.overflow, false);
}
async function canvas(page, color = "rgb(244, 233, 225)") {
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
    "No horizontal page overflow",
  );
}
try {
  const desktop = await setup(1440);
  const { page, state } = desktop;
  await check("personal center has the warm canvas and AI entry", async () => {
    await page.goto(`${origin}/snow/me`);
    await page.getByRole("heading", { name: "雪友的个人中心" }).waitFor();
    await canvas(page);
    await page
      .getByRole("navigation", { name: "个人中心", exact: true })
      .getByRole("link", { name: "我的 AI 对话" })
      .click();
    await page
      .getByRole("heading", { name: "我的 AI 对话", exact: true })
      .waitFor();
    await page.screenshot({
      path: resolve(out, "desktop-entry.png"),
      fullPage: true,
    });
  });
  await check("create, send, citations and consecutive questions", async () => {
    await page.getByRole("button", { name: "新建对话", exact: true }).click();
    await page.getByRole("textbox", { name: "你的问题" }).waitFor();
    await page
      .getByRole("textbox", { name: "你的问题" })
      .fill("第一次滑雪如何准备？");
    await page.getByRole("button", { name: "发送问题" }).click();
    await page
      .getByRole("log")
      .getByText("建议：第一次滑雪如何准备？，先检查头盔与护具。", {
        exact: true,
      })
      .waitFor();
    await page
      .getByRole("log")
      .getByText("参考来源（1）", { exact: true })
      .last()
      .click();
    assert.equal(
      await page
        .getByRole("link", { name: "滑雪入门（新窗口）" })
        .last()
        .getAttribute("href"),
      "/snow/knowledge/1",
    );
    await page.getByRole("textbox", { name: "你的问题" }).fill("头盔怎么选？");
    await page.getByRole("button", { name: "发送问题" }).click();
    await page
      .getByRole("log")
      .getByText("建议：头盔怎么选？，先检查头盔与护具。", { exact: true })
      .waitFor();
    assert.equal(state.posts.length, 2);
    await canvas(page);
    await page.screenshot({
      path: resolve(out, "desktop-conversation.png"),
      fullPage: true,
    });
  });
  await check("reload restores the conversation history", async () => {
    await page.reload();
    await page
      .getByRole("log")
      .getByText("建议：头盔怎么选？，先检查头盔与护具。", { exact: true })
      .waitFor();
  });
  await check(
    "truncated SSE can retry without duplicating the request",
    async () => {
      state.truncate = true;
      await page
        .getByRole("textbox", { name: "你的问题" })
        .fill("雪镜需要吗？");
      await page.getByRole("button", { name: "发送问题" }).click();
      await page.getByRole("button", { name: "重试原问题" }).waitFor();
      await page.getByRole("button", { name: "重试原问题" }).click();
      await page
        .getByRole("log")
        .getByText("建议：雪镜需要吗？，先检查头盔与护具。", { exact: true })
        .waitFor();
      assert.deepEqual(state.posts.at(-1), state.posts.at(-2));
    },
  );
  await check("Unicode length blocks oversize questions", async () => {
    await page
      .getByRole("textbox", { name: "你的问题" })
      .fill("雪".repeat(4001));
    assert.ok(
      await page.getByRole("button", { name: "发送问题" }).isDisabled(),
    );
    await page.getByRole("textbox", { name: "你的问题" }).fill("");
  });
  await check("delete confirms and returns to the list", async () => {
    await page.getByRole("button", { name: "删除对话", exact: true }).click();
    await page.getByRole("button", { name: "确认删除", exact: true }).click();
    await page.getByRole("heading", { name: "今天想了解什么？" }).waitFor();
    assert.equal(state.conversations.length, 1);
  });
  await check(
    "logout hides private messages and provides a login return path",
    async () => {
      await page.getByRole("button", { name: "退出登录", exact: true }).click();
      await page
        .getByRole("heading", { name: "你的雪上故事，从这里开始" })
        .waitFor();
      assert.equal(await page.getByRole("log").count(), 0);
      const gateLogin = page.getByRole("link", {
        name: "登录 / 注册",
        exact: true,
      });
      assert.ok((await gateLogin.getAttribute("href")).includes("returnTo"));
    },
  );
  await desktop.context.close();
  for (const [width, height] of [
    [1440, 900],
    [1366, 768],
    [390, 844],
    [768, 600],
    [844, 390],
    [320, 568],
  ]) {
    const fixture = await setup(width, { height, motion: "no-preference" });
    const long = Array.from({ length: 16 }, (_, i) => ({
      ...sample,
      messageId: String(i + 1),
      content:
        `第 ${i + 1} 段：` + "先检查装备，选择符合自身水平的雪道。".repeat(16),
    }));
    fixture.state.conversations[0].messages = long;
    fixture.state.conversations.push(
      ...Array.from({ length: 19 }, (_, i) => ({
        ...summary,
        conversationId: crypto.randomUUID(),
        title: `雪上计划 ${i + 1}`,
        messages: [sample],
      })),
    );
    await check(
      `${width}×${height}: viewport, scroll, history and composer`,
      async () => {
        const p = fixture.page;
        await p.goto(`${origin}/snow/me/ai?conversation=${id}`);
        await p.getByRole("textbox", { name: "你的问题" }).waitFor();
        await p.waitForFunction(
          () =>
            Math.abs(
              document.querySelector("#ai-workspace").getBoundingClientRect()
                .top - 16,
            ) < 2,
        );
        await viewport(p);
        if (width > 900)
          assert.ok(
            await p
              .locator('[class*="historyBody"]')
              .evaluate((el) => el.scrollHeight > el.clientHeight),
          );
        const before = await p.evaluate(() => scrollY);
        await p.getByRole("log").evaluate((el) => {
          el.scrollTop = 0;
        });
        assert.ok(Math.abs((await p.evaluate(() => scrollY)) - before) <= 2);
        await p.getByRole("log").evaluate((log) => {
          const source = log.querySelector("summary");
          log.scrollTop +=
            source.getBoundingClientRect().top -
            log.getBoundingClientRect().top -
            12;
        });
        await p
          .getByRole("log")
          .getByText("参考来源（1）", { exact: true })
          .first()
          .click();
        await viewport(p);
        if (width <= 900) {
          const toggle = p.getByRole("button", {
            name: "历史对话",
            exact: true,
          });
          await toggle.click();
          assert.equal(await toggle.getAttribute("aria-expanded"), "true");
          assert.ok(
            !(await p.getByRole("textbox", { name: "你的问题" }).isVisible()),
          );
          await p
            .getByRole("complementary", { name: "历史对话" })
            .getByRole("link")
            .first()
            .click();
          await p.getByRole("textbox", { name: "你的问题" }).waitFor();
          assert.equal(await toggle.getAttribute("aria-expanded"), "false");
        }
        await p.screenshot({
          path: resolve(out, `viewport-${width}x${height}.png`),
        });
        await p.evaluate(() =>
          window.scrollTo({ top: 0, behavior: "instant" }),
        );
        await p
          .getByRole("navigation", { name: "个人中心", exact: true })
          .getByRole("link", { name: "我的 AI 对话" })
          .click();
        await p.waitForFunction(
          () =>
            Math.abs(
              document.querySelector("#ai-workspace").getBoundingClientRect()
                .top - 16,
            ) < 2,
        );
        await viewport(p);
      },
    );
    await fixture.context.close();
  }

  for (const width of [390, 768]) {
    const mobile = await setup(width);
    await check(
      `${width}px layout, history, composer and warm background`,
      async () => {
        await mobile.page.goto(`${origin}/snow/me/ai?conversation=${id}`);
        await mobile.page.getByRole("textbox", { name: "你的问题" }).waitFor();
        await canvas(mobile.page);
        await mobile.page.screenshot({
          path: resolve(out, `conversation-${width}.png`),
          fullPage: true,
        });
      },
    );
    await mobile.context.close();
  }
  const noPermission = await setup(390, { allowed: false });
  await check(
    "missing AI permission shows the access explanation",
    async () => {
      await noPermission.page.goto(`${origin}/snow/me/ai`);
      await noPermission.page
        .getByText("当前账号尚未开通 AI 对话权限，请联系管理员。", {
          exact: true,
        })
        .waitFor();
      assert.equal(
        await noPermission.page
          .getByRole("textbox", { name: "你的问题" })
          .count(),
        0,
      );
    },
  );
  await noPermission.context.close();
  const publicView = await setup(1440, { loggedIn: false });
  await check(
    "article canvas is warm; homepage and directory colors remain",
    async () => {
      await publicView.page.goto(`${origin}/snow/knowledge/1`);
      await canvas(publicView.page);
      await publicView.page.screenshot({
        path: resolve(out, "article.png"),
        fullPage: true,
      });
      for (const [path, color] of [
        ["", "rgb(255, 218, 61)"],
        ["/resorts", "rgb(36, 85, 245)"],
        ["/knowledge", "rgb(0, 173, 71)"],
        ["/dynamics", "rgb(220, 47, 67)"],
      ]) {
        await publicView.page.goto(`${origin}/snow${path}`);
        await canvas(publicView.page, color);
      }
    },
  );
  await publicView.context.close();
  const opening = await setup(1440, {
    motion: "no-preference",
    loggedIn: false,
  });
  await check(
    "opening: legible 活 and 乐 on the unchanged 60-column grid",
    async () => {
      await opening.page.goto(`${origin}/snow`);
      await opening.page
        .locator('[data-home-opening][data-enhanced="true"]')
        .waitFor();
      await opening.page.screenshot({
        path: resolve(out, "opening-forward.png"),
      });
      await opening.page.locator("[data-home-opening]").evaluate((el) => {
        const canvas = el.firstElementChild;
        const top = parseFloat(getComputedStyle(canvas).top) || 0;
        const travel = Math.max(1, el.offsetHeight - canvas.offsetHeight - 200);
        window.scrollTo(
          0,
          scrollY + el.getBoundingClientRect().top - top + 100 + travel * 0.57,
        );
      });
      await opening.page
        .locator('[data-home-opening][data-scene="mountainward"]')
        .waitFor();
      await opening.page.screenshot({
        path: resolve(out, "opening-mountainward.png"),
      });
    },
  );
  await opening.context.close();
  assert.deepEqual(errors, []);
} catch (error) {
  results.push({ name: "suite", status: "failed", error: String(error) });
  for (const context of browser.contexts())
    for (const page of context.pages()) {
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
        ).slice(0, 3000),
      );
    }
  throw error;
} finally {
  await writeFile(
    resolve(out, "report.json"),
    JSON.stringify(
      {
        results,
        errors,
        authAndAi: "local browser fixtures; no production AI writes",
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  await browser.close();
  console.log(JSON.stringify(results));
}
