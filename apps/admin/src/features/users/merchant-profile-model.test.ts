import { describe, expect, it } from "vitest";
import { parseMerchantProfile } from "@/features/users/merchant-profile-model";
const profile = {
  merchantId: 2,
  userId: 7,
  businessName: "商家",
  contact: null,
  status: "active",
  customFields: {},
  schemaVersion: 1,
  version: 2,
  createdAt: "2026-11-05T00:00:00.000Z",
  updatedAt: "2026-11-05T01:00:00.000Z",
};
describe("merchant profile identity and lifecycle response", () => {
  it("accepts an existing account without a business profile", () =>
    expect(parseMerchantProfile(null, 7)).toBeNull());
  it("accepts active and disabled profiles without changing identity", () => {
    expect(parseMerchantProfile(profile, 7)).toEqual(profile);
    expect(
      parseMerchantProfile({ ...profile, status: "disabled" }, 7)?.status,
    ).toBe("disabled");
  });
  it.each([
    { userId: 8 },
    { merchantId: 0 },
    { version: 0 },
    { contact: false },
    { customFields: [] },
    { updatedAt: "invalid" },
    { status: "deleted" },
  ])("rejects wrong identity or malformed state %j", (patch) =>
    expect(() => parseMerchantProfile({ ...profile, ...patch }, 7)).toThrow(),
  );
});
