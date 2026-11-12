import { it, expect, vi } from "vitest";
import {
  readResort,
  readResortPage,
  type ResortRequest,
} from "@/features/merchant-resorts/resort-queries";
import {
  item,
  operator,
} from "@/features/merchant-resorts/resort-fixtures.test-helper";
import {
  parseMerchantResort,
  parseMerchantResortPage,
  parseResortSchema,
} from "@/features/merchant-resorts/resort-responses";
import {
  ResortRecoveryLedger,
  ResortWriteGate,
} from "@/features/merchant-resorts/resort-workflow";
import {
  readResortForm,
  saveResort,
  runResortCommand,
} from "@/features/merchant-resorts/resort-queries";
import { initialResortInput } from "@/features/merchant-resorts/resort-model";
import {
  deferred,
  schema,
  resortDictionary,
} from "@/features/merchant-resorts/resort-fixtures.test-helper";

const signal = () => new AbortController().signal;
it.each([
  { name: "price", patch: { price: -1 } },
  { name: "rating", patch: { rating: "5.1" } },
  { name: "coordinate", patch: { latitude: "91" } },
  { name: "status", patch: { status: "hidden" } },
  { name: "array status", patch: { status: ["draft"] } },
  { name: "array open status", patch: { openStatus: ["open"] } },
  {
    name: "gallery",
    patch: {
      gallery: [{ assetId: "0", sortOrder: 0, url: "https://example.com/x" }],
    },
  },
  { name: "asset", patch: { coverAssetId: "9223372036854775808" } },
  { name: "URL", patch: { coverUrl: "javascript:alert(1)" } },
  { name: "time", patch: { updatedAt: "not-a-date" } },
  { name: "tags", patch: { fitTags: ["same", "same"] } },
  { name: "JSON", patch: { customFields: { bad: Infinity } } },
])(
  "rejects malformed $name before publishing a merchant detail",
  async ({ patch }) => {
    const request = vi.fn(async (path: string) =>
      path === "/auth/me" ? operator : { ...item, ...patch },
    ) as ResortRequest;
    await expect(
      readResort(request, operator, item.resortId, signal()),
    ).rejects.toThrow();
  },
);
it("projects the declared detail fields and copies nested business values", async () => {
  const source = {
    ...item,
    privateContact: "hidden",
    customFields: { enabled: false, zero: 0 },
  };
  const request = vi.fn(async (path: string) =>
    path === "/auth/me" ? operator : source,
  ) as ResortRequest;
  const result = await readResort(request, operator, item.resortId, signal());
  expect(result).not.toHaveProperty("privateContact");
  expect(result.customFields).toEqual({ enabled: false, zero: 0 });
  expect(result.customFields).not.toBe(source.customFields);
});
it.each(["list", "detail"])(
  "rejects real permission changes at the end of a %s read",
  async (kind) => {
    let auth = 0;
    const request = vi.fn(async (path: string) =>
      path === "/auth/me"
        ? ++auth === 1
          ? operator
          : { ...operator, permissionKeys: [] }
        : kind === "list"
          ? { items: [item], total: 1, page: 1, pageSize: 20, hasNext: false }
          : item,
    ) as ResortRequest;
    await expect(
      kind === "list"
        ? readResortPage(request, operator, 1, undefined, signal())
        : readResort(request, operator, item.resortId, signal()),
    ).rejects.toThrow();
  },
);
it("rejects inconsistent pagination before publishing a merchant list", async () => {
  const request = vi.fn(async (path: string) =>
    path === "/auth/me"
      ? operator
      : { items: [item], total: 0, page: 1, pageSize: 20, hasNext: true },
  ) as ResortRequest;
  await expect(
    readResortPage(request, operator, 1, undefined, signal()),
  ).rejects.toThrow();
});
it.each([
  {
    groups: [
      {
        fields: [
          {
            fieldKey: "x",
            label: "x",
            dataType: "integer",
            canRead: false,
            canWrite: false,
          },
        ],
      },
    ],
  },
  {
    groups: [
      {
        groupKey: "a",
        fields: [
          {
            fieldKey: "x",
            groupKey: "b",
            label: "x",
            dataType: "integer",
            canRead: true,
            canWrite: false,
          },
        ],
      },
    ],
  },
  {
    groups: [
      {
        fields: [
          {
            fieldKey: "x",
            label: "x",
            dataType: "integer",
            canRead: true,
            canWrite: false,
            defaultValue: Infinity,
          },
        ],
      },
    ],
  },
  { groups: [{ groupKey: "a" }, { groupKey: "a" }] },
  {
    groups: [
      {
        fields: [
          {
            fieldKey: "x",
            label: "x",
            dataType: "unknown",
            canRead: true,
            canWrite: false,
          },
        ],
      },
    ],
  },
  { entityType: "article", groups: [] },
])("rejects malformed effective field directories: %j", (value) => {
  expect(() =>
    parseResortSchema({ entityType: "ski_resort", ...value }),
  ).toThrow();
});
it.each([false, 0, "", null, [false, { nested: null }]])(
  "preserves optional JSON defaults without manufacturing field metadata: %j",
  (value) => {
    const result = parseResortSchema({
      entityType: "ski_resort",
      groups: [
        {
          fields: [
            {
              fieldKey: "flag",
              label: "Flag",
              dataType: "boolean",
              canRead: true,
              canWrite: true,
              defaultValue: value,
              internal: "hidden",
            },
          ],
        },
      ],
    });
    expect(result.groups[0]!.fields![0]!.defaultValue).toEqual(value);
    expect(result.groups[0]!.fields![0]).not.toHaveProperty("internal");
    expect(result.groups[0]).not.toHaveProperty("groupKey");
  },
);
it.each([
  undefined,
  new Date(),
  Object.assign([], { length: 1 }),
  { bad: undefined },
])("rejects non JSON business field values: %j", (value) => {
  expect(() =>
    parseMerchantResort({ ...item, customFields: { value } }),
  ).toThrow();
});
it("accepts a later empty page and refuses mismatched status or duplicated records", () => {
  expect(
    parseMerchantResortPage(
      { items: [], page: 2, pageSize: 20, total: 1, hasNext: false },
      2,
    ).items,
  ).toEqual([]);
  expect(() =>
    parseMerchantResortPage(
      { items: [item], page: 1, pageSize: 20, total: 1, hasNext: false },
      1,
      "published",
    ),
  ).toThrow();
  expect(() =>
    parseMerchantResortPage(
      { items: [item, item], page: 1, pageSize: 20, total: 2, hasNext: false },
      1,
    ),
  ).toThrow();
});
it("validates local identity before issuing private form requests", async () => {
  const request = vi.fn() as ResortRequest;
  await expect(
    readResortForm(
      request,
      { ...operator, account: undefined } as never,
      undefined,
      signal(),
    ),
  ).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});
it("refuses a disabled or mismatched form dictionary", async () => {
  for (const dict of [
    { ...resortDictionary(), status: "disabled" },
    resortDictionary("other.type"),
  ]) {
    const request = vi.fn(async (path: string) =>
      path === "/auth/me"
        ? operator
        : path.includes("custom-fields")
          ? schema
          : dict,
    ) as ResortRequest;
    await expect(
      readResortForm(request, operator, undefined, signal()),
    ).rejects.toThrow();
  }
});
it("keeps malformed successful save receipts as unknown writes in the existing ledger", async () => {
  const ledger = new ResortRecoveryLedger(),
    gate = new ResortWriteGate(operator, async () => operator, ledger, vi.fn());
  gate.activate();
  const request = vi.fn(async () => ({
    ...item,
    gallery: [{ secret: "bad" }],
  })) as ResortRequest;
  expect(
    await gate.run(
      { action: "update", resortId: 42 },
      async () => initialResortInput(item, schema),
      (body, signal) => saveResort(request, 42, body, signal),
      vi.fn(),
    ),
  ).toMatchObject({ status: "error", uncertain: true });
  expect(ledger.entries(operator.userId)).toMatchObject([{ inFlight: false }]);
  expect(gate.isLocked()).toBe(true);
});
it("rejects a success review receipt for the wrong state or target", async () => {
  for (const value of [
    item,
    { ...item, resortId: 43, status: "pending_review" },
  ]) {
    await expect(
      runResortCommand(
        vi.fn(async () => value) as ResortRequest,
        42,
        "submit-review",
        signal(),
      ),
    ).rejects.toThrow();
  }
});
it("arbitrates concurrent preparations from separate mounted write gates", async () => {
  const ledger = new ResortRecoveryLedger(),
    release = deferred<void>(),
    pending = deferred<void>(),
    entered = deferred<void>(),
    write = vi.fn(async () => {
      entered.resolve();
      await pending.promise;
    });
  const gates = [1, 2].map(
    () =>
      new ResortWriteGate(
        operator,
        async () => {
          await release.promise;
          return operator;
        },
        ledger,
        vi.fn(),
      ),
  );
  gates.forEach((gate) => gate.activate());
  const tasks = gates.map((gate) =>
    gate.run(
      { action: "delete", resortId: 42 },
      async () => 42,
      write,
      vi.fn(),
    ),
  );
  release.resolve();
  await entered.promise;
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(write).toHaveBeenCalledTimes(1);
  expect(ledger.entries(operator.userId)).toHaveLength(1);
  pending.resolve();
  const results = await Promise.all(tasks);
  expect(results.map((result) => result.status).sort()).toEqual([
    "ignored",
    "success",
  ]);
});
