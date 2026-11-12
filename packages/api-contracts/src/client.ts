export interface ApiEnvelope<T> {
  code: number;
  msg: string;
  data: T;
  traceId: string;
}

export interface ApiErrorDetail {
  field?: string;
  code: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: number | null;
  readonly traceId: string | null;
  readonly details: readonly ApiErrorDetail[];

  constructor(
    message: string,
    options: {
      status: number;
      code: number | null;
      traceId: string | null;
      details?: readonly ApiErrorDetail[];
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.traceId = options.traceId;
    this.details = options.details ?? [];
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Public reads can fail without rotating the current browser session. */
  skipAuthRefresh?: boolean;
}

export interface ApiClient {
  request<T>(path: string, options?: ApiRequestOptions): Promise<T>;
}

export interface ApiClientOptions {
  credentials?: RequestCredentials;
  csrfProtection?: boolean;
}

export function createApiClient(
  baseUrl: string,
  clientOptions: ApiClientOptions = {},
): ApiClient {
  const base = parseBaseUrl(baseUrl);
  let csrfToken: string | null = null;
  let csrfRequest: Promise<string> | null = null;
  let refreshRequest: Promise<void> | null = null;

  return {
    request<T>(path: string, options: ApiRequestOptions = {}) {
      return send<T>(path, options);
    },
  };

  async function send<T>(
    path: string,
    options: ApiRequestOptions,
    allowCsrfRetry = true,
    allowAuthRetry = true,
  ): Promise<T> {
    const method = (options.method ?? "GET").toUpperCase();
    const headers = new Headers(options.headers);
    const needsCsrf =
      clientOptions.csrfProtection &&
      !["GET", "HEAD", "OPTIONS"].includes(method) &&
      !isCsrfPath(base, path);
    if (needsCsrf && !headers.has("X-CSRF-Token")) {
      csrfToken ??= await getCsrfToken();
      headers.set("X-CSRF-Token", csrfToken);
    }

    let result: T;
    try {
      result = await request<T>(base, path, {
        ...options,
        headers,
        credentials: options.credentials ?? clientOptions.credentials,
      });
    } catch (error) {
      if (
        allowCsrfRetry &&
        needsCsrf &&
        error instanceof ApiError &&
        error.status === 403 &&
        error.message === "CSRF validation failed"
      ) {
        csrfToken = null;
        headers.delete("X-CSRF-Token");
        return send(path, { ...options, headers }, false, allowAuthRetry);
      }
      if (
        allowAuthRetry &&
        options.skipAuthRefresh !== true &&
        isSessionExpired(error) &&
        !isAuthenticationRoute(base, path)
      ) {
        try {
          await refreshBrowserSession();
        } catch {
          throw error;
        }
        return send(path, { ...options, headers }, allowCsrfRetry, false);
      }
      throw error;
    }
    if (isLogoutPath(base, path)) csrfToken = null;
    return result;
  }

  async function getCsrfToken(): Promise<string> {
    if (!csrfRequest) {
      csrfRequest = request<{ csrfToken: string | null }>(base, "/auth/csrf", {
        method: "GET",
        credentials: clientOptions.credentials,
      })
        .then(({ csrfToken: token }) => {
          if (!token) throw new Error("The API did not issue a CSRF token");
          return token;
        })
        .finally(() => {
          csrfRequest = null;
        });
    }
    return csrfRequest;
  }

  async function refreshBrowserSession(): Promise<void> {
    if (!refreshRequest) {
      refreshRequest = (async () => {
        let token = csrfToken ?? (await getCsrfToken());
        try {
          await request(base, "/auth/refresh", {
            method: "POST",
            body: {},
            credentials: clientOptions.credentials,
            headers: { "X-CSRF-Token": token },
          });
        } catch (error) {
          if (
            !(error instanceof ApiError) ||
            error.status !== 403 ||
            error.message !== "CSRF validation failed"
          ) {
            throw error;
          }
          csrfToken = null;
          token = await getCsrfToken();
          await request(base, "/auth/refresh", {
            method: "POST",
            body: {},
            credentials: clientOptions.credentials,
            headers: { "X-CSRF-Token": token },
          });
        }
      })().finally(() => {
        refreshRequest = null;
      });
    }
    return refreshRequest;
  }
}

async function request<T>(
  baseUrl: URL,
  path: string,
  options: ApiRequestOptions,
): Promise<T> {
  const url = resolveApiUrl(baseUrl, path);
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  const body = serializeBody(options.body, headers);
  const {
    body: _body,
    skipAuthRefresh: _skipAuthRefresh,
    ...requestOptions
  } = options;

  let response: Response;
  try {
    response = await fetch(url, { ...requestOptions, headers, body });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError("Network request failed", {
      status: 0,
      code: null,
      traceId: null,
      cause: error,
    });
  }

  // HTTP 204 is intentionally bodyless; Nest/Express strips any envelope.
  if (response.status === 204) return undefined as T;
  const payload = await readJson(response);
  if (!isApiEnvelope(payload)) {
    throw new ApiError(
      response.ok
        ? "Invalid API response"
        : `Request failed with status ${response.status}`,
      {
        status: response.status,
        code: null,
        traceId: response.headers.get("x-trace-id"),
      },
    );
  }

  const traceId = payload.traceId || response.headers.get("x-trace-id");
  if (!response.ok || payload.code !== response.status) {
    throw new ApiError(payload.msg, {
      status: response.status,
      code: payload.code,
      traceId,
      details: getErrorDetails(payload),
    });
  }

  return payload.data as T;
}

function parseBaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("API base URL must be an absolute HTTP(S) URL");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new TypeError(
      "API base URL must not contain credentials, a query, or a fragment",
    );
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url;
}

function resolveApiUrl(baseUrl: URL, path: string): URL {
  if (/^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith("//")) {
    throw new TypeError("API path must be relative to the configured base URL");
  }
  const url = new URL(path.replace(/^\/+/, ""), baseUrl);
  if (
    url.origin !== baseUrl.origin ||
    !url.pathname.startsWith(baseUrl.pathname)
  ) {
    throw new TypeError(
      "API path must stay within the configured API base URL",
    );
  }
  return url;
}

function isCsrfPath(baseUrl: URL, path: string): boolean {
  return resolveApiUrl(baseUrl, path).pathname.endsWith("/auth/csrf");
}

function isLogoutPath(baseUrl: URL, path: string): boolean {
  return resolveApiUrl(baseUrl, path).pathname.endsWith("/auth/logout");
}

function isAuthenticationRoute(baseUrl: URL, path: string): boolean {
  return /\/auth\/(?:csrf|login|register|refresh|logout)$/.test(
    resolveApiUrl(baseUrl, path).pathname,
  );
}

function isSessionExpired(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 401;
}

function serializeBody(body: unknown, headers: Headers): BodyInit | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string" || isPlatformBody(body)) return body;

  headers.set("Content-Type", "application/json");
  return JSON.stringify(body);
}

function isPlatformBody(value: unknown): value is BodyInit {
  if (typeof value !== "object" || value === null) return false;
  return (
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    (typeof Blob !== "undefined" && value instanceof Blob) ||
    (typeof FormData !== "undefined" && value instanceof FormData) ||
    (typeof URLSearchParams !== "undefined" && value instanceof URLSearchParams)
  );
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isApiEnvelope(value: unknown): value is ApiEnvelope<unknown> {
  if (!value || typeof value !== "object") return false;
  const envelope = value as Partial<ApiEnvelope<unknown>>;
  return (
    Number.isInteger(envelope.code) &&
    typeof envelope.msg === "string" &&
    "data" in envelope &&
    typeof envelope.traceId === "string"
  );
}

function getErrorDetails(value: ApiEnvelope<unknown>): ApiErrorDetail[] {
  if (!("details" in value) || !Array.isArray(value.details)) return [];
  return value.details.filter(isApiErrorDetail);
}

function isApiErrorDetail(value: unknown): value is ApiErrorDetail {
  if (!value || typeof value !== "object") return false;
  const detail = value as Partial<ApiErrorDetail>;
  return (
    typeof detail.code === "string" &&
    typeof detail.message === "string" &&
    (detail.field === undefined || typeof detail.field === "string")
  );
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}
