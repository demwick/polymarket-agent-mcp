import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { initializeDb } from "../../src/db/schema.js";
import { handleSetExitRules } from "../../src/tools/set-exit-rules.js";
import { recordTrade } from "../../src/db/queries.js";

vi.mock("../../src/utils/license.js", () => ({
  checkLicense: vi.fn().mockResolvedValue(true),
  requirePro: vi.fn((name: string) => `${name} requires Pro`),
  resetLicenseCache: vi.fn(),
}));

describe("handleSetExitRules", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initializeDb(db);
  });

  it("sets stop-loss on a position", async () => {
    const id = recordTrade(db, {
      trader_address: "0x1", market_slug: "test-market", condition_id: "c1",
      token_id: "t1", side: "BUY", price: 0.5, amount: 10, original_amount: 20,
      mode: "preview", status: "simulated",
    });

    const result = await handleSetExitRules(db, { trade_id: id, stop_loss: 0.3 });
    expect(result).toContain("SL: $0.3");
    expect(result).toContain("test-market");

    const trade = db.prepare("SELECT sl_price, tp_price FROM trades WHERE id = ?").get(id) as any;
    expect(trade.sl_price).toBe(0.3);
    expect(trade.tp_price).toBeNull();
  });

  it("sets both SL and TP", async () => {
    const id = recordTrade(db, {
      trader_address: "0x1", market_slug: "both", condition_id: "c1",
      token_id: "t1", side: "BUY", price: 0.5, amount: 10, original_amount: 20,
      mode: "preview", status: "simulated",
    });

    const result = await handleSetExitRules(db, { trade_id: id, stop_loss: 0.3, take_profit: 0.8 });
    expect(result).toContain("SL: $0.3");
    expect(result).toContain("TP: $0.8");
  });

  it("rejects SL above entry price", async () => {
    const id = recordTrade(db, {
      trader_address: "0x1", market_slug: "test", condition_id: "c1",
      token_id: "t1", side: "BUY", price: 0.5, amount: 10, original_amount: 20,
      mode: "preview", status: "simulated",
    });

    const result = await handleSetExitRules(db, { trade_id: id, stop_loss: 0.6 });
    expect(result).toContain("must be below");
  });

  it("rejects TP below entry price", async () => {
    const id = recordTrade(db, {
      trader_address: "0x1", market_slug: "test", condition_id: "c1",
      token_id: "t1", side: "BUY", price: 0.5, amount: 10, original_amount: 20,
      mode: "preview", status: "simulated",
    });

    const result = await handleSetExitRules(db, { trade_id: id, take_profit: 0.4 });
    expect(result).toContain("must be above");
  });

  it("fails for non-existent position", async () => {
    const result = await handleSetExitRules(db, { trade_id: 999, stop_loss: 0.3 });
    expect(result).toContain("No open position");
  });

  it("requires at least one of SL or TP", async () => {
    const result = await handleSetExitRules(db, { trade_id: 1 });
    expect(result).toContain("Provide at least one");
  });
});
