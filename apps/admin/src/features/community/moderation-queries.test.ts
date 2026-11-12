import { describe, it, expect, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import {
  readDynamic,
  readDynamicPage,
  readCommentPage,
  prepareModeration,
  sendModeration,
  reviewModeration,
  type ModerationRequest,
} from "@/features/community/moderation-queries";
import {
  mutationFor,
  type ModerationTarget,
} from "@/features/community/moderation-model";
import {
  operator,
  dynamic,
  comment,
  target,
  deferred,
} from "@/features/community/moderation-fixtures.test-helper";
const signal = () => new AbortController().signal;
const commentPage = {
  items: [comment],
  total: 21,
  page: 2,
  pageSize: 20,
  hasNext: false,
};
function setup() {
  const mock = vi.fn(async (path: string) =>
    path === "/auth/me"
      ? operator
      : path.includes("comments?")
        ? commentPage
        : path.startsWith("/admin/dynamics?")
          ? {
              items: [dynamic],
              page: 2,
              pageSize: 20,
              total: 21,
              hasNext: false,
            }
          : dynamic,
  );
  return { mock, request: mock as ModerationRequest };
}
describe("moderation query orchestration", () => {
  it("verifies identity before reading no-store private detail", async () => {
    const s = setup();
    expect(await readDynamic(s.request, operator, 7, signal())).toEqual(
      dynamic,
    );
    expect(s.mock.mock.calls.map((call) => call[0])).toEqual([
      "/auth/me",
      "/admin/dynamics/7",
      "/auth/me",
    ]);
    expect(s.mock).toHaveBeenCalledWith(
      "/admin/dynamics/7",
      expect.objectContaining({ cache: "no-store" }),
    );
  });
  it("does not read for a changed identity", async () => {
    const mock = vi.fn(async () => ({ ...operator, userId: 2 }));
    await expect(
      readDynamic(mock as ModerationRequest, operator, 7, signal()),
    ).rejects.toThrow();
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it("does not continue a cancelled identity request", async () => {
    const controller = new AbortController(),
      pending = deferred<typeof operator>(),
      mock = vi.fn(() => pending.promise);
    const task = readDynamic(
      mock as ModerationRequest,
      operator,
      7,
      controller.signal,
    );
    controller.abort();
    pending.resolve(operator);
    await expect(task).rejects.toThrow();
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it("rejects wrong detail identity", async () => {
    const mock = vi.fn(async (path: string) =>
      path === "/auth/me" ? operator : { ...dynamic, dynamicId: 9 },
    );
    await expect(
      readDynamic(mock as ModerationRequest, operator, 7, signal()),
    ).rejects.toThrow();
  });
  it("uses committed search filters", async () => {
    const s = setup();
    await readDynamicPage(
      s.request,
      operator,
      { page: 2, status: "pending", keyword: "snow" },
      signal(),
    );
    expect(s.mock).toHaveBeenCalledWith(
      "/admin/dynamics?page=2&pageSize=20&keyword=snow&status=pending",
      expect.anything(),
    );
  });
  it("uses the existing comments page with parent matching", async () => {
    const s = setup();
    expect(await readCommentPage(s.request, operator, 7, 2, signal())).toEqual(
      commentPage,
    );
    expect(s.mock).toHaveBeenCalledWith(
      "/admin/dynamics/7/comments?page=2&pageSize=20",
      expect.objectContaining({ cache: "no-store" }),
    );
  });
  it("rejects foreign comments returned by the page", async () => {
    const mock = vi.fn(async (path: string) =>
      path === "/auth/me"
        ? operator
        : { ...commentPage, items: [{ ...comment, dynamicId: 9 }] },
    );
    await expect(
      readCommentPage(mock as ModerationRequest, operator, 7, 2, signal()),
    ).rejects.toThrow();
  });
  it("prepares only action and reason without client authority or status fields", async () => {
    const s = setup();
    expect(
      await prepareModeration(
        s.request,
        operator,
        target,
        "  reviewed  ",
        signal(),
      ),
    ).toEqual({ action: "approve", reason: "reviewed" });
  });
  it.each(["content", "updatedAt", "status", "moderationReason"] as const)(
    "refuses dynamic changes in %s before mutation",
    async (key) => {
      const s = setup();
      s.mock.mockImplementation(async (path) =>
        path === "/auth/me" ? operator : { ...dynamic, [key]: "changed" },
      );
      await expect(
        prepareModeration(s.request, operator, target, "", signal()),
      ).rejects.toThrow();
    },
  );
  it("rejects a transition that is already invalid in the displayed record", async () => {
    const s = setup();
    await expect(
      prepareModeration(
        s.request,
        operator,
        { ...target, action: "restore" },
        "",
        signal(),
      ),
    ).rejects.toThrow();
  });
  it("prepares a comment by its original page and rejects any content change", async () => {
    const s = setup(),
      t: ModerationTarget = {
        kind: "comment",
        item: comment,
        action: "hide",
        page: 2,
      };
    expect(
      await prepareModeration(s.request, operator, t, "", signal()),
    ).toEqual({ action: "hide" });
    s.mock.mockImplementation(async (path) =>
      path === "/auth/me"
        ? operator
        : { ...commentPage, items: [{ ...comment, content: "changed" }] },
    );
    await expect(
      prepareModeration(s.request, operator, t, "", signal()),
    ).rejects.toThrow();
  });
  it("rejects a comment moved out of its original page without scanning other pages", async () => {
    const mock = vi.fn(async (path: string) =>
      path === "/auth/me" ? operator : { ...commentPage, items: [], total: 20 },
    );
    await expect(
      prepareModeration(
        mock as ModerationRequest,
        operator,
        { kind: "comment", item: comment, action: "hide", page: 2 },
        "",
        signal(),
      ),
    ).rejects.toThrow();
    expect(mock).toHaveBeenCalledTimes(3);
  });
  it.each(["dynamic", "comment"] as const)(
    "sends exact PATCH and validates the %s target response",
    async (kind) => {
      const m =
        kind === "dynamic"
          ? mutationFor(target)
          : mutationFor({ kind, item: comment, action: "hide", page: 2 });
      const mock = vi.fn(async () =>
        kind === "dynamic"
          ? {
              dynamicId: 7,
              status: "published",
              moderatedAt: dynamic.createdAt,
              moderatedByUserId: 1,
              moderationReason: null,
            }
          : {
              commentId: 8,
              status: "hidden",
              moderatedAt: dynamic.createdAt,
              moderatedByUserId: 1,
              moderationReason: null,
            },
      );
      await sendModeration(
        mock as ModerationRequest,
        m,
        { action: m.action as "approve" | "hide" },
        signal(),
      );
      expect(mock).toHaveBeenCalledWith(
        `/admin/${kind === "dynamic" ? "dynamics/7" : "comments/8"}/moderation`,
        expect.objectContaining({
          method: "PATCH",
          body: { action: m.action },
        }),
      );
    },
  );
  it("sends DELETE without a reason body", async () => {
    const mock = vi.fn(async () => undefined);
    await sendModeration(
      mock as ModerationRequest,
      { ...mutationFor(target), action: "delete" },
      undefined,
      signal(),
    );
    expect(mock).toHaveBeenCalledWith(
      "/admin/dynamics/7",
      expect.not.objectContaining({ body: expect.anything() }),
    );
  });
  it("leaves malformed success as an error rather than confirmed success", async () => {
    const mock = vi.fn(async () => ({ dynamicId: 9, status: "published" }));
    await expect(
      sendModeration(
        mock as ModerationRequest,
        mutationFor(target),
        { action: "approve" },
        signal(),
      ),
    ).rejects.toThrow();
  });
  it("rejects unsupported comment approve and mismatched actions before sending", async () => {
    const mock = vi.fn();
    await expect(
      sendModeration(
        mock,
        { ...mutationFor(target), kind: "comment" },
        { action: "approve" },
        signal(),
      ),
    ).rejects.toThrow();
    await expect(
      sendModeration(mock, mutationFor(target), { action: "hide" }, signal()),
    ).rejects.toThrow();
    expect(mock).not.toHaveBeenCalled();
  });
  it("does not treat absent comments or a 404 as deletion proof", async () => {
    const t = mutationFor({
      kind: "comment",
      item: comment,
      action: "delete",
      page: 2,
    });
    const mock = vi.fn(async (path: string) =>
      path === "/auth/me" ? operator : { ...commentPage, items: [], total: 20 },
    );
    expect(
      (
        await reviewModeration(
          mock as ModerationRequest,
          operator,
          [t],
          signal(),
        )
      )[0],
    ).toContain("不能据此认定已删除");
    mock.mockImplementation(async (path) => {
      if (path === "/auth/me") return operator;
      throw new ApiError("missing", { status: 404, code: 404, traceId: null });
    });
    expect(
      (
        await reviewModeration(
          mock as ModerationRequest,
          operator,
          [mutationFor(target)],
          signal(),
        )
      )[0],
    ).toContain("404不证明删除成功");
  });
  it("propagates permission failures during review", async () => {
    const mock = vi.fn(async () => {
      throw new ApiError("denied", { status: 403, code: 403, traceId: null });
    });
    await expect(
      reviewModeration(mock, operator, [mutationFor(target)], signal()),
    ).rejects.toThrow();
  });
  it.each([0, 2147483648])(
    "rejects invalid target %s before any request",
    async (id) => {
      const mock = vi.fn();
      await expect(readDynamic(mock, operator, id, signal())).rejects.toThrow();
      await expect(
        sendModeration(
          mock,
          { ...mutationFor(target), targetId: id },
          { action: "approve" },
          signal(),
        ),
      ).rejects.toThrow();
      expect(mock).not.toHaveBeenCalled();
    },
  );
});
