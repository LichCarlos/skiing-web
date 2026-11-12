import { describe, it, expect } from "vitest";
import {
  eventQuery,
  retryEventBody,
  eventMessage,
} from "@/features/events/event-api";
import {
  canManageEvents,
  eventOperatorKey,
  verifyEventOperator,
  eventFingerprint,
  assertRetryableEvent,
} from "@/features/events/event-model";
import { operator, item } from "@/features/events/event-fixtures.test-helper";
describe("event retry input and identity rules", () => {
  it.each([
    "management:portal:enter",
    "system:event:list",
    "system:event:retry",
  ])("requires %s for retry", (grant) => {
    expect(
      canManageEvents(
        {
          ...operator,
          permissionKeys: operator.permissionKeys.filter(
            (key) => key !== grant,
          ),
        },
        true,
      ),
    ).toBe(false);
  });
  it("supports readonly admins, denies configurable roles, and isolates same-account authorization changes", () => {
    const readOnly = {
      ...operator,
      permissionKeys: operator.permissionKeys.slice(0, 2),
    };
    expect(canManageEvents(readOnly)).toBe(true);
    expect(canManageEvents(readOnly, true)).toBe(false);
    expect(eventOperatorKey(readOnly)).not.toBe(eventOperatorKey(operator));
    expect(
      canManageEvents({
        ...operator,
        roles: [{ roleKey: "custom", roleName: "运营" }],
      }),
    ).toBe(false);
    expect(() => verifyEventOperator(readOnly, operator)).toThrow();
    expect(
      eventOperatorKey({
        ...operator,
        permissionKeys: [...operator.permissionKeys].reverse(),
      }),
    ).toBe(eventOperatorKey(operator));
  });
  it.each([0, -1, 2147483648, 1.5])("refuses invalid actor %s", (userId) => {
    expect(canManageEvents({ ...operator, userId })).toBe(false);
  });
  it.each(["pending", "processing", "published"] as const)(
    "does not prepare non-failed status %s",
    (status) => {
      expect(() => assertRetryableEvent({ ...item, status })).toThrow();
    },
  );
  it.each([0, -1, 1.5, 2147483640])(
    "refuses unavailable budget %s",
    (maxAttempts) => {
      expect(() => assertRetryableEvent({ ...item, maxAttempts })).toThrow();
    },
  );
  it("supports the last legal int4 retry budget and full Unicode reason limit", () => {
    expect(() =>
      assertRetryableEvent({ ...item, maxAttempts: 2147483639 }),
    ).not.toThrow();
    expect(retryEventBody(" ❄️ ").reason).toBe("❄️");
    expect(retryEventBody("😀".repeat(500)).reason).toBe("😀".repeat(500));
    expect(() => retryEventBody("😀".repeat(501))).toThrow();
  });
  it("uses an explicit snapshot independent of property insertion order", () => {
    expect(
      eventFingerprint(
        Object.fromEntries(Object.entries(item).reverse()) as typeof item,
      ),
    ).toBe(eventFingerprint(item));
    expect(eventFingerprint({ ...item, attempts: 9 })).not.toBe(
      eventFingerprint(item),
    );
  });
  it("preserves safe local input errors and redacts unknown failures", () => {
    try {
      eventQuery({}, 0);
    } catch (cause) {
      expect(eventMessage(cause)).toContain("页码");
    }
    expect(eventMessage(new Error("secret payload"))).not.toContain("secret");
  });
});
