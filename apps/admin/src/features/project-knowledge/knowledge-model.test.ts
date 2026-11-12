import { describe, it, expect, expectTypeOf } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import {
  knowledgeInput,
  knowledgeId,
  knowledgeWorkspaceKey,
  knowledgePath,
  canManageKnowledge,
  verifyKnowledgeOperator,
  assertKnowledgeCommand,
  knowledgeError,
  type KnowledgeInput,
  type KnowledgeAction,
} from "@/features/project-knowledge/knowledge-model";
import {
  operator,
  input,
  item,
} from "@/features/project-knowledge/knowledge-fixtures.test-helper";
describe("project knowledge input and authorization", () => {
  it("uses the generated nullable string sourceUrl contract", () => {
    expectTypeOf<KnowledgeInput["sourceUrl"]>().toEqualTypeOf<
      string | null | undefined
    >();
    expect(knowledgeInput(input)).toEqual(input);
  });
  it.each([
    "0",
    "01",
    "-1",
    "1.1",
    "1e2",
    "+7",
    " 7",
    "2147483648",
    "Infinity",
    "x",
  ])("rejects malformed id %s", (value) =>
    expect(knowledgeId(value)).toBeNull(),
  );
  it("accepts the database id bounds", () => {
    expect(knowledgeId("1")).toBe(1);
    expect(knowledgeId("2147483647")).toBe(2147483647);
  });
  it.each([
    "list",
    "create",
    "update",
    "publish",
    "withdraw",
    "delete",
  ] as KnowledgeAction[])("requires the exact %s grant", (action) => {
    expect(canManageKnowledge(operator, action)).toBe(true);
    expect(
      canManageKnowledge(
        {
          ...operator,
          permissionKeys: operator.permissionKeys.filter(
            (key) => key !== `content:project-knowledge:${action}`,
          ),
        },
        action,
      ),
    ).toBe(false);
  });
  it("supports create without unrelated read/update grants", () => {
    const user = {
      ...operator,
      permissionKeys: [
        "management:portal:enter",
        "content:project-knowledge:create",
      ],
    };
    expect(canManageKnowledge(user, "create")).toBe(true);
    expect(canManageKnowledge(user, "list")).toBe(false);
  });
  it.each([
    { ...operator, roles: [{ roleKey: "custom_admin", roleName: "管理员" }] },
    {
      ...operator,
      roles: operator.roles.concat({ roleKey: "user", roleName: "用户" }),
    },
    { ...operator, roles: [] },
    {
      ...operator,
      permissionKeys: operator.permissionKeys.filter(
        (key) => key !== "management:portal:enter",
      ),
    },
  ])("denies copied grants, mixed identities and missing portal", (user) =>
    expect(canManageKnowledge(user, "list")).toBe(false),
  );
  it("compares actor, effective roles and grants while ignoring presentation changes", () => {
    expect(knowledgeWorkspaceKey(operator)).toBe(
      knowledgeWorkspaceKey({
        ...operator,
        permissionKeys: [...operator.permissionKeys].reverse(),
      }),
    );
    expect(() =>
      verifyKnowledgeOperator({ ...operator, nickname: "已改名" }, operator),
    ).not.toThrow();
    expect(() =>
      verifyKnowledgeOperator({ ...operator, userId: 2 }, operator),
    ).toThrow();
  });
  it("whitelists create fields and keeps the original edit version", () => {
    const values = {
      ...input,
      status: "published",
      version: 999,
      authorId: 8,
      title: " 保留输入 ",
    };
    expect(knowledgeInput(values)).toEqual({ ...input, title: " 保留输入 " });
    expect(knowledgeInput(values, 2)).toEqual({
      ...input,
      title: " 保留输入 ",
      version: 2,
    });
  });
  it.each(["title", "content", "category"] as const)(
    "rejects blank %s",
    (key) => expect(() => knowledgeInput({ ...input, [key]: " " })).toThrow(),
  );
  it.each([
    "javascript:alert(1)",
    "ftp://example.com/a",
    "https://u:p@example.com/a",
    "not a URL",
    "https://example.com/" + "a".repeat(2048),
  ])("rejects an invalid/credentialed source URL", (sourceUrl) =>
    expect(() => knowledgeInput({ ...input, sourceUrl })).toThrow(),
  );
  it.each([undefined, null, "", " "])(
    "allows an empty source URL %j",
    (sourceUrl) =>
      expect(knowledgeInput({ ...input, sourceUrl })).toEqual({
        ...input,
        sourceUrl: null,
      }),
  );
  it("does not accept the previously incorrect object sourceUrl", () =>
    expect(() =>
      knowledgeInput({ ...input, sourceUrl: {} } as unknown as KnowledgeInput),
    ).toThrow());
  it.each([0, 1.1, 2147483648, NaN])("rejects invalid version %s", (version) =>
    expect(() => knowledgeInput(input, version)).toThrow(),
  );
  it("encodes filters and rejects overflowing pagination", () => {
    expect(
      new URLSearchParams(
        knowledgePath({
          page: 2,
          keyword: " FAQ &雪 ",
          status: "published",
        }).split("?")[1],
      ).get("keyword"),
    ).toBe("FAQ &雪");
    expect(() => knowledgePath({ page: 107374184 })).toThrow();
    expect(() => knowledgePath({ page: 0 })).toThrow();
  });
  it("enforces explicit publication transitions", () => {
    expect(() => assertKnowledgeCommand(item, "publish")).not.toThrow();
    expect(() => assertKnowledgeCommand(item, "withdraw")).toThrow();
    expect(() =>
      assertKnowledgeCommand({ ...item, status: "published" }, "publish"),
    ).toThrow();
    expect(() => assertKnowledgeCommand(item, "delete")).not.toThrow();
  });
  it("reports concurrency and trace id without exposing raw backend details", () => {
    const message = knowledgeError(
      new ApiError("secret SQL", {
        status: 409,
        code: 409,
        traceId: "trace-7",
      }),
    );
    expect(message).toContain("保留当前修改");
    expect(message).toContain("trace-7");
    expect(message).not.toContain("secret");
  });
});
