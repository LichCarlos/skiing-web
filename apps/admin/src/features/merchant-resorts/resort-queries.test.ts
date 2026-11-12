import { describe, it, expect, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
import {
  readResortForm,
  readResortPage,
  readResort,
  prepareResortSave,
  saveResort,
  prepareResortCommand,
  runResortCommand,
  reviewResortWrites,
  type ResortRequest,
} from "@/features/merchant-resorts/resort-queries";
import { initialResortInput } from "@/features/merchant-resorts/resort-model";
import {
  operator,
  item,
  schema,
  resortDictionary,
} from "@/features/merchant-resorts/resort-fixtures.test-helper";
const signal = () => new AbortController().signal;
function setup() {
  const mock = vi.fn(async (path: string): Promise<unknown> =>
    path === "/auth/me"
      ? operator
      : path === "/merchant/resorts/custom-fields"
        ? schema
        : path.startsWith("/admin/dictionaries/")
          ? resortDictionary()
          : path.includes("?")
            ? { items: [item], total: 1, page: 1, pageSize: 20, hasNext: false }
            : item,
  );
  return { mock, request: mock as ResortRequest };
}
describe("merchant resort requests", () => {
  it("loads generated detail and field/options catalogs only after identity verification", async () => {
    const s = setup();
    const data = await readResortForm(s.request, operator, 42, signal());
    expect(data.item).toEqual(item);
    expect(s.mock.mock.calls[0]?.[0]).toBe("/auth/me");
    expect(
      s.mock.mock.calls.some(
        ([path]) => path === "/admin/dictionaries/resort.fit_tag",
      ),
    ).toBe(true);
    expect(
      s.mock.mock.calls.some(([path]) => path.includes("merchantId")),
    ).toBe(false);
  });
  it("does not read private records for a changed merchant association", async () => {
    const s = setup();
    s.mock.mockResolvedValueOnce({ ...operator, merchant: { merchantId: 9 } });
    await expect(
      readResortPage(s.request, operator, 1, undefined, signal()),
    ).rejects.toThrow("商家关联");
    expect(s.mock).toHaveBeenCalledTimes(1);
  });
  it("rejects out-of-target detail responses", async () => {
    const s = setup();
    s.mock
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce({ ...item, resortId: 43 });
    await expect(readResort(s.request, operator, 42, signal())).rejects.toThrow(
      "不匹配",
    );
  });
  it("ignores a successful response returned after cancellation", async () => {
    const s = setup(),
      controller = new AbortController();
    s.mock.mockImplementationOnce(async () => {
      controller.abort();
      return operator;
    });
    await expect(
      readResort(s.request, operator, 42, controller.signal),
    ).rejects.toThrow();
    expect(s.mock).toHaveBeenCalledTimes(1);
  });
  it("fails the form closed when a required dictionary is unreadable", async () => {
    const s = setup();
    s.mock.mockImplementation(async (path) => {
      if (path.startsWith("/admin/dictionaries/")) throw new Error("denied");
      return path === "/auth/me"
        ? operator
        : path.includes("custom-fields")
          ? schema
          : item;
    });
    await expect(
      readResortForm(s.request, operator, 42, signal()),
    ).rejects.toThrow("denied");
  });
  it("does not query dictionaries for read-only fields", async () => {
    const s = setup();
    s.mock
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce({
        entityType: "ski_resort",
        groups: [
          {
            fields: [
              {
                ...schema.groups[0]!.fields![0]!,
                dataType: "single_select",
                optionsDictType: "private.options",
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce(resortDictionary())
      .mockResolvedValueOnce(item);
    await readResortForm(s.request, operator, 42, signal());
    expect(
      s.mock.mock.calls.some(([path]) => path.includes("private.options")),
    ).toBe(false);
  });
  it("refuses saving stale business data even when timestamps are unchanged", async () => {
    const s = setup();
    s.mock
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce({ ...item, price: 999 });
    await expect(
      prepareResortSave(
        s.request,
        operator,
        { item, schema, values: initialResortInput(item, schema) },
        signal(),
      ),
    ).rejects.toThrow("已变化");
  });
  it("refuses a changed field authorization schema", async () => {
    const s = setup();
    s.mock
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce(item)
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce({ ...schema, groups: [] });
    await expect(
      prepareResortSave(
        s.request,
        operator,
        { item, schema, values: initialResortInput(item, schema) },
        signal(),
      ),
    ).rejects.toThrow("字段定义");
  });
  it("sends only changed writable fields after fresh detail/schema checks", async () => {
    const s = setup();
    const body = await prepareResortSave(
      s.request,
      operator,
      {
        item,
        schema,
        values: {
          ...initialResortInput(item, schema),
          customFields: { readOnly: "旧值", both: "更新" },
        },
      },
      signal(),
    );
    expect(body.customFields).toEqual({ both: "更新" });
    await saveResort(s.request, 42, body, signal());
    expect(s.mock).toHaveBeenLastCalledWith(
      "/merchant/resorts/42",
      expect.objectContaining({ method: "PATCH", body }),
    );
  });
  it("creates a draft without a client merchantId", async () => {
    const s = setup(),
      body = initialResortInput(item, schema);
    await saveResort(s.request, undefined, body, signal());
    expect(s.mock).toHaveBeenLastCalledWith(
      "/merchant/resorts",
      expect.objectContaining({ method: "POST", body }),
    );
    expect(body).not.toHaveProperty("merchantId");
  });
  it("rejects mismatched save receipts so they require outcome review", async () => {
    const s = setup();
    s.mock.mockResolvedValueOnce({ ...item, resortId: 43 });
    await expect(
      saveResort(s.request, 42, initialResortInput(item, schema), signal()),
    ).rejects.toThrow("不匹配");
  });
  it("does not review changed or already pending resorts", async () => {
    const s = setup();
    s.mock
      .mockResolvedValueOnce(operator)
      .mockResolvedValueOnce({ ...item, status: "pending_review" });
    await expect(
      prepareResortCommand(
        s.request,
        operator,
        item,
        "submit-review",
        signal(),
      ),
    ).rejects.toThrow();
  });
  it("uses bodyless soft delete and explicit empty-object review commands", async () => {
    const s = setup();
    await runResortCommand(s.request, 42, "delete", signal());
    expect(s.mock).toHaveBeenLastCalledWith(
      "/merchant/resorts/42",
      expect.not.objectContaining({ body: expect.anything() }),
    );
    s.mock.mockResolvedValueOnce({ ...item, status: "pending_review" });
    await runResortCommand(s.request, 42, "submit-review", signal());
    expect(s.mock).toHaveBeenLastCalledWith(
      "/merchant/resorts/42/submit-review",
      expect.objectContaining({ method: "PATCH", body: {} }),
    );
  });
  it("does not treat 404 as evidence that a previous deletion succeeded", async () => {
    const s = setup();
    s.mock
      .mockResolvedValueOnce(operator)
      .mockRejectedValueOnce(
        new ApiError("missing", { status: 404, code: 404, traceId: null }),
      );
    expect(
      (
        await reviewResortWrites(
          s.request,
          operator,
          [{ action: "delete", resortId: 42 }],
          signal(),
        )
      )[0],
    ).toContain("不能证明");
  });
  it("does not infer creation failure from an incomplete first-page search", async () => {
    const s = setup();
    const results = await reviewResortWrites(
      s.request,
      operator,
      [{ action: "create", name: "远期雪场" }],
      signal(),
    );
    expect(results[0]).toContain("不证明创建失败");
  });
});
