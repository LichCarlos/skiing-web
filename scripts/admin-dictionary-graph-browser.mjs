import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const mode = process.env.ADMIN_GRAPH_MODE || "local";
const fixtures = process.env.ADMIN_GRAPH_FIXTURES === "1";
assert.ok(!fixtures || mode === "local", "Fixtures are local only");
const origin = "https://lichcarlos.top",
  prefix = "/snow-admin",
  api = `${origin}/snow-api/api/v1`;
const out = resolve(
  `docs/validation/admin-dictionary-graph-${mode}${fixtures ? "-fixtures" : ""}-20261109`,
);
mkdirSync(out, { recursive: true });
const report = {
  passed: false,
  mode,
  fixtures,
  checks: [],
  pageErrors: [],
  blockedWrites: [],
  simulatedWrites: [],
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion:
    process.env.ADMIN_GRAPH_MOTION === "normal" ? "no-preference" : "reduce",
});
if (mode === "local")
  await context.route(`${origin}${prefix}/**`, async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({
      response: await route.fetch({
        url: `http://127.0.0.1:3302${url.pathname}${url.search}`,
      }),
    });
  });
await context.route(`${api}/admin/**`, async (route) => {
  if (!["GET", "OPTIONS"].includes(route.request().method())) {
    report.blockedWrites.push(
      route.request().method() + " " + new URL(route.request().url()).pathname,
    );
    return route.abort();
  }
  return route.fallback();
});
const page = await context.newPage();
let authenticatedUser;
page.on("response", async (response) => {
  if (response.url() === `${api}/auth/me` && response.status() === 200) {
    try {
      const value = await response.json();
      if (value.data?.permissionKeys) authenticatedUser = value.data;
    } catch {}
  }
});
page.setDefaultTimeout(45000);
page.on("pageerror", (error) => report.pageErrors.push(error.message));
const check = (name, data = {}) => report.checks.push({ name, ...data });
const json = (route, data) =>
  route.fulfill({
    json: { code: 200, msg: "ok", data, traceId: "local-graph-fixture" },
  });
async function select(control, label) {
  await control.click();
  if (await control.isEditable()) await control.fill(label);
  await page
    .locator(".ant-select-dropdown:visible .ant-select-item-option")
    .filter({ hasText: label })
    .last()
    .click();
}
async function cancel(dialog) {
  await dialog.getByRole("button", { name: /^取\s*消$/ }).click();
  await dialog.waitFor({ state: "hidden" });
}
const inspector = () =>
  page.getByRole("complementary", { name: "关系节点详情" });
async function chooseNode(label) {
  await select(page.getByRole("combobox", { name: "查找关系节点" }), label);
  await inspector().getByRole("heading").waitFor();
}
async function inspect(name) {
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
      `${name} overflow ${width}`,
    );
    const bounds = await page
      .locator(
        width <= 640 ? '[aria-label="实体字典关系层级树"]' : ".react-flow",
      )
      .boundingBox();
    assert.ok(bounds && bounds.width > 200 && bounds.height > 100);
    if (width === 390) {
      await page
        .getByRole("tree", { name: "实体字典关系层级树" })
        .getByText("适合标签", { exact: true })
        .click();
      await inspector()
        .getByRole("heading", { name: "适合标签", exact: true })
        .waitFor();
      check("mobile-tree-selects-node");
    }
    if ([1440, 390].includes(width))
      await page.screenshot({
        path: `${out}/${name}-${width}.png`,
        fullPage: false,
      });
    check(name, { width, canvas: bounds });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}
try {
  const credentials = Object.fromEntries(
    readFileSync("D:/linji-local/20261105/private/admin-initial.txt", "utf8")
      .trim()
      .split(/\r?\n/)
      .map((line) => {
        const i = line.indexOf(": ");
        return [line.slice(0, i), line.slice(i + 2)];
      }),
  );
  const manifest = JSON.parse(
    readFileSync(
      "D:/linji-local/20261109/admin-dictionary-graph-release/release-manifest.json",
      "utf8",
    ),
  );
  report.buildId = manifest.buildId;
  const response = await page.goto(origin + prefix + "/login");
  assert.ok((await response.text()).includes(report.buildId));
  await page.getByLabel("账号", { exact: true }).fill(credentials.Account);
  await page.getByLabel("密码", { exact: true }).fill(credentials.Password);
  await page.getByRole("button", { name: /^登\s*录$/ }).click();
  await page
    .getByRole("navigation", { name: "管理端导航", exact: true })
    .waitFor();
  let failSecondPage = false;
  const requests = [];
  if (fixtures) {
    const now = "2026-11-03T00:00:00Z";
    const item = (itemId, label, parentId = null, children = []) => ({
      itemId,
      label,
      parentId,
      value: `value${itemId}`,
      color: null,
      sortOrder: itemId,
      isDefault: false,
      status: "active",
      children,
    });
    const dictionaries = Array.from({ length: 23 }, (_, i) => ({
      dictType:
        i === 0
          ? "knowledge.article_category"
          : i === 1
            ? "resort.fit_tag"
            : i === 22
              ? "shared.options"
              : `test.options${i}`,
      dictName:
        i === 0
          ? "文章分类"
          : i === 1
            ? "雪场适合标签"
            : i === 22
              ? "共享设施字典"
              : `未绑定选项${i}`,
      groupKey: i === 0 ? "knowledge" : "resort",
      status: i === 2 ? "disabled" : "active",
      publiclyReadable: false,
      items:
        i === 22
          ? [
              item(101, "设施", null, [
                item(102, "停车场", 101, [item(103, "地下停车场", 102)]),
              ]),
              item(104, "服务"),
            ]
          : [],
    }));
    const fields = Array.from({ length: 21 }, (_, i) => ({
      fieldDefinitionId: i + 1,
      entityType: "ski_resort",
      fieldKey: `field${i}`,
      label: i === 20 ? "跨页设施字段" : `资料字段${i}`,
      dataType: i === 20 ? "multi_select" : "text",
      groupKey: "basic",
      sortOrder: i,
      required: false,
      defaultValue: null,
      optionsDictType: i === 20 ? "shared.options" : null,
      validation: null,
      searchable: false,
      filterable: false,
      sortable: false,
      isPublic: false,
      status: i === 1 ? "disabled" : i === 2 ? "draft" : "active",
      schemaVersion: 1,
      createTime: now,
      updateTime: now,
    }));
    fields.push({
      ...fields[20],
      fieldDefinitionId: 30,
      entityType: "article",
      fieldKey: "facilities",
      label: "文章共享设施",
    });
    const groups = ["ski_resort", "article", "dynamic", "merchant_profile"].map(
      (entityType) => ({
        entityType,
        groupKey: "basic",
        label: "基础信息",
        sortOrder: 0,
        visibilityRule: null,
        status: "active",
        createTime: now,
        updateTime: now,
      }),
    );
    await context.route(`${api}/admin/**`, async (route) => {
      const url = new URL(route.request().url()),
        path = url.pathname.split("/api/v1")[1],
        method = route.request().method();
      requests.push({ path: path + url.search, method });
      if (method === "PATCH" && path === "/admin/custom-fields/21") {
        const body = route.request().postDataJSON();
        assert.equal(body.expectedSchemaVersion, fields[20].schemaVersion);
        fields[20] = {
          ...fields[20],
          ...body,
          schemaVersion: fields[20].schemaVersion + 1,
        };
        delete fields[20].expectedSchemaVersion;
        report.simulatedWrites.push({
          method,
          path,
          dictionary: fields[20].optionsDictType,
        });
        return json(route, fields[20]);
      }
      if (
        method === "POST" &&
        path === "/admin/dictionaries/shared.options/items"
      ) {
        const body = route.request().postDataJSON();
        assert.equal(body.parentId, 101);
        const created = { ...item(105, body.label, body.parentId), ...body };
        dictionaries[22].items[0].children.push(created);
        report.simulatedWrites.push({ method, path, parentId: body.parentId });
        return json(route, created);
      }
      if (method !== "GET") return route.fallback();
      let data;
      if (path === "/admin/dictionaries") {
        const rows = dictionaries.filter(
            (row) =>
              !url.searchParams.get("status") ||
              row.status === url.searchParams.get("status"),
          ),
          n = Number(url.searchParams.get("page"));
        data = {
          page: n,
          pageSize: 20,
          total: rows.length,
          hasNext: n * 20 < rows.length,
          items: rows.slice((n - 1) * 20, n * 20),
        };
      } else if (path.startsWith("/admin/dictionaries/"))
        data = dictionaries.find(
          (row) => row.dictType === decodeURIComponent(path.split("/")[3]),
        );
      else if (path === "/admin/custom-fields") {
        const rows = fields.filter(
            (row) =>
              row.entityType === url.searchParams.get("entityType") &&
              (!url.searchParams.get("status") ||
                row.status === url.searchParams.get("status")),
          ),
          n = Number(url.searchParams.get("page"));
        if (failSecondPage && n === 2)
          return route.fulfill({
            status: 503,
            json: { code: 503, msg: "local fixture unavailable" },
          });
        data = {
          page: n,
          pageSize: 20,
          total: rows.length,
          items: rows.slice((n - 1) * 20, n * 20),
        };
      } else if (path.startsWith("/admin/custom-fields/"))
        data = fields.find(
          (row) => row.fieldDefinitionId === Number(path.split("/")[3]),
        );
      else if (path === "/admin/custom-field-groups")
        data = groups.filter(
          (row) => row.entityType === url.searchParams.get("entityType"),
        );
      else if (path.startsWith("/admin/custom-field-groups/"))
        data = groups.find(
          (row) =>
            row.entityType === path.split("/")[3] &&
            row.groupKey === path.split("/")[4],
        );
      else return route.fallback();
      return json(route, data);
    });
  }
  await page.goto(origin + prefix + "/admin/system/dictionaries");
  await page.getByRole("button", { name: "实体关系图", exact: true }).click();
  await page.locator(".react-flow__node").first().waitFor();
  assert.equal(await page.locator('[data-id="entity:ski_resort"]').count(), 1);
  await inspect("relationship-canvas");
  await page.getByRole("button", { name: "放大关系图" }).click();
  await page.getByRole("button", { name: "显示全部节点" }).click();
  check("zoom-and-fit-controls");
  if (fixtures) {
    assert.equal(await page.locator('[data-id="field:1"]').count(), 0);
    await page.getByRole("switch", { name: "显示全部字段" }).check();
    await page.locator('[data-id="field:1"]').waitFor();
    await page.getByRole("switch", { name: "显示全部字段" }).uncheck();
    await page.locator('[data-id="field:1"]').waitFor({ state: "detached" });
    check("all-fields-switch");
    assert.ok(
      requests.some(
        (row) =>
          row.path.startsWith("/admin/custom-fields?") &&
          row.path.includes("page=2"),
      ),
    );
    assert.equal(await page.locator('[data-id="field:21"]').count(), 1);
    assert.equal(await page.locator('[data-id="field:30"]').count(), 0);
    await select(
      page.getByRole("combobox", { name: "关系图业务范围" }),
      "全部实体与字典",
    );
    assert.equal(
      await page.locator('[data-id="dictionary:shared.options"]').count(),
      1,
    );
    assert.equal(await page.locator('[data-id="entity:article"]').count(), 1);
    assert.equal(
      await page.locator('[data-id="dictionary:test.options3"]').count(),
      1,
    );
    check("full-catalog-shared-dictionary-and-orphan");
    await chooseNode("滑雪场 · 字段分组 · 基础信息");
    await inspector()
      .getByRole("button", { name: "编辑字段分组", exact: true })
      .click();
    const groupDialog = page.getByRole("dialog", {
      name: "编辑分组",
      exact: true,
    });
    await groupDialog.waitFor();
    assert.equal(
      await groupDialog.getByLabel("分组名称", { exact: true }).inputValue(),
      "基础信息",
    );
    await cancel(groupDialog);
    await page
      .getByRole("dialog", { name: "实体字段配置", exact: true })
      .locator(".ant-drawer-close")
      .click();
    await page.locator(".react-flow__node").first().waitFor();
    check("composite-group-node-opens-correct-entity-editor");
    await chooseNode("跨页设施字段");
    await page.locator('[data-id="field:21"]').click();
    await inspector()
      .getByRole("button", { name: "编辑字段 / 绑定字典" })
      .click();
    let dialog = page.getByRole("dialog", { name: "编辑字段", exact: true });
    await dialog.waitFor();
    assert.equal(
      await dialog.getByLabel("显示名称", { exact: true }).inputValue(),
      "跨页设施字段",
    );
    await select(dialog.getByLabel("选项字典", { exact: true }), "文章分类");
    await dialog.getByRole("button", { name: /^确\s*定$/ }).click();
    await dialog.waitFor({ state: "hidden" });
    await page
      .getByRole("dialog", { name: "实体字段配置", exact: true })
      .locator(".ant-drawer-close")
      .click();
    await page.locator(".react-flow__node").first().waitFor();
    await chooseNode("跨页设施字段");
    assert.ok(
      await page
        .locator(".react-flow__edge")
        .evaluateAll((nodes) =>
          nodes.some(
            (node) =>
              node.getAttribute("data-id")?.includes("field:21") &&
              node
                .getAttribute("data-id")
                ?.includes("knowledge.article_category"),
          ),
        ),
    );
    check("node-edit-versioned-binding-and-edge-refresh");
    await chooseNode("共享设施字典");
    await inspector().getByRole("button", { name: "管理字典与层级" }).click();
    const tree = page.getByRole("tree", { name: "字典项层级树" });
    await tree.waitFor();
    await tree.getByRole("button", { name: "在设施下新增子项" }).click();
    dialog = page.getByRole("dialog", { name: "新增字典项", exact: true });
    await dialog.waitFor();
    await dialog.getByLabel("名称", { exact: true }).fill("测试新增子项");
    await dialog.getByLabel("值", { exact: true }).fill("preview-child");
    await dialog.getByRole("button", { name: /^确\s*定$/ }).click();
    await dialog.waitFor({ state: "hidden" });
    await tree.getByText("测试新增子项", { exact: true }).waitFor();
    await tree.getByRole("button", { name: "编辑字典项停车场" }).click();
    dialog = page.getByRole("dialog", { name: "编辑字典项", exact: true });
    await dialog.getByLabel("父级", { exact: true }).click();
    const popup = page.locator(".ant-select-dropdown:visible");
    await popup.getByText("设施 (value101)", { exact: true }).waitFor();
    assert.equal(
      await popup.getByText("停车场 (value102)", { exact: true }).count(),
      0,
    );
    assert.equal(
      await popup.getByText("地下停车场 (value103)", { exact: true }).count(),
      0,
    );
    await dialog.getByLabel("父级", { exact: true }).press("Escape");
    await cancel(dialog);
    check("tree-add-child-and-parent-cycle-exclusion");
    await page.getByRole("textbox", { name: "搜索字典项" }).fill("地下停车场");
    await tree.getByText("地下停车场", { exact: true }).waitFor();
    assert.equal(await tree.getByText("服务", { exact: true }).count(), 0);
    await page.getByRole("button", { name: "全部收起", exact: true }).click();
    assert.equal(
      await tree.getByText("地下停车场", { exact: true }).isVisible(),
      false,
    );
    await page.getByRole("button", { name: "全部展开", exact: true }).click();
    await tree.getByText("地下停车场", { exact: true }).waitFor();
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        false,
      );
      await tree.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${out}/dictionary-tree-${width}.png` });
      check("tree-responsive", { width });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    failSecondPage = true;
    await page.getByRole("button", { name: "刷新关系图", exact: true }).click();
    await page
      .getByText("关系图读取失败，请刷新重试；不会显示不完整的关联。", {
        exact: true,
      })
      .waitFor();
    assert.equal(await page.locator(".react-flow__node").count(), 0);
    failSecondPage = false;
    await page.getByRole("button", { name: "刷新关系图", exact: true }).click();
    await page.locator(".react-flow__node").first().waitFor();
    check("partial-load-hidden-and-retry");
    await context.route(`${api}/auth/me`, async (route) => {
      assert.ok(authenticatedUser);
      await json(route, {
        ...authenticatedUser,
        permissionKeys: authenticatedUser.permissionKeys.filter(
          (key) =>
            key !== "system:field:list" && key !== "system:field-group:list",
        ),
      });
    });
    await page.reload();
    const before = requests.length;
    await page.getByRole("button", { name: "实体关系图", exact: true }).click();
    await page.getByText("当前账号仅显示已授权关系", { exact: true }).waitFor();
    assert.equal(await page.locator('[data-id^="field:"]').count(), 0);
    assert.equal(
      requests
        .slice(before)
        .some((row) => row.path.startsWith("/admin/custom-field")),
      false,
    );
    check("restricted-read-permissions");
  } else {
    await select(
      page.getByRole("combobox", { name: "关系图业务范围" }),
      "文章",
    );
    await chooseNode("固定字段 · 文章分类");
    await inspector().getByRole("button", { name: "管理分类选项" }).click();
    await page.getByRole("tree", { name: "字典项层级树" }).waitFor();
    await page.getByRole("button", { name: "切换表格", exact: true }).click();
    await page.getByRole("button", { name: "切换层级树", exact: true }).click();
    await page.getByRole("tree", { name: "字典项层级树" }).waitFor();
    check("live-fixed-binding-tree-table-switch");
  }
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.blockedWrites, []);
  if (fixtures) await context.unroute(`${api}/auth/me`);
  await page.getByRole("button", { name: "退出", exact: true }).click();
  await page.waitForURL(origin + prefix + "/login");
  report.passed = true;
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png` });
  writeFileSync(`${out}/failure.txt`, await page.locator("body").innerText());
  throw error;
} finally {
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2) + "\n");
  await browser.close();
}
console.log(JSON.stringify(report));
