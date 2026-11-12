import { expect, it, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import {
  readGlobalResort,
  readGlobalResortPage,
  runGlobalCommand,
  type GlobalResortRequest,
} from "@/features/admin-resorts/global-resort-api";
import {
  readGlobalResortForm,
  saveGlobalResort,
  prepareGlobalResortSave,
  initialGlobalResortInput,
} from "@/features/admin-resorts/global-resort-form-api";
import {
  item,
  operator,
  page,
  schema,
  requestFixture,
} from "@/features/admin-resorts/global-resort-fixtures.test-helper";
const signal = () => new AbortController().signal;
it.each([
  { page: 1, status: ["draft"] },
  { page: 1, merchantId: "7" },
])("rejects coercible filter values before HTTP %j", async (filters) => {
  const s = requestFixture();
  await expect(
    readGlobalResortPage(s.request, operator, filters as never, signal()),
  ).rejects.toThrow();
  expect(s.mock).not.toHaveBeenCalled();
});
it.each(["form", "prepare"])(
  "rechecks operation identity after %s field reads",
  async (kind) => {
    const base = requestFixture();
    let changed = false;
    const request = vi.fn(
      async (path: string, options?: Parameters<GlobalResortRequest>[1]) => {
        if (path === "/auth/me" && changed)
          return {
            ...operator,
            permissionKeys: operator.permissionKeys.filter(
              (key) => key !== "content:resort:update-all",
            ),
          };
        const result = await base.request(path, options);
        if (path === "/admin/resorts/custom-fields") changed = true;
        return result;
      },
    ) as GlobalResortRequest;
    await expect(
      kind === "form"
        ? readGlobalResortForm(request, operator, 42, signal())
        : prepareGlobalResortSave(
            request,
            operator,
            { item, schema, values: initialGlobalResortInput(item, schema) },
            signal(),
          ),
    ).rejects.toThrow("权限");
  },
);
it.each([
  { merchantId: "7" },
  { merchantName: 7 },
  { price: -1 },
  { latitude: "91" },
  { rating: "5.1" },
  { gallery: [{ assetId: "8" }] },
  { fitTags: [{ value: "x", label: 7 }] },
  { fitTags: [item.fitTags[0], item.fitTags[0]] },
  { customFields: [{ fieldKey: "x", label: "X", value: {} }] },
  { customFields: [{ fieldKey: "x", label: "X", value: [1] }] },
  { customFields: [{ fieldKey: "x", label: "X", value: NaN }] },
  { customFields: [item.customFields[0], item.customFields[0]] },
  { status: ["draft"] },
  { updatedAt: "yesterday" },
])("rejects malformed admin resort data %j", async (patch) => {
  const s = requestFixture({ "/admin/resorts/42": { ...item, ...patch } });
  await expect(
    readGlobalResort(s.request, operator, 42, signal()),
  ).rejects.toThrow();
});
it.each([
  { total: 2 },
  { hasNext: true },
  { items: [{ ...item, description: null }] },
])("rejects incomplete admin pagination %j", async (patch) => {
  const s = requestFixture({
    "/admin/resorts?page=1&pageSize=20": { ...page, ...patch },
  });
  await expect(
    readGlobalResortPage(s.request, operator, { page: 1 }, signal()),
  ).rejects.toThrow();
});
it("rejects a row outside the requested merchant and status filters", async () => {
  const s = requestFixture();
  await expect(
    readGlobalResortPage(
      s.request,
      operator,
      { page: 1, merchantId: 8 },
      signal(),
    ),
  ).rejects.toThrow();
  await expect(
    readGlobalResortPage(
      s.request,
      operator,
      { page: 1, status: "published" },
      signal(),
    ),
  ).rejects.toThrow();
});
it.each(["detail", "page", "missing"])(
  "rechecks identity after %s response",
  async (kind) => {
    let identities = 0;
    const request = vi.fn(async (path: string) => {
      if (path === "/auth/me")
        return ++identities === 1
          ? operator
          : { ...operator, account: "changed" };
      if (kind === "missing")
        throw new ApiError("missing", {
          status: 404,
          code: 404,
          traceId: null,
        });
      return kind === "page" ? page : item;
    }) as GlobalResortRequest;
    await expect(
      kind === "page"
        ? readGlobalResortPage(request, operator, { page: 1 }, signal())
        : readGlobalResort(request, operator, 42, signal()),
    ).rejects.toThrow("权限");
  },
);
it("rejects invalid local identity before HTTP", async () => {
  const s = requestFixture();
  await expect(
    readGlobalResort(
      s.request,
      { ...operator, nickname: null } as never,
      42,
      signal(),
    ),
  ).rejects.toThrow();
  expect(s.mock).not.toHaveBeenCalled();
});
it("projects admin VO and copies custom arrays", async () => {
  const values = ["a"],
    source = {
      ...item,
      secret: "private",
      fitTags: [{ value: "x", label: "X", secret: true }],
      customFields: [
        { fieldKey: "x", label: "X", value: values, secret: true },
      ],
    };
  const s = requestFixture({ "/admin/resorts/42": source });
  const result = await readGlobalResort(s.request, operator, 42, signal());
  expect(result).not.toHaveProperty("secret");
  expect(result.fitTags[0]).not.toHaveProperty("secret");
  expect(result.customFields[0]).not.toHaveProperty("secret");
  values.push("b");
  expect(result.customFields[0]?.value).toEqual(["a"]);
});
it("rejects incomplete moderation and save receipts", async () => {
  const s = requestFixture({
    "/admin/resorts/42": { resortId: 42 },
    "/admin/resorts/42/publish": { resortId: 42, status: "published" },
  });
  await expect(
    runGlobalCommand(s.request, 42, "publish", signal()),
  ).rejects.toThrow("操作响应");
  await expect(
    saveGlobalResort(
      s.request,
      42,
      initialGlobalResortInput(item, schema),
      signal(),
    ),
  ).rejects.toThrow("保存响应");
});
it("rejects invalid save target before dispatch", async () => {
  const s = requestFixture();
  await expect(
    saveGlobalResort(
      s.request,
      -1,
      initialGlobalResortInput(item, schema),
      signal(),
    ),
  ).rejects.toThrow();
  expect(s.mock).not.toHaveBeenCalled();
});
it("rejects an incomplete dictionary rather than making a form ready", async () => {
  const s = requestFixture({
    "/admin/dictionaries/resort.fit_tag": { items: [] },
  });
  await expect(
    readGlobalResortForm(s.request, operator, 42, signal()),
  ).rejects.toThrow();
});
it("compares parsed field schemas independent of JSON property order", async () => {
  const reordered = Object.fromEntries(Object.entries(schema).reverse());
  const s = requestFixture({ "/admin/resorts/custom-fields": reordered });
  await expect(
    prepareGlobalResortSave(
      s.request,
      operator,
      { item, schema, values: initialGlobalResortInput(item, schema) },
      signal(),
    ),
  ).resolves.toHaveProperty("merchantId", 7);
});
