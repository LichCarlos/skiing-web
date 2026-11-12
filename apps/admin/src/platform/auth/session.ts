import { apiRequest } from "@/platform/api";
import {
  loginInput,
  parseCurrentUser,
  validateSessionResponse,
  validateLogout,
  SessionOutcomeUnknown,
  type CurrentUser,
} from "@/platform/auth/session-model";

export async function login(input: {
  account: string;
  password: string;
}): Promise<CurrentUser> {
  const body = loginInput(input);
  const session = await apiRequest<unknown>("/auth/login", {
    method: "POST",
    body,
  });
  validateSessionResponse(session, body.account);
  try {
    return await getCurrentUser();
  } catch {
    throw new SessionOutcomeUnknown(
      "登录响应已返回，但当前会话尚未确认。请检查会话，勿重复提交。",
    );
  }
}
export async function getCurrentUser(
  signal?: AbortSignal,
): Promise<CurrentUser> {
  return parseCurrentUser(
    await apiRequest<unknown>("/auth/me", { signal, cache: "no-store" }),
  );
}
export function restoreSession(signal?: AbortSignal): Promise<CurrentUser> {
  // The HTTP client handles final 401/refresh. A 403 is an authorization denial.
  return getCurrentUser(signal);
}
export async function logout(): Promise<void> {
  validateLogout(
    await apiRequest<unknown>("/auth/logout", { method: "POST", body: {} }),
  );
}
