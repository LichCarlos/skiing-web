import { describe, expect, it } from "vitest";
import {
  initialArticleFields,
  writableArticleChanges,
  articleOptionDictionaries,
  articleFieldRequired,
} from "@/features/articles/article-field-model";

import {
  testArticleField,
  testArticleSchema,
} from "@/features/articles/__tests__/fixtures";
describe("article field form policy", () => {
  const schema = testArticleSchema([
    testArticleField("readOnly", { canWrite: false }),
    testArticleField("writeOnly", {
      canRead: false,
      defaultValue: "default",
      required: true,
    }),
    testArticleField("normal", { defaultValue: "default" }),
  ]);
  it("does not fill defaults or hidden values into existing write-only fields", () => {
    expect(
      initialArticleFields(
        schema,
        { readOnly: "visible", writeOnly: "must not use", normal: "stored" },
        true,
      ),
    ).toEqual({ readOnly: "visible", normal: "stored" });
    expect(initialArticleFields(schema, {}, true)).toEqual({});
  });
  it("applies only supported writable defaults on new records", () => {
    expect(initialArticleFields(schema, {}, false)).toEqual({
      writeOnly: "default",
      normal: "default",
    });
    expect(
      initialArticleFields(
        testArticleSchema([
          testArticleField("bad", { defaultValue: { secret: "invalid" } }),
        ]),
        {},
        false,
      ),
    ).toEqual({});
  });
  it("submits only changed writable values and preserves omitted or untouched write-only data", () => {
    expect(
      writableArticleChanges(
        schema,
        {
          readOnly: "forged",
          normal: "same",
          writeOnly: undefined,
          unknown: "forged",
        },
        { readOnly: "visible", normal: "same" },
      ),
    ).toEqual({});
    expect(
      writableArticleChanges(
        schema,
        { normal: null, writeOnly: "new" },
        { normal: "old" },
      ),
    ).toEqual({ normal: null, writeOnly: "new" });
  });
  it("does not require the hidden existing value of required write-only fields", () => {
    const field = schema.groups[0]!.fields[1]!;
    expect(articleFieldRequired(field, true)).toBe(false);
    expect(articleFieldRequired(field, false)).toBe(true);
    expect(articleFieldRequired({ ...field, canWrite: false }, false)).toBe(
      false,
    );
  });
  it("requests only writable select dictionaries, once per dictionary", () => {
    const fields = testArticleSchema([
      testArticleField("a", {
        dataType: "single_select",
        optionsDictType: "level",
      }),
      testArticleField("b", {
        dataType: "multi_select",
        optionsDictType: "level",
      }),
      testArticleField("c", {
        dataType: "single_select",
        optionsDictType: "private",
        canWrite: false,
      }),
      testArticleField("d", { optionsDictType: "irrelevant" }),
    ]);
    expect(articleOptionDictionaries(fields)).toEqual(["level"]);
  });
});
