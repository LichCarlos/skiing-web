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
  `docs/validation/admin-node-drag-${mode}${fixtures ? "-fixtures" : ""}-20261109`,
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
const check = (name, data = {}) => {
  report.checks.push({ name, ...data });
  console.log("PASS " + name);
};
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
  for (const width of [1440, 1280]) {
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
      "D:/linji-local/20261109/admin-node-drag-release/release-manifest.json",
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
    groups.push({
      ...groups[0],
      groupKey: "retired",
      label: "停用分组",
      sortOrder: 1,
      status: "disabled",
    });
    await context.route(`${api}/admin/**`, async (route) => {
      const url = new URL(route.request().url()),
        path = url.pathname.split("/api/v1")[1],
        method = route.request().method();
      requests.push({ path: path + url.search, method });
      if (method === "POST" && path === "/admin/custom-fields") {
        const dto = route.request().postDataJSON();
        assert.equal(dto.entityType, "ski_resort");
        assert.equal(dto.groupKey, "basic");
        const created = {
          ...fields[0],
          ...dto,
          fieldDefinitionId: 60,
          schemaVersion: 1,
          status: "draft",
        };
        fields.push(created);
        report.simulatedWrites.push({ method, path, groupKey: dto.groupKey });
        return json(route, created);
      }
      if (method === "POST" && path === "/admin/custom-field-groups") {
        const dto = route.request().postDataJSON();
        assert.equal(dto.entityType, "ski_resort");
        const created = { ...groups[0], ...dto };
        groups.push(created);
        report.simulatedWrites.push({ method, path, groupKey: dto.groupKey });
        return json(route, created);
      }
      if (
        method === "POST" &&
        path === "/admin/dictionaries/shared.options/items"
      ) {
        const dto = route.request().postDataJSON();
        assert.equal(dto.parentId, 101);
        const created = { ...item(105, dto.label, dto.parentId), ...dto };
        dictionaries[22].items[0].children.push(created);
        report.simulatedWrites.push({ method, path, parentId: dto.parentId });
        return json(route, created);
      }
      if (
        method === "PATCH" &&
        path === "/admin/dictionaries/shared.options/items/102"
      ) {
        const dto = route.request().postDataJSON();
        assert.equal(dto.parentId, 104);
        const moved = dictionaries[22].items[0].children.shift();
        Object.assign(moved, dto);
        dictionaries[22].items[1].children.push(moved);
        report.simulatedWrites.push({ method, path, parentId: dto.parentId });
        return json(route, moved);
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
  const kind = (scope, value) => scope.locator(`[data-create-kind="${value}"]`);
  const modal = (name) => page.getByRole("dialog", { name, exact: true });
  const confirm = async (dialog) => {
    await dialog.getByRole("button", { name: /^确\s*定$/ }).click();
    await dialog.waitFor({ state: "hidden" });
  };
  async function drag(source, target) {
    await source.scrollIntoViewIfNeeded();
    await target.scrollIntoViewIfNeeded();
    await source.dragTo(target);
  }
  await page.goto(origin + prefix + "/admin/system/dictionaries");
  await page.getByRole("button", { name: "实体关系图", exact: true }).click();
  await page.locator(".react-flow__node").first().waitFor();
  const graph = page.getByRole("region", { name: "实体字典关系图" });
  // Palette sources are actual DOM draggable buttons; exercise browser drag events.
  await drag(
    kind(page, "dictionary").first(),
    page.locator('[data-id="entity:ski_resort"]'),
  );
  let dialog = modal("新建选项字典");
  await dialog.waitFor();
  assert.ok(await dialog.getByLabel("类型键", { exact: true }).inputValue());
  assert.ok((await dialog.innerText()).includes("雪场"));
  await cancel(dialog);
  check("dictionary-palette-native-drag-opens-context-form");

  await drag(
    kind(page, "item").first(),
    page.locator('[data-id="dictionary:resort.fit_tag"]'),
  );
  dialog = modal("新增字典项");
  await dialog.waitFor();
  assert.equal(
    await dialog.getByLabel("名称", { exact: true }).inputValue(),
    "",
  );
  await cancel(dialog);
  check("dictionary-item-drag-reads-target-and-opens-form");

  await drag(
    kind(page, "field").first(),
    page.locator('[data-id="entity:ski_resort"]'),
  );
  dialog = modal("新建字段");
  await dialog.waitFor();
  await cancel(dialog);
  await modal("实体字段配置").locator(".ant-drawer-close").click();
  check("dictionary-graph-create-field-drawer");

  if (fixtures) {
    await select(
      page.getByRole("combobox", { name: "关系图业务范围" }),
      "全部实体与字典",
    );
    await chooseNode("共享设施字典");
    await inspector().getByRole("button", { name: "管理字典与层级" }).click();
    const tree = page.getByRole("tree", { name: "字典项层级树" });
    await tree.waitFor();
    // Scroll the palette into view before drag; the chosen parent is in the same panel.
    await drag(kind(page, "item").last(), tree.locator('[data-id="101"]'));
    dialog = modal("新增字典项");
    await dialog.waitFor();
    assert.ok((await dialog.innerText()).includes("设施"));
    await dialog.getByLabel("名称", { exact: true }).fill("拖拽创建子项");
    await dialog.getByLabel("值", { exact: true }).fill("drag_child");
    await confirm(dialog);
    await tree.getByText("拖拽创建子项", { exact: true }).waitFor();
    check("tree-palette-drop-to-parent-and-save");

    // Existing nodes open the same edit form; no write occurs until confirmation.
    const writes = report.simulatedWrites.length;
    const moveSource = tree.locator('[data-id="102"] strong');
    const moveTarget = tree
      .locator(".ant-tree-node-content-wrapper")
      .filter({ has: page.locator('[data-id="104"]') });
    await moveSource.dragTo(moveTarget, { targetPosition: { x: 200, y: 30 } });
    dialog = modal("编辑字典项");
    await dialog.waitFor();
    assert.ok((await dialog.innerText()).includes("服务"));
    assert.equal(report.simulatedWrites.length, writes);
    await cancel(dialog);
    assert.equal(report.simulatedWrites.length, writes);
    await moveSource.dragTo(moveTarget, { targetPosition: { x: 200, y: 30 } });
    await dialog.waitFor();
    await confirm(dialog);
    await tree.getByText("停车场", { exact: true }).waitFor();
    check("tree-existing-drag-prefills-parent-cancel-and-confirm");
  }

  await page.goto(origin + prefix + "/admin/system/fields/ski_resort");
  await page.getByRole("button", { name: "拖拽管理字段", exact: true }).click();
  const canvas = page.getByRole("region", { name: "字段拖拽管理" });
  await canvas.locator('[data-id="entity:ski_resort"]').waitFor();
  await page.screenshot({ path: `${out}/field-canvas-desktop.png` });
  if (fixtures) {
    await drag(
      kind(canvas, "field"),
      canvas.locator('[data-id="group:retired"]'),
    );
    await page
      .getByText("停用的分组不能新增字段，请选择启用分组", { exact: true })
      .waitFor();
    assert.equal(await modal("新建字段").count(), 0);
    check("field-disabled-group-rejects-drop");
  }
  await drag(
    kind(canvas, "group"),
    canvas.locator('[data-id="entity:ski_resort"]'),
  );
  dialog = modal("新建分组");
  await dialog.waitFor();
  if (fixtures) {
    await dialog.getByLabel("分组键", { exact: true }).fill("drag_group");
    await dialog.getByLabel("分组名称", { exact: true }).fill("拖拽创建分组");
    await confirm(dialog);
    await canvas.locator('[data-id="group:drag_group"]').waitFor();
    check("field-page-drag-group-save-and-node-refresh");
  } else await cancel(dialog);

  const groupNode = fixtures
    ? canvas.locator('[data-id="group:basic"]')
    : canvas.locator('[data-id^="group:"]').first();
  if (await groupNode.count()) {
    await drag(kind(canvas, "field"), groupNode);
    dialog = modal("新建字段");
    await dialog.waitFor();
    if (fixtures) {
      assert.ok((await dialog.innerText()).includes("基础信息"));
      await dialog.getByLabel("字段键", { exact: true }).fill("drag_field");
      await dialog.getByLabel("显示名称", { exact: true }).fill("拖拽创建字段");
      await confirm(dialog);
      await canvas.locator('[data-id="field:60"]').waitFor();
      check("field-page-drag-to-group-save-and-node-refresh");
    } else await cancel(dialog);
  }
  for (const width of [1440, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
      `field overflow ${width}`,
    );
    if (width <= 640) {
      await page.getByRole("tree", { name: "字段配置层级树" }).waitFor();
      await kind(canvas, "field").click();
      dialog = modal("新建字段");
      await dialog.waitFor();
      await cancel(dialog);
    }
    if ([1440, 390].includes(width)) {
      await canvas.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${out}/field-responsive-${width}.png` });
    }
    check("field-responsive-and-mobile-click-alternative", { width });
  }
  if (fixtures) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    failSecondPage = true;
    await page.getByRole("button", { name: "刷新字段图", exact: true }).click();
    await page
      .getByText("字段图读取失败，请刷新字段图重试", { exact: true })
      .waitFor();
    assert.equal(await canvas.locator(".react-flow__node").count(), 0);
    assert.equal(await kind(canvas, "field").isDisabled(), true);
    failSecondPage = false;
    await page.getByRole("button", { name: "刷新字段图", exact: true }).click();
    await canvas.locator('[data-id="field:60"]').waitFor();
    check("field-pagination-error-clears-and-retry-restores");
  }
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.blockedWrites, []);
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
