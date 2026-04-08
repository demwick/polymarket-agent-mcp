import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initializeDb } from "../../src/db/schema.js";
import { recordTrade, getTradeHistory } from "../../src/db/queries.js";

// Mock fetchWithRetry to avoid retry delays in tests
vi.mock("../../src/utils/fetch.js", () => ({
  fetchWithRetry: vi.fn(async (url: string) => {
    return globalThis.fetch(url);
  }),
}));

import { PositionTracker } from "../../src/services/position-tracker.js";

describe("PositionTracker", () => {
  let db: Database.Database;
  let tracker: PositionTracker;

  beforeEach(() => {
    db = new Database(":memory:");
    initializeDb(db);
    tracker = new PositionTracker(db);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 0 when no open positions", async () => {
    const closed = await tracker.checkExits();
    expect(closed).toBe(0);
  });

  it("closes position when trader exits", async () => {
    recordTrade(db, {
      trader_address: "0xtrader1",
      market_slug: "test-market",
      condition_id: "cond123",
      token_id: "tok123",
      side: "BUY",
      price: 0.5,
      amount: 10,
      original_amount: 20,
      mode: "preview",
      status: "simulated",
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("data-api") && urlStr.includes("SELL")) {
        return Response.json([{ conditionId: "cond123", side: "SELL" }]);
      }
      if (urlStr.includes("clob.polymarket.com/markets/")) {
        return Response.json({ closed: false, tokens: [{ token_id: "tok123", price: 0.80, winner: null }] });
      }
      return Response.json([]);
    });

    const closed = await tracker.checkExits();
    expect(closed).toBe(1);

    const trades = getTradeHistory(db, { limit: 10 });
    expect(trades[0].status).toBe("resolved_win");
    expect(trades[0].exit_reason).toBe("trader_exit");
    expect(trades[0].current_price).toBe(0.8);
  });

  it("closes position when market resolves YES (our token wins)", async () => {
    recordTrade(db, {
      trader_address: "0xtrader1",
      market_slug: "resolved-market",
      condition_id: "cond_resolved",
      token_id: "tok_winner",
      side: "BUY",
      price: 0.4,
      amount: 10,
      original_amount: 20,
      mode: "preview",
      status: "simulated",
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("data-api") && urlStr.includes("SELL")) {
        return Response.json([]);
      }
      if (urlStr.includes("clob.polymarket.com/markets/")) {
        return Response.json({
          closed: true,
          tokens: [
            { token_id: "tok_winner", price: 1, winner: true },
            { token_id: "tok_loser", price: 0, winner: false },
          ],
        });
      }
      return Response.json([]);
    });

    const closed = await tracker.checkExits();
    expect(closed).toBe(1);

    const trades = getTradeHistory(db, { limit: 10 });
    expect(trades[0].status).toBe("resolved_win");
    expect(trades[0].exit_reason).toBe("market_resolved");
  });

  it("closes position when market resolves NO (our token loses)", async () => {
    recordTrade(db, {
      trader_address: "0xtrader1",
      market_slug: "lost-market",
      condition_id: "cond_no",
      token_id: "tok_loser",
      side: "BUY",
      price: 0.7,
      amount: 10,
      original_amount: 20,
      mode: "preview",
      status: "simulated",
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("data-api") && urlStr.includes("SELL")) {
        return Response.json([]);
      }
      if (urlStr.includes("clob.polymarket.com/markets/")) {
        return Response.json({
          closed: true,
          tokens: [
            { token_id: "tok_winner", price: 1, winner: true },
            { token_id: "tok_loser", price: 0, winner: false },
          ],
        });
      }
      return Response.json([]);
    });

    const closed = await tracker.checkExits();
    expect(closed).toBe(1);

    const trades = getTradeHistory(db, { limit: 10 });
    expect(trades[0].status).toBe("resolved_loss");
  });

  it("skips position when no exit and market not resolved", async () => {
    recordTrade(db, {
      trader_address: "0xtrader1",
      market_slug: "active-market",
      condition_id: "cond_active",
      token_id: "tok1",
      side: "BUY",
      price: 0.5,
      amount: 10,
      original_amount: 20,
      mode: "preview",
      status: "simulated",
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("data-api") && urlStr.includes("SELL")) {
        return Response.json([]);
      }
      if (urlStr.includes("clob.polymarket.com/markets/")) {
        return Response.json({ closed: false, tokens: [{ token_id: "tok1", price: 0.55, winner: null }] });
      }
      return Response.json([]);
    });

    const closed = await tracker.checkExits();
    expect(closed).toBe(0);

    const trades = getTradeHistory(db, { limit: 10 });
    expect(trades[0].status).toBe("simulated");
  });

  it("handles API errors gracefully", async () => {
    recordTrade(db, {
      trader_address: "0xtrader1",
      market_slug: "err-market",
      condition_id: "cond_err",
      token_id: "tok1",
      side: "BUY",
      price: 0.5,
      amount: 10,
      original_amount: 20,
      mode: "preview",
      status: "simulated",
    });

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    const closed = await tracker.checkExits();
    expect(closed).toBe(0);
  });

  it("triggers stop-loss when price drops below threshold", async () => {
    const id = recordTrade(db, {
      trader_address: "0xtrader1", market_slug: "sl-test", condition_id: "cond_sl",
      token_id: "tok_sl", side: "BUY", price: 0.5, amount: 10, original_amount: 20,
      mode: "preview", status: "simulated",
    });
    db.prepare("UPDATE trades SET sl_price = 0.3 WHERE id = ?").run(id);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("clob.polymarket.com/markets/")) {
        return Response.json({ closed: false, tokens: [{ token_id: "tok_sl", price: 0.25 }] });
      }
      return Response.json([]);
    });

    const closed = await tracker.checkExits();
    expect(closed).toBe(1);

    const trades = getTradeHistory(db, { limit: 10 });
    expect(trades[0].exit_reason).toBe("stop_loss");
    expect(trades[0].status).toBe("resolved_loss");
  });

  it("triggers take-profit when price rises above threshold", async () => {
    const id = recordTrade(db, {
      trader_address: "0xtrader1", market_slug: "tp-test", condition_id: "cond_tp",
      token_id: "tok_tp", side: "BUY", price: 0.5, amount: 10, original_amount: 20,
      mode: "preview", status: "simulated",
    });
    db.prepare("UPDATE trades SET tp_price = 0.85 WHERE id = ?").run(id);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("clob.polymarket.com/markets/")) {
        return Response.json({ closed: false, tokens: [{ token_id: "tok_tp", price: 0.9 }] });
      }
      return Response.json([]);
    });

    const closed = await tracker.checkExits();
    expect(closed).toBe(1);

    const trades = getTradeHistory(db, { limit: 10 });
    expect(trades[0].exit_reason).toBe("take_profit");
    expect(trades[0].status).toBe("resolved_win");
  });

  it("does not trigger SL/TP when price is within range", async () => {
    const id = recordTrade(db, {
      trader_address: "0xtrader1", market_slug: "safe", condition_id: "cond_safe",
      token_id: "tok_safe", side: "BUY", price: 0.5, amount: 10, original_amount: 20,
      mode: "preview", status: "simulated",
    });
    db.prepare("UPDATE trades SET sl_price = 0.3, tp_price = 0.85 WHERE id = ?").run(id);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("clob.polymarket.com/markets/")) {
        return Response.json({ closed: false, tokens: [{ token_id: "tok_safe", price: 0.55 }] });
      }
      return Response.json([]);
    });

    const closed = await tracker.checkExits();
    expect(closed).toBe(0);
  });

  describe("calculatePnl", () => {
    it("calculates positive pnl", () => {
      // Access via prototype
      const pnl = (tracker as any).calculatePnl(0.5, 0.8, 10);
      expect(pnl).toBeCloseTo(6, 5); // (0.8 - 0.5) * 10 / 0.5
    });

    it("calculates negative pnl", () => {
      const pnl = (tracker as any).calculatePnl(0.5, 0.3, 10);
      expect(pnl).toBe(-4); // (0.3 - 0.5) * 10 / 0.5
    });

    it("returns 0 when entry price is 0", () => {
      const pnl = (tracker as any).calculatePnl(0, 0.5, 10);
      expect(pnl).toBe(0);
    });

    it("returns 0 for break-even", () => {
      const pnl = (tracker as any).calculatePnl(0.5, 0.5, 10);
      expect(pnl).toBe(0);
    });
  });
});
