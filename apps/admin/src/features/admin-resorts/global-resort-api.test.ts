import { describe, it, expect, vi } from "vitest";
import { ApiError, type ApiRequestOptions } from "@common/api-contracts/client";
import {
  canManageGlobalResorts,
  globalResortListPath,
  globalResortFingerprint,
  mayRunGlobalCommand,
} from "@/features/admin-resorts/global-resort-model";
import {
  readGlobalResort,
  readGlobalResortPage,
  prepareGlobalCommand,
  runGlobalCommand,
  reviewGlobalWrites,
} from "@/features/admin-resorts/global-resort-api";
import {
  operator,
  item,
  page,
  requestFixture,
} from "@/features/admin-resorts/global-resort-fixtures.test-helper";
import {
  GlobalResortLedger,
  GlobalResortWriteGate,
} from "@/features/admin-resorts/global-resort-workflow";
import type { GlobalResortRequest } from "@/features/admin-resorts/global-resort-api";
const signal = () => new AbortController().signal;
describe("global resort queries and commands", () => {
  it("uses configured grants without requiring a merchant profile or role key", () => {
    expect(canManageGlobalResorts(operator, "publish")).toBe(true);
    expect(
      canManageGlobalResorts({
        ...operator,
        permissionKeys: ["management:portal:enter", "resort:merchant:list"],
      }),
    ).toBe(false);
  });
  it.each([
    "management:portal:enter",
    "content:resort:list-all",
    "content:resort:publish",
  ])("rejects publish without %s", (grant) => {
    expect(
      canManageGlobalResorts(
        {
          ...operator,
          permissionKeys: operator.permissionKeys.filter(
            (key) => key !== grant,
          ),
        },
        "publish",
      ),
    ).toBe(false);
  });
  it("builds the existing keyword/merchant/status pagination without client scopes", () => {
    expect(
      globalResortListPath({
        page: 2,
        keyword: " 测试 ",
        merchantId: 7,
        status: "pending_review",
      }),
    ).toBe(
      "/admin/resorts?page=2&pageSize=20&keyword=%E6%B5%8B%E8%AF%95&status=pending_review&merchantId=7",
    );
  });
  it.each([
    { page: 0 },
    { page: 107374184 },
    { page: 1, merchantId: 2147483648 },
    { page: 1, merchantId: 1.5 },
    { page: 1, status: "deleted" },
    { page: 1, keyword: "x".repeat(101) },
  ])("rejects unsafe filters %j", (filters) => {
    expect(() => globalResortListPath(filters)).toThrow();
  });
  it("ignores expiring image URLs while detecting ownership and body changes", () => {
    expect(
      globalResortFingerprint({
        ...item,
        coverUrl: "new",
        gallery: item.gallery.map((image) => ({ ...image, url: "new" })),
      }),
    ).toBe(globalResortFingerprint(item));
    expect(globalResortFingerprint({ ...item, merchantId: 99 })).not.toBe(
      globalResortFingerprint(item),
    );
  });
  it("checks latest identity before querying private data and supports cancellation", async () => {
    const s = requestFixture({
      "/auth/me": { ...operator, permissionKeys: [] },
    });
    await expect(
      readGlobalResort(s.request, operator, 42, signal()),
    ).rejects.toThrow("权限");
    expect(s.mock).toHaveBeenCalledTimes(1);
    const controller = new AbortController();
    controller.abort();
    await expect(
      readGlobalResort(s.request, operator, 42, controller.signal),
    ).rejects.toThrow();
    expect(s.mock).toHaveBeenCalledTimes(1);
  });
  it("rejects a detail for another target", async () => {
    const s = requestFixture({
      "/admin/resorts/42": { ...item, resortId: 43 },
    });
    await expect(
      readGlobalResort(s.request, operator, 42, signal()),
    ).rejects.toThrow("目标");
  });
  it.each([
    { ...page, page: 2 },
    { ...page, items: [item, item] },
    { ...page, total: -1 },
    { ...page, hasNext: "yes" },
  ])("rejects malformed page metadata", async (result) => {
    const s = requestFixture({ "/admin/resorts?page=1&pageSize=20": result });
    await expect(
      readGlobalResortPage(s.request, operator, { page: 1 }, signal()),
    ).rejects.toThrow("分页");
  });
  it.each(["draft", "pending_review", "offline"] as const)(
    "allows publishing %s and prevents offline",
    (status) => {
      const row = { ...item, status };
      expect(mayRunGlobalCommand(row, "publish")).toBe(true);
      expect(mayRunGlobalCommand(row, "offline")).toBe(false);
    },
  );
  it("re-reads the exact target and refuses stale moderation or deletion", async () => {
    const s = requestFixture({
      "/admin/resorts/42": { ...item, merchantId: 8 },
    });
    await expect(
      prepareGlobalCommand(s.request, operator, item, "delete", signal()),
    ).rejects.toThrow("归属");
    const t = requestFixture({
      "/admin/resorts/42": { ...item, status: "published" },
    });
    await expect(
      prepareGlobalCommand(
        t.request,
        operator,
        { ...item, status: "published" },
        "publish",
        signal(),
      ),
    ).rejects.toThrow("状态");
  });
  it("uses DELETE with no body and accepts an actual empty 204 result", async () => {
    const request = vi.fn(
      async (_path: string, _options?: ApiRequestOptions) => undefined,
    );
    expect(
      await runGlobalCommand(
        request as import("@/features/admin-resorts/global-resort-api").GlobalResortRequest,
        42,
        "delete",
        signal(),
      ),
    ).toBeUndefined();
    expect(request).toHaveBeenCalledWith(
      "/admin/resorts/42",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(request.mock.calls[0]?.[1]).not.toHaveProperty("body");
  });
  it.each([
    ["publish", { ...item, resortId: 43, status: "published" }],
    ["publish", { ...item, status: "draft" }],
    ["publish", undefined],
    ["offline", { ...item, resortId: 43, status: "offline" }],
    ["offline", { ...item, status: "published" }],
    ["delete", item],
  ] as const)(
    "keeps a mismatched %s success response uncertain",
    async (action, response) => {
      const ledger = new GlobalResortLedger();
      const gate = new GlobalResortWriteGate(
        operator,
        async () => operator,
        ledger,
        () => {},
      );
      gate.activate();
      const committed = vi.fn();
      const request = vi.fn(async () => response) as GlobalResortRequest;
      const result = await gate.run(
        { action, resortId: 42 },
        async () => 42,
        (id, activeSignal) =>
          runGlobalCommand(request, id, action, activeSignal),
        committed,
      );
      expect(result).toMatchObject({ status: "error", uncertain: true });
      expect(committed).not.toHaveBeenCalled();
      expect(ledger.entries(operator.userId)).toHaveLength(1);
      expect(request).toHaveBeenCalledTimes(1);
      gate.dispose();
    },
  );
  it.each(["publish", "offline"] as const)(
    "accepts the matching %s response",
    async (action) => {
      const response = {
        ...item,
        status: action === "publish" ? "published" : "offline",
      };
      const request = vi.fn(async () => response) as GlobalResortRequest;
      await expect(
        runGlobalCommand(request, 42, action, signal()),
      ).resolves.toEqual(response);
      expect(request).toHaveBeenCalledWith(
        `/admin/resorts/42/${action}`,
        expect.objectContaining({ method: "PATCH" }),
      );
    },
  );
  it("never treats a missing target or first page omission as write success", async () => {
    const s = requestFixture({
      "/admin/resorts/42": new ApiError("missing", {
        status: 404,
        code: 404,
        traceId: null,
      }),
    });
    expect(
      (
        await reviewGlobalWrites(
          s.request,
          operator,
          [
            { action: "delete", resortId: 42 },
            { action: "create", name: "new" },
          ],
          signal(),
        )
      ).join(" "),
    ).toContain("404不能证明删除成功");
    expect(
      s.mock.mock.calls.every((call) => !String(call[0]).includes("/publish")),
    ).toBe(true);
  });
});
