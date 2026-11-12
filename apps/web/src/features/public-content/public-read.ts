import { apiRequest } from "@/platform/api";

/** A fresh anonymous read; the timer covers headers and the entire body. */
export async function readAnonymousPublic<T>(
  path: string,
  request: typeof apiRequest = apiRequest,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const value = await request<T>(path, {
      cache: "no-store",
      credentials: "omit",
      skipAuthRefresh: true,
      signal: controller.signal,
    });
    controller.signal.throwIfAborted();
    return value;
  } finally {
    clearTimeout(timeout);
  }
}
