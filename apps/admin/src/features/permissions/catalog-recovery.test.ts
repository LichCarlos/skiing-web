import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CatalogRecoveryLedger,
  hasUnconfirmedCatalogWrite,
  markCatalogWrite,
} from "@/features/permissions/catalog-recovery";
afterEach(() => vi.unstubAllGlobals());
describe("catalog recovery across component remounts", () => {
  it("isolates accounts and clears only the reviewed account", () => {
    const ledger = new CatalogRecoveryLedger();
    ledger.mark(7, true);
    ledger.mark(8, true);
    ledger.mark(7, false);
    expect(ledger.has(7)).toBe(false);
    expect(ledger.has(8)).toBe(true);
  });
  it("keeps an in-flight token when an unconfirmed outcome is reported twice", () => {
    const ledger = new CatalogRecoveryLedger(),
      token = ledger.begin(7);
    ledger.mark(7, true);
    ledger.mark(7, true);
    expect(ledger.has(7)).toBe(true);
    ledger.finish(7, token);
    expect(ledger.has(7)).toBe(false);
  });
  it("does not let an old completion clear a newer operation after review", () => {
    const ledger = new CatalogRecoveryLedger(),
      old = ledger.begin(7);
    ledger.mark(7, false);
    const current = ledger.begin(7);
    ledger.finish(7, old);
    expect(ledger.has(7)).toBe(true);
    ledger.finish(7, current);
    expect(ledger.has(7)).toBe(false);
  });
  it("keeps browser pending state when a page reads it again after remount", () => {
    vi.stubGlobal("window", {});
    markCatalogWrite(70001, true);
    try {
      expect(hasUnconfirmedCatalogWrite(70001)).toBe(true);
      expect(hasUnconfirmedCatalogWrite(70002)).toBe(false);
      markCatalogWrite(70002, true);
      markCatalogWrite(70001, false);
      expect(hasUnconfirmedCatalogWrite(70001)).toBe(false);
      expect(hasUnconfirmedCatalogWrite(70002)).toBe(true);
    } finally {
      markCatalogWrite(70001, false);
      markCatalogWrite(70002, false);
    }
  });
  it("does not read or mutate recovery state during SSR", () => {
    vi.stubGlobal("window", undefined);
    markCatalogWrite(70001, true);
    expect(hasUnconfirmedCatalogWrite(70001)).toBe(false);
    vi.stubGlobal("window", {});
    expect(hasUnconfirmedCatalogWrite(70001)).toBe(false);
  });
});
