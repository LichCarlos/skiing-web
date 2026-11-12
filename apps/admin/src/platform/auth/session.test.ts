import { beforeEach, describe, it, expect, vi } from "vitest";
import { ApiError } from "@common/api-contracts/client";
vi.mock("@/platform/api", () => ({ apiRequest: vi.fn() }));
import { apiRequest } from "@/platform/api";
import {
  getCurrentUser,
  restoreSession,
  login,
  logout,
} from "@/platform/auth/session";
import { user, auth } from "@/platform/auth/session-fixtures.test-helper";
beforeEach(() => vi.mocked(apiRequest).mockReset());
describe("admin session transport", () => {
  it("preserves 403 without rotating or using refresh to bypass denial", async () => {
    const error = new ApiError("forbidden", {
      status: 403,
      code: 403,
      traceId: null,
    });
    vi.mocked(apiRequest)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(auth);
    await expect(restoreSession()).rejects.toBe(error);
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
  it("uses cancellable no-store identity reads", async () => {
    vi.mocked(apiRequest).mockResolvedValue(user);
    const controller = new AbortController();
    await expect(getCurrentUser(controller.signal)).resolves.toEqual(user);
    expect(apiRequest).toHaveBeenCalledWith("/auth/me", {
      signal: controller.signal,
      cache: "no-store",
    });
  });
  it("normalizes login account and re-reads current Cookie identity", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(auth)
      .mockResolvedValueOnce({ ...user, userId: 8 });
    await expect(
      login({ account: " Operator ", password: " password " }),
    ).resolves.toMatchObject({ userId: 8 });
    expect(apiRequest).toHaveBeenNthCalledWith(1, "/auth/login", {
      method: "POST",
      body: { account: "operator", password: " password " },
    });
    expect(apiRequest).toHaveBeenNthCalledWith(
      2,
      "/auth/me",
      expect.objectContaining({ cache: "no-store" }),
    );
  });
  it("rejects logout acknowledgement that does not confirm success", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ loggedOut: false });
    await expect(logout()).rejects.toThrow();
  });
  it("rejects native tokens in a browser response", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({
      ...auth,
      accessToken: "native-secret",
    });
    await expect(
      login({ account: "operator", password: "password" }),
    ).rejects.toThrow("会话响应异常");
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
  it("keeps login unknown if current identity verification fails after success", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(auth)
      .mockRejectedValueOnce(
        new ApiError("denied", { status: 403, code: 403, traceId: null }),
      );
    await expect(
      login({ account: "operator", password: "password" }),
    ).rejects.toThrow("尚未确认");
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });
});
