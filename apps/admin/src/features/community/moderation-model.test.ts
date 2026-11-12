import { describe, it, expect } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import {
  moderationId,
  canModerate,
  moderatorKey,
  verifyModerator,
  dynamicListPath,
  moderationPage,
  moderationBody,
  dynamicActions,
  commentActions,
  dynamicFingerprint,
  commentFingerprint,
  mutationFor,
  moderationError,
} from "@/features/community/moderation-model";
import {
  operator,
  dynamic,
  comment,
  target,
} from "@/features/community/moderation-fixtures.test-helper";
describe("moderation contract and authorization", () => {
  it.each(["0", "01", "-1", "1.5", "1e2", "+7", " 7", "2147483648", "x"])(
    "rejects ID %s",
    (value) => expect(moderationId(value)).toBeNull(),
  );
  it.each(["1", "2147483647"])("accepts ID %s", (value) =>
    expect(moderationId(value)).toBe(Number(value)),
  );
  it("permits a custom role with the explicit portal and moderation grants", () =>
    expect(canModerate(operator)).toBe(true));
  it.each(["management:portal:enter", "content:dynamic:moderate"])(
    "requires %s",
    (grant) =>
      expect(
        canModerate({
          ...operator,
          permissionKeys: operator.permissionKeys.filter(
            (key) => key !== grant,
          ),
        }),
      ).toBe(false),
  );
  it("normalizes grant order and detects actor or role changes", () => {
    expect(
      moderatorKey({
        ...operator,
        permissionKeys: [...operator.permissionKeys].reverse(),
      }),
    ).toBe(moderatorKey(operator));
    for (const user of [
      { ...operator, userId: 2 },
      { ...operator, roles: [] },
      { ...operator, permissionKeys: [] },
    ])
      expect(() => verifyModerator(user, operator)).toThrow();
  });
  it("uses offset pagination and only the declared query fields", () => {
    expect(
      dynamicListPath({ page: 2, keyword: " 雪 ", status: "hidden" }),
    ).toBe(
      "/admin/dynamics?page=2&pageSize=20&keyword=%E9%9B%AA&status=hidden",
    );
    expect(dynamicListPath({ page: 1, keyword: " " })).toBe(
      "/admin/dynamics?page=1&pageSize=20",
    );
  });
  it.each([0, -1, 1.5, NaN, 107374184])("rejects page %s", (page) =>
    expect(() => moderationPage(page)).toThrow(),
  );
  it("rejects excessive search and unknown status", () => {
    expect(() =>
      dynamicListPath({ page: 1, keyword: "x".repeat(101) }),
    ).toThrow();
    expect(() =>
      dynamicListPath({ page: 1, status: "draft" as never }),
    ).toThrow();
  });
  it("trims optional reasons and rejects excess or wrong values", () => {
    expect(moderationBody("approve", "  ")).toEqual({ action: "approve" });
    expect(moderationBody("hide", "  违反规则  ")).toEqual({
      action: "hide",
      reason: "违反规则",
    });
    expect(() => moderationBody("hide", "x".repeat(501))).toThrow();
    expect(() => moderationBody("publish" as never, "")).toThrow();
    expect(() => moderationBody("hide", null as never)).toThrow();
  });
  it("allows exactly the declared state transitions", () => {
    expect(dynamicActions("pending")).toEqual(["approve", "hide"]);
    expect(dynamicActions("published")).toEqual(["hide"]);
    expect(dynamicActions("hidden")).toEqual(["restore"]);
    expect(commentActions("visible")).toEqual(["hide"]);
    expect(commentActions("hidden")).toEqual(["restore"]);
    expect(() => dynamicActions("draft" as never)).toThrow();
    expect(() => commentActions("pending" as never)).toThrow();
  });
  it("compares content and moderation without expiring signed URLs", () => {
    expect(
      dynamicFingerprint({
        ...dynamic,
        imageUrls: ["https://example.com/new-signature"],
      }),
    ).toBe(dynamicFingerprint(dynamic));
    expect(dynamicFingerprint({ ...dynamic, updatedAt: "later" })).not.toBe(
      dynamicFingerprint(dynamic),
    );
    expect(
      commentFingerprint({ ...comment, moderationReason: "new" }),
    ).not.toBe(commentFingerprint(comment));
  });
  it("stores only target metadata in the recovery mutation", () => {
    expect(mutationFor(target)).toEqual({
      kind: "dynamic",
      dynamicId: 7,
      targetId: 7,
      action: "approve",
    });
    expect(
      mutationFor({ kind: "comment", item: comment, action: "hide", page: 2 }),
    ).toEqual({
      kind: "comment",
      dynamicId: 7,
      targetId: 8,
      action: "hide",
      page: 2,
    });
  });
  it("does not disclose raw server errors", () => {
    expect(
      moderationError(
        new ApiError("private secret", {
          status: 500,
          code: 500,
          traceId: "trace",
        }),
      ),
    ).not.toContain("private secret");
    expect(
      moderationError(
        new ApiError("private secret", {
          status: 403,
          code: 403,
          traceId: "trace",
        }),
      ),
    ).toContain("trace");
  });
});
