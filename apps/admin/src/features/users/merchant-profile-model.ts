export interface Profile {
  merchantId: number;
  userId: number;
  businessName: string;
  contact: string | null;
  status: "active" | "disabled";
  customFields: Record<string, unknown>;
  schemaVersion: number;
  version: number;
  updatedAt: string;
  createdAt: string;
}
export function parseMerchantProfile(
  value: unknown,
  userId: number,
): Profile | null {
  if (value === null) return null;
  const p = value as Profile;
  if (
    !p ||
    p.userId !== userId ||
    !Number.isSafeInteger(p.merchantId) ||
    p.merchantId < 1 ||
    p.merchantId > 2147483647 ||
    !Number.isSafeInteger(p.version) ||
    p.version < 1 ||
    p.version > 2147483647 ||
    !Number.isInteger(p.schemaVersion) ||
    p.schemaVersion < 1 ||
    p.schemaVersion > 2147483647 ||
    typeof p.businessName !== "string" ||
    (p.contact !== null && typeof p.contact !== "string") ||
    !["active", "disabled"].includes(p.status) ||
    !p.customFields ||
    typeof p.customFields !== "object" ||
    Array.isArray(p.customFields) ||
    typeof p.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(p.updatedAt)) ||
    typeof p.createdAt !== "string" ||
    !Number.isFinite(Date.parse(p.createdAt))
  )
    throw Error("商家资料响应异常");
  return p;
}
