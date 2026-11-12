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
  mocks.config.mockReturnValue("https://public-api.example/api/v1");
  mocks.create.mockReturnValue({ request: mocks.request });
});
describe("website API initialization failures", () => {
  it("returns a rejected promise for missing deployment config so effects can render their error states", async () => {
    mocks.config.mockImplementation(() => {
      throw new Error("missing API config");
    });
    const { apiRequest } = await import("@/platform/api");
    let pending!: Promise<unknown>;
    expect(() => {
      pending = apiRequest("/public/config");
    }).not.toThrow();
    await expect(pending).rejects.toThrow("missing API config");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("does not cache a failed client construction and permits an explicit retry", async () => {
    mocks.create
      .mockImplementationOnce(() => {
        throw new Error("invalid API URL");
      })
      .mockReturnValue({ request: mocks.request });
    mocks.request.mockResolvedValue({ siteName: "凛迹雪客" });
    const { apiRequest } = await import("@/platform/api");
    await expect(apiRequest("/public/config")).rejects.toThrow(
      "invalid API URL",
    );
    await expect(apiRequest("/public/config")).resolves.toEqual({
      siteName: "凛迹雪客",
    });
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });
  it("retains cookies/CSRF and the caller's cancellation/no-store options", async () => {
    mocks.request.mockResolvedValue({ items: [] });
    const { apiRequest } = await import("@/platform/api");
    const options = {
      cache: "no-store" as const,
      signal: new AbortController().signal,
    };
    await apiRequest("/resorts", options);
    await apiRequest("/public/config");
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith(
      "https://public-api.example/api/v1",
      { credentials: "include", csrfProtection: true },
    );
    expect(mocks.request).toHaveBeenCalledWith("/resorts", options);
  });
});
