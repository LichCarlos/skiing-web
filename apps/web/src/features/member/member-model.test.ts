import { describe, expect, it, vi } from "vitest";
import { ApiError, type ApiClient } from "@common/api-contracts/client";
import {
  MemberRun,
  UnconfirmedWrite,
  parseOwnPage,
  parseOwnNote,
  parseCollection,
  validateNote,
} from "@/features/member/member-model";
import {
  user,
  deferred,
} from "@/platform/auth/public-session-fixtures.test-helper";
const card = {
  dynamicId: 3,
  author: { userId: 7, nickname: "雪友", avatarUrl: null },
  summary: "山上的一天",
  coverUrl: null,
  imageCount: 0,
  resort: null,
  likeCount: 0,
  commentCount: 0,
  likedByMe: false,
  status: "pending",
  createdAt: "2026-11-07T01:00:00Z",
};
describe("member content boundaries", () => {
  it("accepts many images for editing and saving while rejecting duplicates", () => {
    const images = Array.from({ length: 150 }, (_, i) => ({
      assetId: String(i + 1),
      url: `https://assets.test/${i + 1}.jpg`,
    }));
    const content = images.map((x) => `![雪](asset:${x.assetId})`).join("\n");
    expect(() => validateNote(content, "markdown_v1", images)).not.toThrow();
    expect(
      parseOwnNote(
        {
          ...card,
          imageCount: images.length,
          content,
          contentFormat: "markdown_v1",
          version: 1,
          images,
          updatedAt: card.createdAt,
        },
        7,
        3,
      ).images,
    ).toEqual(images);
    expect(() =>
      validateNote(content, "markdown_v1", [...images, images[0]!]),
    ).toThrow("图片不能重复");
  });
  it("rejects another user's notes, wrong status and pagination", () => {
    const page = {
      items: [card],
      page: 1,
      pageSize: 12,
      total: 1,
      hasNext: false,
    };
    expect(parseOwnPage(page, 7, 1).items[0]!.status).toBe("pending");
    expect(() => parseOwnPage(page, 8, 1)).toThrow();
    expect(() => parseOwnPage(page, 7, 1, "published")).toThrow();
    expect(() => parseOwnPage({ ...page, hasNext: true }, 7, 1)).toThrow();
  });
  it("requires a matching versioned note and validates owned body images", () => {
    const note = {
      ...card,
      content: "# 山上的一天",
      contentFormat: "markdown_v1",
      version: 1,
      images: [],
      updatedAt: card.createdAt,
    };
    expect(parseOwnNote(note, 7, 3).content).toBe(note.content);
    expect(() => parseOwnNote(note, 7, 4)).toThrow();
    expect(() => parseOwnNote({ ...note, version: 0 }, 7, 3)).toThrow();
    expect(() => validateNote("![雪](asset:12)", "markdown_v1", [])).toThrow();
    expect(() =>
      validateNote("![雪](asset:12)", "markdown_v1", [{ assetId: "12" }]),
    ).not.toThrow();
    expect(() =>
      validateNote("<script>alert(1)</script>", "markdown_v1", []),
    ).toThrow();
  });
  it("keeps dynamic favorites distinct from knowledge and resort favorites", () => {
    const page = {
      items: [
        {
          favoriteId: "12",
          targetType: "dynamic",
          favoritedAt: card.createdAt,
          target: {
            targetType: "dynamic",
            id: 3,
            summary: "山上的一天",
            authorNickname: "雪友",
            createdAt: card.createdAt,
          },
        },
      ],
      page: 1,
      pageSize: 12,
      total: 1,
    };
    expect(parseCollection(page, "dynamic", 1).items[0]!.target.author).toBe(
      "雪友",
    );
    expect(() => parseCollection(page, "article", 1)).toThrow();
  });
});
describe("member request lifetime", () => {
  it("discards a late response after disposal", async () => {
    const response = deferred<unknown>();
    const run = new MemberRun(
      7,
      vi.fn(() => response.promise) as ApiClient["request"],
    );
    const parse = vi.fn();
    const pending = run.read("/me/dynamics", parse);
    run.dispose();
    response.resolve({});
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(parse).not.toHaveBeenCalled();
  });
  it("verifies identity before any write and refuses another account", async () => {
    const request = vi.fn().mockResolvedValue({ ...user, userId: 8 });
    const run = new MemberRun(7, request);
    await expect(run.write("/dynamics", "POST", {}, () => {})).rejects.toThrow(
      "账号已改变",
    );
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("serializes writes and never retries an unconfirmed POST", async () => {
    const response = deferred<unknown>();
    const request = vi
      .fn()
      .mockResolvedValueOnce(user)
      .mockImplementationOnce(() => response.promise);
    const run = new MemberRun(7, request);
    const first = run.write("/dynamics", "POST", {}, () => {});
    await Promise.resolve();
    await Promise.resolve();
    await expect(run.write("/dynamics", "POST", {}, () => {})).rejects.toThrow(
      "仍在进行",
    );
    response.reject(
      new ApiError("Disconnected", { status: 0, code: null, traceId: null }),
    );
    await expect(first).rejects.toBeInstanceOf(UnconfirmedWrite);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]![1]).toMatchObject({
      method: "POST",
      skipAuthRefresh: true,
    });
  });
  it("preserves explicit version conflicts for reload recovery", async () => {
    const error = new ApiError("Conflict", {
      status: 409,
      code: 409,
      traceId: null,
    });
    const request = vi
      .fn()
      .mockResolvedValueOnce(user)
      .mockRejectedValueOnce(error);
    await expect(
      new MemberRun(7, request).write(
        "/dynamics/3",
        "PATCH",
        { expectedVersion: 2 },
        () => {},
      ),
    ).rejects.toBe(error);
  });
  it("bounds reads by a deadline", async () => {
    vi.useFakeTimers();
    try {
      const request = vi.fn(
        (_path, options) =>
          new Promise((_resolve, reject) =>
            options.signal.addEventListener("abort", () =>
              reject(options.signal.reason),
            ),
          ),
      );
      const pending = new MemberRun(7, request as ApiClient["request"]).read(
        "/me/dynamics",
        () => {},
      );
      const assertion = expect(pending).rejects.toMatchObject({
        name: "TimeoutError",
      });
      await vi.advanceTimersByTimeAsync(15000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
