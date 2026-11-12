import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient } from "./client.js";

afterEach(() => vi.unstubAllGlobals());

describe("createApiClient", () => {
  it("does not rotate a session for an explicitly public read and keeps the option out of fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 401,
          msg: "Unauthorized",
          data: null,
          traceId: "public-read",
        }),
        { status: 401 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createApiClient("http://localhost:8080/api/v1", {
      credentials: "include",
      csrfProtection: true,
    });
    await expect(
      client.request("/public/config", { skipAuthRefresh: true }),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(options).not.toHaveProperty("skipAuthRefresh");
  });
  it("accepts a bodyless 204 once without treating a committed command as unknown", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      createApiClient("http://localhost:8080/api/v1").request<void>(
        "/admin/users/17/password",
        {
          method: "PATCH",
          body: { newPassword: "synthetic-password", reason: "test" },
        },
      ),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("continues to reject an empty 200 response rather than guessing a command result", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      createApiClient("http://localhost:8080/api/v1").request(
        "/admin/users/17",
      ),
    ).rejects.toMatchObject({ status: 200, message: "Invalid API response" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("unwraps successful envelopes and serializes JSON requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 201,
          msg: "success",
          data: { id: 17 },
          traceId: "trace-created",
        }),
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createApiClient("http://localhost:8080/api/v1");

    await expect(
      client.request<{ id: number }>("/resorts", {
        method: "POST",
        body: { name: "North Ridge" },
      }),
    ).resolves.toEqual({ id: 17 });

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const headers = new Headers(init.headers);
    expect(url).toEqual(new URL("http://localhost:8080/api/v1/resorts"));
    expect(init.body).toBe(JSON.stringify({ name: "North Ridge" }));
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("preserves field validation details and trace IDs from the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 400,
            msg: "Request validation failed",
            data: null,
            traceId: "trace-validation",
            details: [
              {
                field: "profile.nickname",
                code: "VALIDATION_ERROR",
                message: "nickname must be a string",
              },
            ],
          }),
          { status: 400 },
        ),
      ),
    );
    const client = createApiClient("http://localhost:8080/api/v1");

    await expect(client.request("/account/profile")).rejects.toMatchObject({
      name: "ApiError",
      status: 400,
      code: 400,
      traceId: "trace-validation",
      details: [
        {
          field: "profile.nickname",
          code: "VALIDATION_ERROR",
          message: "nickname must be a string",
        },
      ],
    });
  });

  it("falls back to the response trace header for malformed error bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("not-json", {
          status: 502,
          headers: { "x-trace-id": "trace-gateway" },
        }),
      ),
    );
    const client = createApiClient("http://localhost:8080/api/v1");

    await expect(client.request("/health")).rejects.toMatchObject({
      name: "ApiError",
      status: 502,
      code: null,
      traceId: "trace-gateway",
      message: "Request failed with status 502",
    });
  });

  it.each([
    "https://example.com/api/v1/health",
    "//example.com/api/v1/health",
    "../admin/users",
    "%2e%2e/admin/users",
  ])("rejects API paths outside the configured base: %s", async (path) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const client = createApiClient("http://localhost:8080/api/v1");

    await expect(client.request(path)).rejects.toBeInstanceOf(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a response whose envelope status disagrees with HTTP", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 200,
            msg: "success",
            data: {},
            traceId: "t",
          }),
          { status: 201 },
        ),
      ),
    );
    const client = createApiClient("http://localhost:8080/api/v1");

    await expect(client.request("/health")).rejects.toBeInstanceOf(ApiError);
  });

  it("validates API base URLs before issuing requests", () => {
    expect(() => createApiClient("javascript:alert(1)")).toThrow(
      "API base URL must not contain credentials, a query, or a fragment",
    );
    expect(() => createApiClient("https://user:pass@example.com/api")).toThrow(
      "API base URL must not contain credentials, a query, or a fragment",
    );
  });

  it("bootstraps CSRF and uses credentialed requests for browser writes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            msg: "success",
            data: { csrfToken: "csrf-value" },
            traceId: "csrf-trace",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            msg: "success",
            data: { ok: true },
            traceId: "write-trace",
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = createApiClient("http://localhost:8080/api/v1", {
      credentials: "include",
      csrfProtection: true,
    });

    await expect(
      client.request<{ ok: boolean }>("/auth/login", {
        method: "POST",
        body: { account: "rider" },
      }),
    ).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [csrfUrl, csrfInit] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const [loginUrl, loginInit] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(csrfUrl.pathname).toBe("/api/v1/auth/csrf");
    expect(csrfInit.credentials).toBe("include");
    expect(loginUrl.pathname).toBe("/api/v1/auth/login");
    expect(loginInit.credentials).toBe("include");
    expect(new Headers(loginInit.headers).get("x-csrf-token")).toBe(
      "csrf-value",
    );
  });

  it("drops cached CSRF state after logout", async () => {
    let csrfCount = 0;
    const fetchMock = vi.fn(
      async (input: URL | RequestInfo, _init?: RequestInit) => {
        const url = new URL(String(input));
        const isCsrf = url.pathname.endsWith("/auth/csrf");
        return new Response(
          JSON.stringify({
            code: 200,
            msg: "success",
            data: isCsrf ? { csrfToken: `csrf-${++csrfCount}` } : { ok: true },
            traceId: "trace",
          }),
          { status: 200 },
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createApiClient("http://localhost:8080/api/v1", {
      csrfProtection: true,
    });

    await client.request("/auth/logout", { method: "POST" });
    await client.request("/auth/login", { method: "POST" });

    expect(csrfCount).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(
      new Headers((fetchMock.mock.calls[3]?.[1] as RequestInit).headers).get(
        "x-csrf-token",
      ),
    ).toBe("csrf-2");
  });

  it("refreshes the HttpOnly cookie session once and retries a protected read", async () => {
    const envelope = (code: number, data: unknown) =>
      new Response(
        JSON.stringify({
          code,
          msg: code === 401 ? "Unauthorized" : "success",
          data,
          traceId: `trace-${code}`,
        }),
        { status: code },
      );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(envelope(401, null))
      .mockResolvedValueOnce(envelope(200, { csrfToken: "csrf-for-refresh" }))
      .mockResolvedValueOnce(
        envelope(200, {
          accessTokenExpiresAt: "2026-10-27T00:15:00.000Z",
          currentUser: {},
        }),
      )
      .mockResolvedValueOnce(envelope(200, { resorts: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createApiClient("http://localhost:8080/api/v1", {
      credentials: "include",
      csrfProtection: true,
    });

    await expect(
      client.request<{ resorts: unknown[] }>("/resorts"),
    ).resolves.toEqual({ resorts: [] });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const refreshInit = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect(refreshInit.method).toBe("POST");
    expect(refreshInit.credentials).toBe("include");
    expect(new Headers(refreshInit.headers).get("x-csrf-token")).toBe(
      "csrf-for-refresh",
    );
    const retriedRead = fetchMock.mock.calls[3]?.[1] as RequestInit;
    expect(retriedRead.credentials).toBe("include");
  });
});
