import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  create: vi.fn(),
  request: vi.fn(),
}));
vi.mock("@/platform/config", () => ({ getApiBaseUrl: mocks.config }));
vi.mock("@common/api-contracts/client", () => ({
  createApiClient: mocks.create,
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.resetModules();
  mocks.config.mockReturnValue("https://admin-api.example/api/v1");
  mocks.create.mockReturnValue({ request: mocks.request });
});
describe("admin API initialization failures", () => {
  it("rejects missing config asynchronously instead of crashing session initialization", async () => {
    mocks.config.mockImplementation(() => {
      throw new Error("missing admin API config");
    });
    const { apiRequest } = await import("@/platform/api");
    let pending!: Promise<unknown>;
    expect(() => {
      pending = apiRequest("/auth/me");
    }).not.toThrow();
    await expect(pending).rejects.toThrow("missing admin API config");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("allows a later retry after client creation failed", async () => {
    mocks.create
      .mockImplementationOnce(() => {
        throw new Error("invalid API URL");
      })
      .mockReturnValue({ request: mocks.request });
    mocks.request.mockResolvedValue({ userId: 7 });
    const { apiRequest } = await import("@/platform/api");
    await expect(apiRequest("/auth/me")).rejects.toThrow("invalid API URL");
    await expect(apiRequest("/auth/me")).resolves.toEqual({ userId: 7 });
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });
  it("retains Cookie/CSRF configuration and all request options", async () => {
    mocks.request.mockResolvedValue({ items: [] });
    const { apiRequest } = await import("@/platform/api");
    const options = {
      signal: new AbortController().signal,
      method: "PATCH",
      body: { value: "文本", expectedVersion: 1 },
    };
    await apiRequest("/admin/config/site.about", options);
    await apiRequest("/auth/me");
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith(
      "https://admin-api.example/api/v1",
      { credentials: "include", csrfProtection: true },
    );
    expect(mocks.request).toHaveBeenCalledWith(
      "/admin/config/site.about",
      options,
    );
  });
});
