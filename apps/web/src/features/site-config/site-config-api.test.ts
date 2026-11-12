import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
import { apiRequest } from "@/platform/api";
import {
  readSiteConfig,
  type SiteConfig,
} from "@/features/site-config/site-config-api";
const data: SiteConfig = {
  siteName: "雪客",
  tagline: "滑雪平台",
  about: null,
  contactEmail: null,
  privacyPolicy: null,
  termsOfService: null,
  revision: "a".repeat(64),
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiRequest).mockResolvedValue(data);
});
describe("public config contract reader", () => {
  it("uses the existing public API without rotating credentials", async () => {
    const controller = new AbortController();
    expect(await readSiteConfig(controller.signal)).toEqual(data);
    expect(apiRequest).toHaveBeenCalledWith("/public/config", {
      signal: controller.signal,
      cache: "no-store",
      skipAuthRefresh: true,
    });
  });
  it("accepts Unicode catalog limits and keeps the returned text unchanged", async () => {
    const value = {
      ...data,
      siteName: "雪".repeat(50),
      tagline: "🏂".repeat(200),
      about: "雪".repeat(10000),
      privacyPolicy: "第一行\n" + "雪".repeat(29996),
      termsOfService: "🏂".repeat(30000),
      contactEmail: "ski@example.test",
    };
    vi.mocked(apiRequest).mockResolvedValue(value);
    expect(await readSiteConfig()).toEqual(value);
  });
  it("passes a failed read to the page without automatic retry", async () => {
    vi.mocked(apiRequest).mockRejectedValue(new Error("network"));
    await expect(readSiteConfig()).rejects.toThrow("network");
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
  it.each([
    null,
    [],
    { ...data, siteName: " " },
    { ...data, tagline: 2 },
    { ...data, about: {} },
    { ...data, contactEmail: undefined },
    { ...data, privacyPolicy: [] },
    { ...data, termsOfService: "雪".repeat(30001) },
    { ...data, revision: "not-a-hash" },
  ])("rejects invalid success data %#", async (value) => {
    vi.mocked(apiRequest).mockResolvedValue(value);
    await expect(readSiteConfig()).rejects.toThrow(TypeError);
  });
  it("keeps only the fixed public projection", async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      ...data,
      internalKey: "private",
    });
    expect(await readSiteConfig()).toEqual(data);
  });
  it("does not start an aborted read", async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(readSiteConfig(abort.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it("does not return a late response after cancellation", async () => {
    const abort = new AbortController();
    vi.mocked(apiRequest).mockImplementation(async () => {
      abort.abort();
      return data;
    });
    await expect(readSiteConfig(abort.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
