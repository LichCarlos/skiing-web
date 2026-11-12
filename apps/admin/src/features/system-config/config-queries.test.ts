import { describe, it, expect, vi } from "vitest";
import {
  readConfigPage,
  readConfigItem,
  prepareConfigSave,
  writeConfig,
  reviewConfigWrites,
  type ConfigRequest,
} from "@/features/system-config/config-queries";
import {
  operator,
  item,
} from "@/features/system-config/config-fixtures.test-helper";
function setup() {
  const mock = vi.fn(async (path: string): Promise<unknown> =>
    path === "/auth/me"
      ? operator
      : {
          items: [item],
          total: 1,
          page: 1,
          pageSize: Number(
            new URLSearchParams(path.split("?")[1]).get("pageSize"),
          ),
          hasNext: false,
        },
  );
  return { mock, request: mock as ConfigRequest };
}
const signal = () => new AbortController().signal;
describe("configuration reads and versioned writes", () => {
  it("verifies identity before no-store directory reads", async () => {
    const s = setup();
    await readConfigPage(
      s.request,
      operator,
      { keyword: "name", page: 1, pageSize: 20 },
      signal(),
    );
    expect(s.mock.mock.calls[0]?.[0]).toBe("/auth/me");
    expect(s.mock.mock.calls[1]).toEqual([
      "/admin/config?page=1&pageSize=20&keyword=name",
      expect.objectContaining({ cache: "no-store" }),
    ]);
    expect(s.mock).toHaveBeenLastCalledWith("/auth/me", expect.anything());
  });
  it("does not read private values after the protected role changes", async () => {
    const s = setup();
    s.mock.mockResolvedValueOnce({
      ...operator,
      roles: [{ roleKey: "custom", roleName: "运营" }],
    });
    await expect(
      readConfigItem(s.request, operator, item.configKey, signal()),
    ).rejects.toThrow("身份");
    expect(s.mock).toHaveBeenCalledTimes(1);
  });
  it("resolves a key from the existing list contract, without inventing a detail endpoint", async () => {
    const s = setup();
    expect(
      await readConfigItem(s.request, operator, "site.name", signal()),
    ).toEqual(item);
    expect(s.mock.mock.calls[1]).toEqual([
      "/admin/config?page=1&pageSize=100&keyword=site.name",
      expect.objectContaining({ cache: "no-store" }),
    ]);
  });
  it.each([
    { items: [], hasNext: false },
    { items: [{ ...item, configKey: "site.about" }], hasNext: false },
    { items: [item, item], hasNext: false },
    { items: [item], hasNext: true },
  ])(
    "fails closed for an incomplete or mismatched catalog %j",
    async (page) => {
      const s = setup();
      s.mock.mockResolvedValueOnce(operator).mockResolvedValueOnce(page);
      await expect(
        readConfigItem(s.request, operator, "site.name", signal()),
      ).rejects.toThrow("不完整");
    },
  );
  it("does not read an unknown configuration key", async () => {
    const s = setup();
    await expect(
      readConfigItem(s.request, operator, "private.secret", signal()),
    ).rejects.toThrow();
    expect(s.mock).not.toHaveBeenCalled();
  });
  it("suppresses a successful response delivered after cancellation", async () => {
    const s = setup(),
      controller = new AbortController();
    s.mock.mockImplementationOnce(async () => {
      controller.abort();
      return operator;
    });
    await expect(
      readConfigItem(s.request, operator, "site.name", controller.signal),
    ).rejects.toThrow();
    expect(s.mock).toHaveBeenCalledTimes(1);
  });
  it.each([
    { ...item, version: 8 },
    { ...item, value: "已修改" },
    { ...item, maxLength: 51 },
  ])(
    "refuses changed content, metadata or version rather than rebasing %j",
    async (current) => {
      const s = setup();
      s.mock.mockResolvedValueOnce(operator).mockResolvedValueOnce({
        items: [current],
        page: 1,
        pageSize: 100,
        total: 1,
        hasNext: false,
      });
      await expect(
        prepareConfigSave(s.request, operator, item, "新值", signal()),
      ).rejects.toThrow(/已变化|不完整/);
    },
  );
  it("keeps the original expectedVersion and sends exactly two DTO fields", async () => {
    const s = setup(),
      body = await prepareConfigSave(
        s.request,
        operator,
        item,
        " 新值 ",
        signal(),
      );
    expect(body).toEqual({ value: "新值", expectedVersion: 7 });
    s.mock.mockResolvedValueOnce({ ...item, value: "新值", version: 8 });
    await writeConfig(s.request, item, body, signal());
    expect(s.mock).toHaveBeenLastCalledWith(
      "/admin/config/site.name",
      expect.objectContaining({ method: "PATCH", body }),
    );
  });
  it("refuses a mismatched original version before writing", async () => {
    const s = setup();
    await expect(
      writeConfig(
        s.request,
        item,
        { value: "值", expectedVersion: 8 },
        signal(),
      ),
    ).rejects.toThrow();
    expect(s.mock).not.toHaveBeenCalled();
  });
  it.each([
    { ...item, configKey: "site.about" },
    { ...item, version: 7 },
    { ...item, version: 8, value: "其他值" },
  ])("does not accept a mismatched save receipt %j", async (saved) => {
    const s = setup();
    s.mock.mockResolvedValueOnce(saved);
    await expect(
      writeConfig(
        s.request,
        item,
        { value: "新值", expectedVersion: 7 },
        signal(),
      ),
    ).rejects.toThrow("不匹配");
  });
  it("reviews current versions without putting policy bodies in recovery summaries", async () => {
    const s = setup();
    const result = await reviewConfigWrites(
      s.request,
      operator,
      [{ configKey: "site.name" }],
      signal(),
    );
    expect(result[0]).toContain("版本 7");
    expect(result[0]).not.toContain(item.value);
    expect(result[0]).toContain("当前正文");
  });
});
