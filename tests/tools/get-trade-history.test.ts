import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { initializeDb } from "../../src/db/schema.js";
import { handleGetTradeHistory } from "../../src/tools/get-trade-history.js";
import { recordTrade } from "../../src/db/queries.js";

vi.mock("../../src/utils/license.js", () => ({
  checkLicense: vi.fn().mockResolvedValue(true),
  requirePro: vi.fn((name: string) => `${name} requires Pro`),
  resetLicenseCache: vi.fn(),
}));

import { checkLicense } from "../../src/utils/license.js";
const mockCheckLicense = vi.mocked(checkLicense);

describe("handleGetTradeHistory", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initializeDb(db);
    mockCheckLicense.mockResolvedValue(true);
  });

  it("requires Pro license", async () => {
    mockCheckLicense.mockResolvedValue(false);
    const result = await handleGetTradeHistory(db, { limit: 20 });
    expect(result).toContain("Pro");
  });

  it("returns message when no trades", async () => {
    const result = await handleGetTradeHistory(db, { limit: 20 });
    expect(result).toContain("No trades");
  });

  it("renders trade history table", async () => {
    recordTrade(db, {
      trader_address: "0xtrader1",
      market_slug: "btc-100k",
      condition_id: "c1",
      token_id: "t1",
      side: "BUY",
      price: 0.45,
      amount: 10,
      original_amount: 20,
      mode: "preview",
      status: "simulated",
    });

    const result = await handleGetTradeHistory(db, { limit: 20 });
    expect(result).toContain("Trade History (1)");
    expect(result).toContain("btc-100k");
    expect(result).toContain("$0.45");
    expect(result).toContain("$10.00");
    expect(result).toContain("simulated");
  });

  it("respects limit parameter", async () => {
    for (let i = 0; i < 5; i++) {
      recordTrade(db, {
        trader_address: "0x1",
        market_slug: `market-${i}`,
        condition_id: `c${i}`,
        token_id: `t${i}`,
        side: "BUY",
        price: 0.5,
        amount: 5,
        original_amount: 10,
        mode: "preview",
        status: "simulated",
      });
    }

    const result = await handleGetTradeHistory(db, { limit: 2 });
    expect(result).toContain("Trade History (2)");
  });
});
