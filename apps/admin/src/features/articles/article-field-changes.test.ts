import { describe, expect, it } from "vitest";
import { articleFieldChanges } from "@/features/articles/article-field-changes";

describe("article custom field update payload", () => {
  it("does not resubmit unchanged read-only values from the detail", () => {
    expect(
      articleFieldChanges(
        { readOnly: "same", tags: ["ski", "snow"] },
        { readOnly: "same", tags: ["ski", "snow"] },
      ),
    ).toEqual({});
  });
  it("sends changed/new fields and explicit null without deleting omitted hidden values", () => {
    expect(
      articleFieldChanges(
        { changed: "new", added: false, cleared: null, reordered: ["b", "a"] },
        {
          changed: "old",
          cleared: "old",
          reordered: ["a", "b"],
          omitted: "preserve",
        },
      ),
    ).toEqual({
      changed: "new",
      added: false,
      cleared: null,
      reordered: ["b", "a"],
    });
  });
  it("sends all supplied values for creation and treats prototype keys as new fields", () => {
    expect(articleFieldChanges({ count: 0, empty: "" })).toEqual({
      count: 0,
      empty: "",
    });
    expect(articleFieldChanges({ toString: "attempt" })).toEqual({
      toString: "attempt",
    });
  });
});
