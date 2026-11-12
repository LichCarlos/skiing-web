import { describe, expect, it } from "vitest";
import {
  safeReturnPath,
  registrationInput,
  validateRegisteredUser,
} from "@/features/auth/auth-model";

describe("public auth form boundary", () => {
  it.each([
    "/",
    "/knowledge",
    "/knowledge/12",
    "/resorts/2",
    "/dynamics",
    "/dynamics/1",
    "/about",
    "/resorts?sortBy=rating",
    "/me",
    "/me/new",
    "/me/notes/12",
    "/me?tab=favorites&type=dynamic",
  ])("allows existing public return route %s", (path) =>
    expect(safeReturnPath(path)).toBe(path),
  );
  it.each([
    undefined,
    null,
    [],
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/login",
    "/snow-admin",
    "/resorts/0",
    "/resorts/-1",
    "/resorts/2/../login",
    "/%2f%2fevil.example",
    "/knowledge\n//evil.example",
    "/unknown",
    "/knowledge#x",
    "/knowledge?x=%0d",
  ])("rejects non-public or dangerous return paths %s", (path) =>
    expect(safeReturnPath(path)).toBe("/"),
  );
  it("normalizes account/nickname without trimming the password", () =>
    expect(registrationInput(" Snow.User ", " pass1234 ", " 雪友 ")).toEqual({
      account: "snow.user",
      password: " pass1234 ",
      nickname: "雪友",
    }));
  it.each(["short", "中中", "x".repeat(73), "中".repeat(25)])(
    "enforces UTF-8 password bytes",
    (password) =>
      expect(() => registrationInput("snow", password, "雪友")).toThrow(),
  );
  it.each([null, "", "  ", "雪".repeat(51)])(
    "requires a non-empty nickname",
    (nickname) =>
      expect(() => registrationInput("snow", "password8", nickname)).toThrow(),
  );
  it("checks registration response identity and prohibits browser tokens", () => {
    expect(() =>
      validateRegisteredUser(
        { userId: 1, account: "snow", nickname: "雪" },
        "snow",
      ),
    ).not.toThrow();
    for (const patch of [
      { userId: 0 },
      { userId: 1.5 },
      { account: "other" },
      { nickname: " " },
      { accessToken: "secret" },
      { refreshToken: "secret" },
    ])
      expect(() =>
        validateRegisteredUser(
          { userId: 1, account: "snow", nickname: "雪", ...patch },
          "snow",
        ),
      ).toThrow();
  });
});
