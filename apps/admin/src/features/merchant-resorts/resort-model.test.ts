import { describe, it, expect } from "vitest";
import {
  canUseResorts,
  verifyResortOperator,
  resortId,
  resortOperatorKey,
  resortListPath,
  initialResortInput,
  resortInput,
  resortFingerprint,
  assertResortCommand,
  assertResortReviewSaved,
  normalizeResortFieldValue,
} from "@/features/merchant-resorts/resort-model";
import {
  operator,
  item,
  schema,
} from "@/features/merchant-resorts/resort-fixtures.test-helper";
describe("merchant resort form contract", () => {
  it("normalizes cleared date/select values without losing false, zero or text", () => {
    expect(normalizeResortFieldValue("date", "")).toBeNull();
    expect(normalizeResortFieldValue("single_select", undefined)).toBeNull();
    expect(normalizeResortFieldValue("boolean", false)).toBe(false);
    expect(normalizeResortFieldValue("integer", 0)).toBe(0);
    expect(normalizeResortFieldValue("text", "")).toBe("");
  });
  it("uses configured grants and a merchant association, independent of the role name", () => {
    expect(canUseResorts(operator, "update")).toBe(true);
    expect(canUseResorts({ ...operator, merchant: null })).toBe(false);
    expect(
      canUseResorts(
        {
          ...operator,
          permissionKeys: operator.permissionKeys.filter(
            (key) => key !== "resort:merchant:update",
          ),
        },
        "update",
      ),
    ).toBe(false);
  });
  it.each(["management:portal:enter", "resort:merchant:list"])(
    "requires %s",
    (key) =>
      expect(
        canUseResorts({
          ...operator,
          permissionKeys: operator.permissionKeys.filter(
            (value) => value !== key,
          ),
        }),
      ).toBe(false),
  );
  it.each(["0", "01", "-1", "1.5", "1e2", "2147483648", "42/extra"])(
    "rejects invalid int4 route %s",
    (id) => expect(resortId(id)).toBeNull(),
  );
  it("accepts the full positive int4 range", () => {
    expect(resortId("1")).toBe(1);
    expect(resortId("2147483647")).toBe(2147483647);
  });
  it("keys identity by grants and merchant, ignoring grant order", () => {
    expect(
      resortOperatorKey({
        ...operator,
        permissionKeys: [...operator.permissionKeys].reverse(),
      }),
    ).toBe(resortOperatorKey(operator));
    expect(() =>
      verifyResortOperator(
        { ...operator, merchant: { merchantId: 8 } },
        operator,
      ),
    ).toThrow();
    expect(() =>
      verifyResortOperator({ ...operator, userId: 2 }, operator),
    ).toThrow();
  });
  it.each([
    [0, undefined],
    [1, "unknown"],
    [107374184, undefined],
  ] as const)("rejects invalid page/filter %s %s", (page, status) =>
    expect(() => resortListPath(page, status)).toThrow(),
  );
  it("does not send user or merchant scope in list query", () =>
    expect(resortListPath(2, "offline")).toBe(
      "/merchant/resorts?page=2&pageSize=20&status=offline",
    ));
  it("rehydrates fitTags, nullable coordinates and media in the API shape", () => {
    const values = initialResortInput(item, schema);
    expect(values.fitTagValues).toEqual(["family", "beginner"]);
    expect(values.longitude).toBe(126.1);
    expect(values.galleryAssetIds).toEqual(["8"]);
    expect(
      initialResortInput({ ...item, longitude: null }, schema).longitude,
    ).toBeNull();
  });
  it("preserves an untouched write-only field on edit but supplies defaults when creating", () => {
    expect(initialResortInput(item, schema).customFields).not.toHaveProperty(
      "writeOnly",
    );
    expect(initialResortInput(undefined, schema).customFields).toEqual({
      writeOnly: "默认值",
    });
  });
  it("omits read-only and unchanged fields and strips lifecycle/ownership/ratings from writes", () => {
    const values = {
      ...initialResortInput(item, schema),
      merchantId: 99,
      status: "published",
      rating: 5,
      customFields: { readOnly: "试图修改", both: "旧值", unknown: "未知" },
    };
    const body = resortInput(values, schema, item.customFields);
    expect(body.customFields).toEqual({});
    expect(body).not.toHaveProperty("merchantId");
    expect(body).not.toHaveProperty("status");
    expect(body).not.toHaveProperty("rating");
    expect(body.fitTagValues).toEqual(item.fitTags);
  });
  it("supports explicit field/media/coordinate clears and preserves gallery order", () => {
    const body = resortInput(
      {
        ...initialResortInput(item, schema),
        longitude: null,
        coverAssetId: null,
        galleryAssetIds: ["9", "8"],
        customFields: { both: null, writeOnly: "新值" },
      },
      schema,
      item.customFields,
    );
    expect(body).toMatchObject({
      longitude: null,
      coverAssetId: null,
      galleryAssetIds: ["9", "8"],
      customFields: { both: null, writeOnly: "新值" },
    });
  });
  it.each([
    { price: -1 },
    { price: 1.1 },
    { name: " " },
    { longitude: 181 },
    { officialUrl: "javascript:alert(1)" },
    { galleryAssetIds: ["8", "8"] },
    { galleryAssetIds: Array.from({ length: 31 }, (_, i) => String(i + 1)) },
    { coverAssetId: "9223372036854775808" },
  ])("rejects invalid form %j", (change) =>
    expect(() =>
      resortInput({ ...initialResortInput(item, schema), ...change }, schema),
    ).toThrow(),
  );
  it("ignores signed URL rotation but detects status/data/reference changes", () => {
    expect(
      resortFingerprint({
        ...item,
        coverUrl: "rotated",
        gallery: item.gallery.map((image) => ({ ...image, url: "rotated" })),
      }),
    ).toBe(resortFingerprint(item));
    expect(resortFingerprint({ ...item, fitTags: [] })).not.toBe(
      resortFingerprint(item),
    );
  });
  it("allows review only after the currently displayed edits are saved", () => {
    const values = initialResortInput(item, schema);
    expect(() => assertResortReviewSaved(item, schema, values)).not.toThrow();
    for (const change of [
      { name: "新名称" },
      { fitTagValues: [] },
      { galleryAssetIds: [] },
      { customFields: { both: "变更" } },
    ])
      expect(() =>
        assertResortReviewSaved(item, schema, { ...values, ...change }),
      ).toThrow("未保存");
  });
  it.each(["pending_review", "published"] as const)(
    "rejects review from %s",
    (status) =>
      expect(() =>
        assertResortCommand({ ...item, status }, "submit-review"),
      ).toThrow(),
  );
});
