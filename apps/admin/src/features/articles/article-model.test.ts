import { describe, expect, it } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import {
  articleInput,
  articleIdFromSegment,
  articleWorkspaceKey,
  articleListPath,
  assertArticleCommand,
  verifyArticleOperator,
  articleError,
  type ArticleInput,
} from "@/features/articles/article-model";
import {
  operator,
  input,
  article,
} from "@/features/articles/article-fixtures.test-helper";
import {
  testArticleField,
  testArticleSchema,
} from "@/features/articles/__tests__/fixtures";

describe("article page input and identity rules", () => {
  it.each([
    "0",
    "01",
    "-1",
    "1.1",
    "1e2",
    "+1",
    " 7",
    "7 ",
    "2147483648",
    "Infinity",
    "x",
    "7/edit",
  ])("rejects route %s", (id) => expect(articleIdFromSegment(id)).toBeNull());
  it.each(["1", "2147483647"])("accepts database id %s", (id) =>
    expect(articleIdFromSegment(id)).toBe(Number(id)),
  );
  it("uses order-independent grants and roles for workspace identity", () => {
    expect(articleWorkspaceKey(operator)).toBe(
      articleWorkspaceKey({
        ...operator,
        permissionKeys: [...operator.permissionKeys]
          .reverse()
          .concat(operator.permissionKeys),
        roles: operator.roles.concat(operator.roles),
      }),
    );
    expect(() =>
      verifyArticleOperator({ ...operator, nickname: "重命名" }, operator),
    ).not.toThrow();
  });
  it.each([
    { ...operator, userId: 2 },
    { ...operator, permissionKeys: ["content:article:manage"] },
    { ...operator, permissionKeys: ["management:portal:enter"] },
    {
      ...operator,
      permissionKeys: operator.permissionKeys.concat("other:read"),
    },
    { ...operator, roles: [{ roleKey: "other", roleName: "其他" }] },
  ])("rejects changed identity/authorization", (current) =>
    expect(() => verifyArticleOperator(current, operator)).toThrow(),
  );
  it("encodes query filters and trims only search keywords", () => {
    const params = new URLSearchParams(
      articleListPath({
        page: 2,
        keyword: " 雪 & %_ ",
        status: "published",
      }).split("?")[1],
    );
    expect(Object.fromEntries(params)).toEqual({
      page: "2",
      pageSize: "20",
      keyword: "雪 & %_",
      status: "published",
    });
  });
  it.each([0, -1, 1.1, 107374184, NaN, Infinity])(
    "rejects unsafe page %s",
    (page) => expect(() => articleListPath({ page })).toThrow(),
  );
  it("rejects invalid status and oversized keyword", () => {
    expect(() =>
      articleListPath({ page: 1, status: "pending" as never }),
    ).toThrow();
    expect(() =>
      articleListPath({ page: 1, keyword: "x".repeat(101) }),
    ).toThrow();
  });
  it("whitelists DTO and preserves invisible/unchanged/write-only values by omission", () => {
    const schema = testArticleSchema([
      testArticleField("read", { canWrite: false }),
      testArticleField("write", { canRead: false }),
      testArticleField("same"),
      testArticleField("clear"),
    ]);
    const values = {
      ...input,
      title: " 有意义的空格 ",
      status: "published",
      authorId: 99,
      customFields: {
        read: "attack",
        write: "new",
        same: "old",
        clear: null,
        unknown: true,
      },
    };
    expect(
      articleInput(values, schema, {
        same: "old",
        clear: "old",
        hidden: "secret",
      }),
    ).toEqual({
      ...input,
      title: " 有意义的空格 ",
      customFields: { write: "new", clear: null },
    });
  });
  it.each([null, [], false, "wrong"])(
    "rejects invalid customFields %j",
    (customFields) =>
      expect(() =>
        articleInput(
          { ...input, customFields } as unknown as ArticleInput,
          testArticleSchema([]),
          {},
        ),
      ).toThrow(),
  );
  it.each(["0", "01", "9223372036854775808", "1e3", "https://image"])(
    "rejects invalid cover %s",
    (coverAssetId) =>
      expect(() =>
        articleInput({ ...input, coverAssetId }, testArticleSchema([]), {}),
      ).toThrow(),
  );
  it("preserves large asset identifiers without Number conversion", () => {
    expect(
      articleInput(
        { ...input, coverAssetId: "9223372036854775807" },
        testArticleSchema([]),
        {},
      ).coverAssetId,
    ).toBe("9223372036854775807");
  });
  it.each(["title", "summary", "body", "categoryValue"] as const)(
    "rejects blank %s",
    (key) =>
      expect(() =>
        articleInput({ ...input, [key]: " " }, testArticleSchema([]), {}),
      ).toThrow(),
  );
  it("enforces explicit article lifecycle commands", () => {
    expect(() => assertArticleCommand(article, "publish")).not.toThrow();
    expect(() => assertArticleCommand(article, "withdraw")).toThrow();
    expect(() =>
      assertArticleCommand({ ...article, status: "published" }, "publish"),
    ).toThrow();
    expect(() =>
      assertArticleCommand({ ...article, status: "published" }, "withdraw"),
    ).not.toThrow();
    expect(() => assertArticleCommand(article, "delete")).not.toThrow();
  });
  it("shows a trace id without exposing raw provider errors", () => {
    const message = articleError(
      new ApiError("secret database text", {
        status: 500,
        code: 500,
        traceId: "trace-7",
      }),
    );
    expect(message).toContain("trace-7");
    expect(message).not.toContain("secret");
  });
});
