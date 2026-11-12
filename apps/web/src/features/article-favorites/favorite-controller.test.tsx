import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ApiClient } from "@common/api-contracts/client";
import { ArticleFavoriteController } from "@/features/article-favorites/favorite-controller";
import {
  ArticleFavorites,
  ArticleFavoriteButton,
} from "@/features/article-favorites/article-favorites";
import { PublicSessionProvider } from "@/platform/auth/public-session";
vi.mock("next/navigation", () => ({ usePathname: () => "/knowledge" }));

const path = "/articles?page=1&pageSize=12";
const request = vi.fn<ApiClient["request"]>();
let current = 7;
let favorite = true;
beforeEach(() => {
  current = 7;
  favorite = true;
  request.mockReset().mockImplementation(async (route, options) => {
    if (route === "/auth/me") return { userId: current } as never;
    if (route === path)
      return {
        items: [
          { articleId: 11, favoriteByMe: favorite },
          { articleId: 12, favoriteByMe: false },
        ],
      } as never;
    if (options?.method === "DELETE") favorite = false;
    if (options?.method === "PUT") favorite = true;
    return undefined as never;
  });
});
const setup = (user: number | null = 7) =>
  new ArticleFavoriteController(
    request as ApiClient["request"],
    user,
    path,
    [11, 12],
  );
describe("Article favorites account and submission lifecycle", () => {
  it("keeps guest projections false and performs no personal read", async () => {
    const controller = setup(null);
    await controller.load();
    await controller.toggle(11);
    expect(request).not.toHaveBeenCalled();
    expect(controller.getSnapshot().values).toEqual({ 11: false, 12: false });
  });
  it("loads one page for all cards after checking the current session", async () => {
    const controller = setup();
    await controller.load();
    expect(controller.getSnapshot().values).toEqual({ 11: true, 12: false });
    expect(request.mock.calls.map(([route]) => route)).toEqual([
      "/auth/me",
      path,
    ]);
    expect(
      request.mock.calls.every(([, options]) => options?.cache === "no-store"),
    ).toBe(true);
  });
  it("never accepts a projection from another account or writes on its behalf", async () => {
    const controller = setup();
    await controller.load();
    current = 8;
    await controller.toggle(11);
    expect(
      request.mock.calls.filter(([, options]) =>
        ["PUT", "DELETE"].includes(options?.method ?? ""),
      ),
    ).toHaveLength(0);
    expect(controller.getSnapshot()).toMatchObject({
      values: { 11: null, 12: null },
      busy: null,
    });
  });
  it("reconciles cancel then add using the existing routes", async () => {
    const controller = setup();
    await controller.load();
    await controller.toggle(11);
    expect(controller.getSnapshot().values[11]).toBe(false);
    await controller.toggle(11);
    expect(controller.getSnapshot().values[11]).toBe(true);
    expect(request).toHaveBeenCalledWith(
      "/me/favorites",
      expect.objectContaining({
        method: "PUT",
        body: { targetType: "article", targetId: 11 },
      }),
    );
    expect(request).toHaveBeenCalledWith(
      "/me/favorites/article/11",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
  it("locks synchronously across double clicks", async () => {
    const controller = setup();
    await controller.load();
    await Promise.all([
      controller.toggle(11),
      controller.toggle(11),
      controller.toggle(12),
    ]);
    expect(
      request.mock.calls.filter(([, options]) => options?.method === "DELETE"),
    ).toHaveLength(1);
  });
  it("reads the actual state after a committed write with a lost response", async () => {
    const controller = setup();
    await controller.load();
    request
      .mockImplementationOnce(async () => ({ userId: 7 }) as never)
      .mockImplementationOnce(async () => {
        favorite = false;
        throw new Error("lost response");
      });
    await controller.toggle(11);
    expect(controller.getSnapshot()).toMatchObject({
      values: { 11: false },
      busy: null,
    });
    expect(controller.getSnapshot().error).toContain("核对");
  });
  it("blocks further toggles after failed reconciliation until a successful reload", async () => {
    const controller = setup();
    await controller.load();
    request
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(new Error("offline"));
    await controller.toggle(11);
    request.mockClear();
    await controller.toggle(11);
    expect(request).not.toHaveBeenCalled();
    await controller.load();
    expect(controller.getSnapshot().values[11]).toBe(true);
  });
  it("ignores late reads after disposal and aborts network work", async () => {
    const controller = setup();
    let release!: (value: never) => void;
    request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = controller.load();
    const signal = request.mock.calls[0]![1]!.signal!;
    controller.dispose();
    release({ userId: 7 } as never);
    await pending;
    expect(signal.aborted).toBe(true);
    expect(controller.getSnapshot().values[11]).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("marks missing or malformed rows unavailable without synthesizing false", async () => {
    const controller = setup();
    request
      .mockImplementationOnce(async () => ({ userId: 7 }) as never)
      .mockImplementationOnce(
        async () =>
          ({ items: [{ articleId: 11, favoriteByMe: "false" }] }) as never,
      );
    await controller.load();
    expect(controller.getSnapshot().values).toEqual({ 11: null, 12: null });
  });
  it("supports StrictMode effect replay without accepting the aborted load", async () => {
    const controller = setup();
    controller.dispose();
    controller.activate();
    await controller.load();
    expect(controller.getSnapshot().values[11]).toBe(true);
  });
  it("SSR renders safe pending status without injecting a login form", () => {
    const html = renderToStaticMarkup(
      createElement(
        PublicSessionProvider,
        null,
        createElement(ArticleFavorites, {
          path,
          ids: [11],
          children: createElement(ArticleFavoriteButton, { articleId: 11 }),
        }),
      ),
    );
    expect(html).toContain("正在确认登录状态");
    expect(html).not.toContain('autoComplete="current-password"');
    expect(html).not.toContain("<form");
    expect(html).not.toContain("accessToken");
    expect(html).not.toContain("localStorage");
  });
});
