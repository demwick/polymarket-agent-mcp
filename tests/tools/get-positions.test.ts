import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { initializeDb } from "../../src/db/schema.js";
import { handleGetPositions } from "../../src/tools/get-positions.js";
import { recordTrade, updateTradeExit } from "../../src/db/queries.js";

vi.mock("../../src/utils/license.js", () => ({
  checkLicense: vi.fn().mockResolvedValue(false),
  requirePro: vi.fn((name: string) => `${name} requires Pro`),
  resetLicenseCache: vi.fn(),
}));

import { checkLicense } from "../../src/utils/license.js";
const mockCheckLicense = vi.mocked(checkLicense);

describe("handleGetPositions", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initializeDb(db);
    mockCheckLicense.mockResolvedValue(false);
  });

  it("returns message when no positions", async () => {
    const result = await handleGetPositions(db, { status: "open" });
    expect(result).toContain("No open positions");
  });

  it("shows basic table for free tier", async () => {
    recordTrade(db, {
      trader_address: "0x1",
      market_slug: "test-market",
      condition_id: "c1",
      token_id: "t1",
      side: "BUY",
      price: 0.5,
      amount: 10,
      original_amount: 20,
      mode: "preview",
      status: "simulated",
    });

    const result = await handleGetPositions(db, { status: "open" });
    expect(result).toContain("Positions (1)");
    expect(result).toContain("test-market");
    expect(result).toContain("Upgrade to Pro");
    // Free tier table header should NOT have P&L column
    expect(result).not.toContain("| P&L |");
  });

  it("shows detailed table for Pro", async () => {
    mockCheckLicense.mockResolvedValue(true);

    const id = recordTrade(db, {
      trader_address: "0x1",
      market_slug: "pro-market",
      condition_id: "c1",
      token_id: "t1",
      side: "BUY",
      price: 0.5,
      amount: 10,
      original_amount: 20,
      mode: "preview",
      status: "simulated",
    });

    const result = await handleGetPositions(db, { status: "open" });
    expect(result).toContain("P&L");
    expect(result).toContain("Entry");
    expect(result).toContain("pro-market");
  });

  it("filters closed positions", async () => {
    recordTrade(db, { trader_address: "0x1", market_slug: "open", condition_id: "c1", token_id: "t1", side: "BUY", price: 0.5, amount: 10, original_amount: 20, mode: "preview", status: "simulated" });
    const id = recordTrade(db, { trader_address: "0x1", market_slug: "closed", condition_id: "c2", token_id: "t2", side: "BUY", price: 0.3, amount: 5, original_amount: 10, mode: "preview", status: "simulated" });
    updateTradeExit(db, id, 0.8, "manual", 8.33);

    const result = await handleGetPositions(db, { status: "closed" });
    expect(result).toContain("closed");
    expect(result).not.toContain("| open |");
  });

  it("shows all positions with status=all", async () => {
    recordTrade(db, { trader_address: "0x1", market_slug: "a", condition_id: "c1", token_id: "t1", side: "BUY", price: 0.5, amount: 10, original_amount: 20, mode: "preview", status: "simulated" });
    recordTrade(db, { trader_address: "0x1", market_slug: "b", condition_id: "c2", token_id: "t2", side: "BUY", price: 0.3, amount: 5, original_amount: 10, mode: "preview", status: "resolved_win" });

    const result = await handleGetPositions(db, { status: "all" });
    expect(result).toContain("Positions (2)");
  });
});
