import { describe, it, expect } from "vitest";
import {
  initialGlobalResortInput,
  globalResortInput,
  readGlobalResortForm,
  prepareGlobalResortSave,
  saveGlobalResort,
} from "@/features/admin-resorts/global-resort-form-api";
import {
  item,
  operator,
  schema,
  requestFixture,
} from "@/features/admin-resorts/global-resort-fixtures.test-helper";
const signal = () => new AbortController().signal;
describe("global resort forms", () => {
  it("maps tags, exact asset IDs and decimal response values into editor inputs", () => {
    const values = initialGlobalResortInput(item, schema);
    expect(values).toMatchObject({
      merchantId: 7,
      rating: 4.5,
      fitTagValues: ["family", "beginner"],
      coverAssetId: "9223372036854775807",
    });
    expect(values.customFields).not.toHaveProperty("writeOnly");
  });
  it("initializes defaults only for writable fields when creating", () => {
    expect(initialGlobalResortInput(undefined, schema).customFields).toEqual({
      writeOnly: "默认值",
    });
  });
  it("writes a whitelist and changed writable fields, retaining unreadable existing values", () => {
    const values = initialGlobalResortInput(item, schema);
    const body = globalResortInput(
      {
        ...values,
        longitude: null,
        latitude: null,
        customFields: {
          ...values.customFields,
          readOnly: "forged",
          both: "new",
        },
      },
      schema,
      item,
    );
    expect(body.customFields).toEqual({ both: "new" });
    expect(body).toMatchObject({
      longitude: null,
      latitude: null,
      merchantId: 7,
      rating: 4.5,
    });
    expect(body).not.toHaveProperty("status");
    expect(body).not.toHaveProperty("merchantName");
  });
  it.each([
    { merchantId: 0 },
    { merchantId: 1.5 },
    { rating: 5.1 },
    { rating: NaN },
    { ratingCount: -1 },
    { ratingCount: 1.5 },
  ])("rejects invalid admin-only data %j", (patch) => {
    expect(() =>
      globalResortInput(
        { ...initialGlobalResortInput(item, schema), ...patch },
        schema,
        item,
      ),
    ).toThrow();
  });
  it("blocks readiness if any field catalog or required dictionary fails", async () => {
    for (const path of [
      "/admin/resorts/custom-fields",
      "/admin/dictionaries/resort.fit_tag",
    ]) {
      const s = requestFixture({ [path]: new Error("down") });
      await expect(
        readGlobalResortForm(s.request, operator, 42, signal()),
      ).rejects.toThrow();
    }
    const selectSchema = {
      ...schema,
      groups: [
        {
          groupKey: "g",
          label: "G",
          fields: [
            {
              fieldKey: "x",
              label: "X",
              dataType: "single_select",
              canRead: true,
              canWrite: true,
              optionsDictType: "resort.level",
            },
          ],
        },
      ],
    };
    const s = requestFixture({
      "/admin/resorts/custom-fields": selectSchema,
      "/admin/dictionaries/resort.level": new Error("down"),
    });
    await expect(
      readGlobalResortForm(s.request, operator, 42, signal()),
    ).rejects.toThrow();
  });
  it("does not read option dictionaries for readonly fields", async () => {
    const s = requestFixture({
      "/admin/resorts/custom-fields": {
        ...schema,
        groups: [
          {
            groupKey: "g",
            label: "G",
            fields: [
              {
                fieldKey: "x",
                label: "X",
                dataType: "single_select",
                canRead: true,
                canWrite: false,
                optionsDictType: "private",
              },
            ],
          },
        ],
      },
    });
    await readGlobalResortForm(s.request, operator, 42, signal());
    expect(s.mock.mock.calls.some((call) => call[0].includes("private"))).toBe(
      false,
    );
  });
  it("refuses saving after a field-policy or target change", async () => {
    const input = {
      item,
      schema,
      values: initialGlobalResortInput(item, schema),
    };
    for (const overrides of [
      { "/admin/resorts/42": { ...item, name: "changed" } },
      { "/admin/resorts/custom-fields": { ...schema, groups: [] } },
    ]) {
      const s = requestFixture(overrides);
      await expect(
        prepareGlobalResortSave(s.request, operator, input, signal()),
      ).rejects.toThrow("变化");
    }
  });
  it("rejects a mismatched write response instead of reporting success", async () => {
    const s = requestFixture({
      "/admin/resorts/42": { ...item, resortId: 43 },
    });
    await expect(
      saveGlobalResort(
        s.request,
        42,
        initialGlobalResortInput(item, schema),
        signal(),
      ),
    ).rejects.toThrow("人工核对");
  });
});
