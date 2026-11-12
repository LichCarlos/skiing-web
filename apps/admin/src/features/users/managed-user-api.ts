import type { components } from "@common/api-contracts/openapi";
import { ApiError } from "@common/api-contracts/client";
import { readAccountTarget } from "@/features/users/user-queries";

export type ManagedUser = components["schemas"]["ManagedUserVO"];

export function getManagedUser(userId: number, signal?: AbortSignal) {
  return readAccountTarget(userId, signal ?? new AbortController().signal);
}

export function managedUserLoadError(error: unknown) {
  const apiError = error instanceof ApiError ? error : null;
  return {
    status: "error" as const,
    title:
      apiError?.status === 401
        ? "登录状态已失效"
        : apiError?.status === 403
          ? "当前账号无权查看账号详情"
          : apiError?.status === 404
            ? "账号不存在或不在可访问范围内"
            : "账号详情暂时不可用",
    traceId: apiError?.traceId ?? null,
  };
}
