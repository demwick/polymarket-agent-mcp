import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { initializeDb } from "../../src/db/schema.js";
import { handleClosePosition } from "../../src/tools/close-position.js";
import { recordTrade, getTradeHistory } from "../../src/db/queries.js";

vi.mock("../../src/utils/license.js", () => ({
  checkLicense: vi.fn().mockResolvedValue(true),
  requirePro: vi.fn((name: string) => `${name} requires Pro`),
  resetLicenseCache: vi.fn(),
}));

vi.mock("../../src/services/price-service.js", () => ({
  getMarketPriceByCondition: vi.fn().mockResolvedValue({ price: 0.75, tokenId: "tok1" }),
  getMarketPrice: vi.fn().mockResolvedValue(null),
}));

import { checkLicense } from "../../src/utils/license.js";
const mockCheckLicense = vi.mocked(checkLicense);

describe("handleClosePosition", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initializeDb(db);
    mockCheckLicense.mockResolvedValue(true);
  });

  it("requires Pro license", async () => {
    mockCheckLicense.mockResolvedValue(false);
    const result = await handleClosePosition(db, { trade_id: 1, reason: "manual" });
    expect(result).toContain("Pro");
  });

  it("returns error for non-existent trade", async () => {
    const result = await handleClosePosition(db, { trade_id: 999, reason: "manual" });
    expect(result).toContain("No open position");
  });

  it("closes an open position", async () => {
    const id = recordTrade(db, {
      trader_address: "0x1",
      market_slug: "close-me",
      condition_id: "c1",
      token_id: "t1",
      side: "BUY",
      price: 0.5,
      amount: 10,
      original_amount: 20,
      mode: "preview",
      status: "simulated",
    });

    const result = await handleClosePosition(db, { trade_id: id, reason: "taking profit" });
    expect(result).toContain(`Position #${id} closed`);
    expect(result).toContain("close-me");
    expect(result).toContain("taking profit");

    const trades = getTradeHistory(db, { limit: 10 });
    expect(trades[0].status).toMatch(/resolved_/);
    expect(trades[0].exit_reason).toBe("taking profit");
  });

  it("does not close already-resolved trade", async () => {
    const id = recordTrade(db, {
      trader_address: "0x1",
      market_slug: "already-done",
      condition_id: "c1",
      token_id: "t1",
      side: "BUY",
      price: 0.5,
      amount: 10,
      original_amount: 20,
      mode: "preview",
      status: "resolved_win",
    });

    const result = await handleClosePosition(db, { trade_id: id, reason: "manual" });
    expect(result).toContain("No open position");
  });
});
