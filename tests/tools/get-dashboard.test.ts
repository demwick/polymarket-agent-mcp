import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { initializeDb } from "../../src/db/schema.js";
import { handleGetDashboard } from "../../src/tools/get-dashboard.js";
import { BudgetManager } from "../../src/services/budget-manager.js";
import { WalletMonitor } from "../../src/services/wallet-monitor.js";
import { TradeExecutor } from "../../src/services/trade-executor.js";
import { addToWatchlist, recordTrade } from "../../src/db/queries.js";

vi.mock("../../src/utils/license.js", () => ({
  checkLicense: vi.fn().mockResolvedValue(false),
  requirePro: vi.fn((name: string) => `${name} requires Pro`),
  resetLicenseCache: vi.fn(),
}));

import { checkLicense } from "../../src/utils/license.js";
const mockCheckLicense = vi.mocked(checkLicense);

describe("handleGetDashboard", () => {
  let db: Database.Database;
  let bm: BudgetManager;
  let monitor: WalletMonitor;
  let executor: TradeExecutor;

  beforeEach(() => {
    db = new Database(":memory:");
    initializeDb(db);
    bm = new BudgetManager(db, 20);
    executor = new TradeExecutor(db, "preview");
    monitor = new WalletMonitor(db, bm, executor, 3);
    mockCheckLicense.mockResolvedValue(false);
  });

  it("renders dashboard with basic stats (free tier)", async () => {
    const result = await handleGetDashboard(db, bm, monitor, "preview");
    expect(result).toContain("PREVIEW MODE");
    expect(result).toContain("FREE");
    expect(result).toContain("Budget");
    expect(result).toContain("Win Rate");
    expect(result).toContain("Stopped");
    expect(result).toContain("Upgrade to Pro");
  });

  it("shows trade history for Pro users", async () => {
    mockCheckLicense.mockResolvedValue(true);

    recordTrade(db, {
      trader_address: "0xabc",
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

    const result = await handleGetDashboard(db, bm, monitor, "preview");
    expect(result).toContain("PRO");
    expect(result).toContain("Recent Trades");
    expect(result).toContain("test-market");
  });

  it("includes watchlist when not empty", async () => {
    addToWatchlist(db, { address: "0xabc123def456abc123def456abc123def456abc1", alias: "Trader1", roi: 100, volume: 50000, pnl: 5000, trade_count: 50 });

    const result = await handleGetDashboard(db, bm, monitor, "preview");
    expect(result).toContain("Watchlist (1)");
    expect(result).toContain("Trader1");
  });

  it("shows live mode label", async () => {
    const result = await handleGetDashboard(db, bm, monitor, "live");
    expect(result).toContain("LIVE MODE");
  });
});
