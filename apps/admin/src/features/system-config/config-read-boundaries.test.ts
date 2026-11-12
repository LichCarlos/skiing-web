import { expect, it, vi } from "vitest";
import {
  parseConfigItem,
  parseConfigPage,
} from "@/features/system-config/config-responses";
import {
  readConfigPage,
  writeConfig,
  type ConfigRequest,
} from "@/features/system-config/config-queries";
import {
  ConfigWriteGate,
  ConfigRecoveryLedger,
} from "@/features/system-config/config-workflow";
import {
  operator,
  item,
  deferred,
} from "@/features/system-config/config-fixtures.test-helper";
const query = { keyword: "", page: 1, pageSize: 20 },
  page = { items: [item], total: 1, page: 1, pageSize: 20, hasNext: false };
const signal = () => new AbortController().signal;
function request(value: unknown) {
  return vi.fn(async (path: string) =>
    path === "/auth/me" ? operator : value,
  ) as ReturnType<typeof vi.fn<ConfigRequest>> & ConfigRequest;
}
it("projects complete configuration responses and copies entries", () => {
  const source = { ...item, internal: "private" },
    value = parseConfigPage({ ...page, items: [source] }, query);
  expect(value).toEqual(page);
  expect(value.items[0]).not.toBe(source);
  source.value = "changed";
  expect(value.items[0]!.value).toBe(item.value);
});
it.each([
  null,
  {},
  { ...item, configKey: "private.secret" },
  { ...item, label: 1 },
  { ...item, valueType: "json" },
  { ...item, maxLength: 51 },
  { ...item, value: "" },
  { ...item, value: "😀".repeat(51) },
  { ...item, defaultValue: 7 },
  { ...item, version: -1 },
  { ...item, version: 2147483648 },
  { ...item, updatedAt: "yesterday" },
  { ...item, updatedByUserId: 0 },
  { ...item, updatedByUserId: "1" },
])("rejects malformed full configuration metadata", (value) =>
  expect(() => parseConfigItem(value)).toThrow(),
);
it("accepts nullable defaults and nullable history under the existing VO", () => {
  expect(
    parseConfigItem({
      ...item,
      configKey: "site.about",
      maxLength: 10000,
      value: null,
      defaultValue: null,
      version: 0,
      updatedAt: null,
      updatedByUserId: null,
    }),
  ).toMatchObject({ value: null, version: 0 });
});
it.each([
  { ...page, total: 7 },
  { ...page, page: 2 },
  { ...page, pageSize: 100 },
  { ...page, hasNext: true },
  { ...page, items: [item, item], total: 2 },
  { ...page, total: 2 },
])("rejects inconsistent catalog counts and duplicate keys", (value) =>
  expect(() => parseConfigPage(value, query)).toThrow(),
);
it("checks key/name filters and later empty pages", () => {
  expect(() =>
    parseConfigPage(page, { ...query, keyword: "unmatched" }),
  ).toThrow();
  expect(parseConfigPage(page, { ...query, keyword: "SITE.NAME" })).toEqual(
    page,
  );
  expect(
    parseConfigPage({ ...page, page: 2, items: [] }, { ...query, page: 2 }),
  ).toMatchObject({ items: [], total: 1 });
});
it.each(["account", "merchant", "grant"])(
  "rejects actual identity changes after reading (%s)",
  async (kind) => {
    const changed =
      kind === "account"
        ? { ...operator, account: "changed" }
        : kind === "merchant"
          ? { ...operator, merchant: { merchantId: 5, businessName: "新关联" } }
          : {
              ...operator,
              permissionKeys: operator.permissionKeys.filter(
                (key) => key !== "system:config:list",
              ),
            };
    let reads = 0;
    const read = vi.fn(async (path: string) =>
      path === "/auth/me" ? (++reads === 1 ? operator : changed) : page,
    ) as ConfigRequest;
    await expect(
      readConfigPage(read, operator, query, signal()),
    ).rejects.toThrow("身份");
  },
);
it("rejects invalid local identity without requesting private state", async () => {
  const read = request(page);
  await expect(
    readConfigPage(read, { ...operator, permissionKeys: [] }, query, signal()),
  ).rejects.toThrow();
  expect(read).not.toHaveBeenCalled();
});
it.each([{}, { ...item, value: "新值", version: 8, updatedAt: "invalid" }])(
  "keeps malformed successful save receipts unknown",
  async (value) => {
    const read = request(value),
      ledger = new ConfigRecoveryLedger(),
      done = vi.fn();
    const gate = new ConfigWriteGate(
      operator,
      async () => operator,
      ledger,
      vi.fn(),
    );
    gate.activate();
    expect(
      await gate.run(
        { configKey: item.configKey },
        async () => ({ value: "新值", expectedVersion: 7 }),
        (body) => writeConfig(read, item, body, signal()),
        done,
      ),
    ).toMatchObject({ status: "error", uncertain: true });
    expect(ledger.entries(operator.userId)).toHaveLength(1);
    expect(done).not.toHaveBeenCalled();
  },
);
it("arbitrates two independently prepared gates immediately before sending", async () => {
  const ledger = new ConfigRecoveryLedger(),
    prepared = deferred<string>(),
    pending = deferred<void>(),
    write = vi.fn(() => pending.promise);
  const create = () => {
    const gate = new ConfigWriteGate(
      operator,
      async () => operator,
      ledger,
      vi.fn(),
    );
    gate.activate();
    return gate;
  };
  const first = create(),
    second = create(),
    mutation = { configKey: item.configKey };
  const before = first.run(mutation, () => prepared.promise, write, vi.fn());
  const after = second.run(mutation, async () => "body", write, vi.fn());
  await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
  prepared.resolve("body");
  expect(await before).toEqual({ status: "ignored" });
  expect(write).toHaveBeenCalledOnce();
  pending.resolve();
  expect(await after).toEqual({ status: "success" });
});
it("checks local write permission before preparing a form", async () => {
  const prepare = vi.fn(async () => "body"),
    gate = new ConfigWriteGate(
      {
        ...operator,
        permissionKeys: operator.permissionKeys.filter(
          (key) => key !== "system:config:update",
        ),
      },
      async () => operator,
      new ConfigRecoveryLedger(),
      vi.fn(),
    );
  gate.activate();
  expect(
    await gate.run({ configKey: item.configKey }, prepare, vi.fn(), vi.fn()),
  ).toMatchObject({ status: "error", uncertain: false });
  expect(prepare).not.toHaveBeenCalled();
});
