import { expect, it, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import {
  operator,
  dynamic,
  comment,
} from "@/features/community/moderation-fixtures.test-helper";
import {
  readDynamic,
  readDynamicPage,
  readCommentPage,
  sendModeration,
  type ModerationRequest,
} from "@/features/community/moderation-queries";
const signal = () => new AbortController().signal;
it("rejects a changed merchant association even when grants are identical", async () => {
  const req = vi.fn(async () => ({
    ...operator,
    merchant: { merchantId: 9, businessName: "changed" },
  })) as ModerationRequest;
  await expect(readDynamic(req, operator, 7, signal())).rejects.toThrow("授权");
});
it.each([{ items: [comment, comment], total: 2 }, { hasNext: true }])(
  "rejects inconsistent comment pagination %j",
  async (patch) => {
    await expect(
      readCommentPage(
        request({ ...page(comment), ...patch }),
        operator,
        7,
        1,
        signal(),
      ),
    ).rejects.toThrow();
  },
);
const page = (item: unknown) => ({
  items: [item],
  total: 1,
  page: 1,
  pageSize: 20,
  hasNext: false,
});
function request(value: unknown) {
  return vi.fn(async (path: string) =>
    path === "/auth/me" ? operator : value,
  ) as unknown as ModerationRequest;
}
it.each([
  { authorId: 0 },
  { authorNickname: null },
  { content: null },
  { imageUrls: ["javascript:alert(1)"] },
  { status: ["pending"] },
  { resortId: "7" },
  { moderatedAt: "yesterday" },
  { moderatedByUserId: -1 },
  { moderationReason: 1 },
  { updatedAt: "bad" },
])("rejects malformed dynamic %j", async (patch) => {
  await expect(
    readDynamic(request({ ...dynamic, ...patch }), operator, 7, signal()),
  ).rejects.toThrow();
});
it.each([
  { authorId: null },
  { status: ["visible"] },
  { content: null },
  { moderatedByUserId: 0 },
  { createdAt: "bad" },
])("rejects malformed comment %j", async (patch) => {
  await expect(
    readCommentPage(
      request(page({ ...comment, ...patch })),
      operator,
      7,
      1,
      signal(),
    ),
  ).rejects.toThrow();
});
it.each([
  { total: 2 },
  { hasNext: true },
  { pageSize: 10 },
  { items: [dynamic, dynamic], total: 2 },
  { items: [{ ...dynamic, status: "hidden" }] },
])("rejects malformed or mismatched dynamic page %j", async (patch) => {
  await expect(
    readDynamicPage(
      request({ ...page(dynamic), ...patch }),
      operator,
      { page: 1, status: "pending" },
      signal(),
    ),
  ).rejects.toThrow();
});
it("projects nested data instead of leaking extra response properties", async () => {
  const images = ["https://example.com/image"],
    result = await readDynamic(
      request({ ...dynamic, imageUrls: images, privateMetadata: "secret" }),
      operator,
      7,
      signal(),
    );
  expect(result).not.toHaveProperty("privateMetadata");
  images.push("https://example.com/late");
  expect(result.imageUrls).toHaveLength(1);
});
it.each(["detail", "page", "comment", "missing"])(
  "rejects identity changes after %s",
  async (kind) => {
    let identities = 0;
    const req = vi.fn(async (path: string) => {
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
      return kind === "page"
        ? page(dynamic)
        : kind === "comment"
          ? page(comment)
          : dynamic;
    }) as ModerationRequest;
    await expect(
      kind === "page"
        ? readDynamicPage(req, operator, { page: 1 }, signal())
        : kind === "comment"
          ? readCommentPage(req, operator, 7, 1, signal())
          : readDynamic(req, operator, 7, signal()),
    ).rejects.toThrow("授权");
  },
);
it("rejects malformed local identity before HTTP", async () => {
  const req = vi.fn();
  await expect(
    readDynamic(req, { ...operator, nickname: null } as never, 7, signal()),
  ).rejects.toThrow();
  expect(req).not.toHaveBeenCalled();
});
it.each(["dynamic", "comment"] as const)(
  "rejects incomplete %s command receipts",
  async (kind) => {
    await expect(
      sendModeration(
        request(
          kind === "dynamic"
            ? { dynamicId: 7, status: "hidden" }
            : { commentId: 8, status: "hidden" },
        ),
        {
          kind,
          dynamicId: 7,
          targetId: kind === "dynamic" ? 7 : 8,
          action: "hide",
        },
        { action: "hide" },
        signal(),
      ),
    ).rejects.toThrow();
  },
);
it("rejects a nonempty DELETE success receipt", async () => {
  await expect(
    sendModeration(
      request(dynamic),
      { kind: "dynamic", dynamicId: 7, targetId: 7, action: "delete" },
      undefined,
      signal(),
    ),
  ).rejects.toThrow();
});
