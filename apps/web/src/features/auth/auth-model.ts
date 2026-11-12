import type { Route } from "next";
import type { components } from "@common/api-contracts/openapi";
import {
  loginInput,
  PublicSessionError,
} from "@/platform/auth/public-session-model";

export type AuthMode = "login" | "register";
export type RegisterInput = components["schemas"]["RegisterUserDto"];

/** Only existing public routes; never accept an origin, prefix, or auth loop. */
export function safeReturnPath(value: unknown): Route {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    /[\\\u0000-\u0020%]/.test(value) ||
    !/^\/(?:$|(?:resorts|knowledge|dynamics)(?:\/[1-9]\d*)?(?:\?[^#]*)?$|me(?:\/new|\/notes\/[1-9]\d*)?(?:\?[^#]*)?$|(?:catalog|about|privacy|terms)$)/.test(
      value,
    )
  )
    return "/";
  return value as Route;
}

export function registrationInput(
  account: unknown,
  password: unknown,
  nickname: unknown,
): RegisterInput {
  const input = loginInput(account, password);
  if (new TextEncoder().encode(input.password).length < 8)
    throw new PublicSessionError("注册密码需要 8–72 个 UTF-8 字节。");
  if (
    typeof nickname !== "string" ||
    !nickname.trim() ||
    [...nickname.trim()].length > 50
  )
    throw new PublicSessionError("昵称需要 1–50 字，不能只有空格。");
  return { ...input, nickname: nickname.trim() };
}

export function validateRegisteredUser(value: unknown, account: string): void {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid registration response");
  const row = value as Record<string, unknown>;
  if (
    typeof row.userId !== "number" ||
    !Number.isInteger(row.userId) ||
    row.userId < 1 ||
    row.userId > 2147483647 ||
    row.account !== account ||
    typeof row.nickname !== "string" ||
    !row.nickname.trim() ||
    row.accessToken !== undefined ||
    row.refreshToken !== undefined
  )
    throw new Error("Invalid registration response");
}
