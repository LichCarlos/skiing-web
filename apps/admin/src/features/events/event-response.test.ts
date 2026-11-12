import { describe, expect, it } from "vitest";
import {
  parseEventPage,
  parseOutboxEvent,
} from "@/features/events/event-response";
import { item, eventPage } from "@/features/events/event-fixtures.test-helper";

describe("Outbox response whitelist", () => {
  it("projects exactly the approved metadata from history containing private extras", () => {
    const input = {
      ...item,
      payload: { password: "private" },
      lastError: "private-provider",
      lockToken: "private-token",
    };
    expect(parseOutboxEvent(input)).toEqual(item);
    const result = parseEventPage(
      { ...eventPage([input]), internal: "private" },
      1,
      100,
    );
    expect(result).toEqual(eventPage());
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it.each([
    ["eventId", "../retry"],
    ["eventId", null],
    ["eventType", 3],
    ["aggregateType", []],
    ["aggregateId", {}],
    ["eventType", "x".repeat(201)],
    ["aggregateId", "x".repeat(101)],
    ["status", "unknown"],
    ["status", ["failed"]],
    ["attempts", -1],
    ["attempts", 1.5],
    ["attempts", "8"],
    ["attempts", 2147483648],
    ["maxAttempts", 0],
    ["createdAt", "invalid"],
    ["occurredAt", 2],
    ["availableAt", "2026-11-01T00:00:00Z"],
    ["lockedAt", undefined],
    ["publishedAt", {}],
  ])("rejects malformed %s=%j", (key, value) => {
    expect(() => parseOutboxEvent({ ...item, [key as string]: value })).toThrow(
      "响应",
    );
  });
  it.each([null, [], "private"])("rejects non-object %j", (value) => {
    expect(() => parseOutboxEvent(value)).toThrow();
  });
  it.each([
    { page: 2 },
    { pageSize: 20 },
    { total: -1 },
    { total: Number.MAX_SAFE_INTEGER + 1 },
    { hasNext: true },
    { hasNext: "false" },
    { items: [] },
    { items: [item, item], total: 2 },
    { total: 101 },
  ])("rejects incomplete or mismatched pages %j", (changes) => {
    expect(() =>
      parseEventPage({ ...eventPage(), ...changes }, 1, 100),
    ).toThrow("不完整");
  });
  it("supports empty offset pages and the int4 counter boundary without fabricating worker invariants", () => {
    expect(
      parseEventPage(
        { items: [], page: 2, pageSize: 20, total: 1, hasNext: false },
        2,
        20,
      ).items,
    ).toEqual([]);
    expect(
      parseOutboxEvent({
        ...item,
        attempts: 2147483647,
        maxAttempts: 2147483647,
      }),
    ).toMatchObject({ attempts: 2147483647 });
    for (const status of [
      "pending",
      "processing",
      "published",
      "failed",
    ] as const)
      expect(parseOutboxEvent({ ...item, status }).status).toBe(status);
  });
});
