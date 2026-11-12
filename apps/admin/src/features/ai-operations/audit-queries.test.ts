import { describe, expect, it, vi } from "vitest";
import type { AuditRequest } from "@/features/ai-operations/audit-queries";
import {
  auditPageQuery,
  readAuditPage,
  readAuditSummary,
  readAuditContent,
} from "@/features/ai-operations/audit-queries";
import {
  auditor,
  summary,
  auditPage,
  auditContent,
} from "@/features/ai-operations/audit-fixtures.test-helper";
import { deferred } from "@/platform/auth/session-fixtures.test-helper";
const signal = () => new AbortController().signal;
const read = (request: AuditRequest, abort = signal()) =>
  readAuditContent(
    request,
    auditor,
    summary.conversationId,
    "  review  ",
    abort,
  );
describe("AI audit production reads", () => {
  it("validates filters and encodes inclusive local/ISO time inputs before dispatch", () => {
    expect(
      Object.fromEntries(
        auditPageQuery(
          {
            userId: 12,
            status: "deleted",
            fromTime: "2026-11-03T08:00:00+08:00",
            toTime: "2026-11-03T00:00:00Z",
          },
          2,
          50,
        ),
      ),
    ).toEqual({
      page: "2",
      pageSize: "50",
      userId: "12",
      status: "deleted",
      fromTime: "2026-11-03T00:00:00.000Z",
      toTime: "2026-11-03T00:00:00.000Z",
    });
  });
  it.each([
    { userId: 0 },
    { userId: 2147483648 },
    { userId: 1.5 },
    { status: "hidden" },
    { fromTime: "invalid" },
    { fromTime: "2026-11-04", toTime: "2026-11-03" },
  ])("rejects invalid filters %j", async (filters) => {
    const request = vi.fn<AuditRequest>();
    await expect(
      readAuditPage(request, auditor, filters, 1, 20, signal()),
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it("reads projected metadata between two current-identity checks with cancellation/no-store", async () => {
    const request = vi
      .fn<AuditRequest>()
      .mockResolvedValueOnce(auditor)
      .mockResolvedValueOnce({ ...auditPage, secret: "private" })
      .mockResolvedValueOnce(auditor);
    const abort = signal();
    expect(await readAuditPage(request, auditor, {}, 1, 20, abort)).toEqual(
      auditPage,
    );
    expect(request.mock.calls).toEqual([
      ["/auth/me", { signal: abort, cache: "no-store" }],
      [
        "/admin/ai/conversations?page=1&pageSize=20",
        { signal: abort, cache: "no-store" },
      ],
      ["/auth/me", { signal: abort, cache: "no-store" }],
    ]);
  });
  it("validates the exact metadata target and rejects a mismatched user/status filter", async () => {
    const request = vi
      .fn<AuditRequest>()
      .mockResolvedValueOnce(auditor)
      .mockResolvedValueOnce(summary)
      .mockResolvedValueOnce(auditor);
    expect(
      await readAuditSummary(
        request,
        auditor,
        summary.conversationId,
        signal(),
      ),
    ).toEqual(summary);
    for (const filters of [{ userId: 13 }, { status: "deleted" }]) {
      const reader = vi
        .fn<AuditRequest>()
        .mockResolvedValueOnce(auditor)
        .mockResolvedValueOnce(auditPage);
      await expect(
        readAuditPage(reader, auditor, filters, 1, 20, signal()),
      ).rejects.toThrow();
      expect(reader).toHaveBeenCalledTimes(2);
    }
    const mismatch = vi
      .fn<AuditRequest>()
      .mockResolvedValueOnce(auditor)
      .mockResolvedValueOnce({
        ...summary,
        conversationId: "d3823e14-bd71-44e2-9c04-aa5b18f97c5a",
      });
    await expect(
      readAuditSummary(mismatch, auditor, summary.conversationId, signal()),
    ).rejects.toThrow();
  });
  it("POSTs a trimmed reason exactly once and checks identity after the audited response", async () => {
    const request = vi
      .fn<AuditRequest>()
      .mockResolvedValueOnce(auditor)
      .mockResolvedValueOnce(auditContent)
      .mockResolvedValueOnce(auditor);
    const abort = signal();
    expect(await read(request, abort)).toEqual(auditContent);
    expect(request.mock.calls).toEqual([
      ["/auth/me", { signal: abort, cache: "no-store" }],
      [
        `/admin/ai/conversations/${summary.conversationId}/content-access`,
        {
          method: "POST",
          body: { reason: "review" },
          signal: abort,
          cache: "no-store",
        },
      ],
      ["/auth/me", { signal: abort, cache: "no-store" }],
    ]);
  });
  it.each([
    { ...auditor, userId: 8 },
    { ...auditor, account: "other" },
    { ...auditor, permissionKeys: [] },
    { ...auditor, permissionKeys: auditor.permissionKeys.slice(0, 2) },
    null,
  ])(
    "does not dispatch content after stale or malformed identity %j",
    async (current) => {
      const request = vi.fn<AuditRequest>().mockResolvedValue(current);
      await expect(read(request)).rejects.toThrow();
      expect(request).toHaveBeenCalledTimes(1);
    },
  );
  it("rejects missing local content permission, invalid ID/reason and already aborted signal without requests", async () => {
    const request = vi.fn<AuditRequest>();
    const controller = new AbortController();
    controller.abort();
    await expect(read(request, controller.signal)).rejects.toThrow();
    await expect(
      readAuditContent(
        request,
        { ...auditor, permissionKeys: auditor.permissionKeys.slice(0, 2) },
        summary.conversationId,
        "review",
        signal(),
      ),
    ).rejects.toThrow();
    await expect(
      readAuditContent(request, auditor, "../other", "review", signal()),
    ).rejects.toThrow();
    await expect(
      readAuditContent(request, auditor, summary.conversationId, " ", signal()),
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it("drops content when the final grant changes or identity read fails; never repeats POST", async () => {
    for (const final of [
      { ...auditor, permissionKeys: [] },
      new Error("private"),
    ]) {
      const request = vi
        .fn<AuditRequest>()
        .mockResolvedValueOnce(auditor)
        .mockResolvedValueOnce(auditContent);
      if (final instanceof Error) request.mockRejectedValueOnce(final);
      else request.mockResolvedValueOnce(final);
      await expect(read(request)).rejects.toThrow();
      expect(
        request.mock.calls.filter(([, options]) => options?.method === "POST"),
      ).toHaveLength(1);
    }
  });
  it("does not replay a failed audited POST or proceed to the final read", async () => {
    const request = vi
      .fn<AuditRequest>()
      .mockResolvedValueOnce(auditor)
      .mockRejectedValueOnce(new Error("connection lost"));
    await expect(read(request)).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(2);
  });
  it.each([0, 1, 2])(
    "suppresses ignored cancellation after step %s",
    async (step) => {
      const pending = deferred<unknown>(),
        controller = new AbortController(),
        values = [auditor, auditContent, auditor];
      const request = vi.fn<AuditRequest>().mockImplementation(async () => {
        const index = request.mock.calls.length - 1;
        return index === step ? pending.promise : values[index];
      });
      const task = read(request, controller.signal),
        assertion = expect(task).rejects.toThrow();
      await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(step + 1));
      controller.abort();
      pending.resolve(values[step]);
      await assertion;
      expect(request).toHaveBeenCalledTimes(step + 1);
    },
  );
});
