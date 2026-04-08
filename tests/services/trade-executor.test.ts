import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { initializeDb } from "../../src/db/schema.js";
import { TradeExecutor } from "../../src/services/trade-executor.js";
import { getTradeHistory } from "../../src/db/queries.js";

describe("TradeExecutor (preview mode)", () => {
  let db: Database.Database;
  let executor: TradeExecutor;

  beforeEach(() => {
    db = new Database(":memory:");
    initializeDb(db);
    executor = new TradeExecutor(db, "preview");
  });

  it("simulates a trade in preview mode", async () => {
    const result = await executor.execute({
      traderAddress: "0xabc",
      marketSlug: "btc-100k",
      conditionId: "cond123",
      tokenId: "tok123",
      price: 0.45,
      amount: 5,
      originalAmount: 30,
      tickSize: "0.01",
      negRisk: false,
    });

    expect(result.status).toBe("simulated");
    expect(result.mode).toBe("preview");

    const trades = getTradeHistory(db, { limit: 10 });
    expect(trades).toHaveLength(1);
    expect(trades[0].status).toBe("simulated");
    expect(trades[0].amount).toBe(5);
  });

  it("always simulates in preview mode", async () => {
    const result = await executor.execute({
      traderAddress: "0xabc",
      marketSlug: "test",
      conditionId: "cond",
      tokenId: "tok",
      price: 0.5,
      amount: 5,
      originalAmount: 10,
      tickSize: "0.01",
      negRisk: false,
    });
    expect(result.mode).toBe("preview");
    expect(result.status).toBe("simulated");
  });

  it("simulates a SELL trade in preview mode", async () => {
    const result = await executor.executeSell({
      traderAddress: "0xabc",
      marketSlug: "sell-test",
      conditionId: "cond_sell",
      tokenId: "tok_sell",
      price: 0.65,
      amount: 8,
      originalAmount: 15,
      tickSize: "0.01",
      negRisk: false,
    });

    expect(result.status).toBe("simulated");
    expect(result.mode).toBe("preview");

    const trades = getTradeHistory(db, { limit: 10 });
    const sellTrade = trades.find((t) => t.condition_id === "cond_sell");
    expect(sellTrade).toBeDefined();
    expect(sellTrade!.side).toBe("SELL");
    expect(sellTrade!.price).toBe(0.65);
  });

  it("switches mode correctly", () => {
    expect(executor.getMode()).toBe("preview");
    executor.setMode("live");
    expect(executor.getMode()).toBe("live");
    executor.setMode("preview");
    expect(executor.getMode()).toBe("preview");
  });

  it("records trade with correct fields", async () => {
    await executor.execute({
      traderAddress: "0xtrader",
      marketSlug: "btc-market",
      conditionId: "cond_btc",
      tokenId: "tok_btc",
      price: 0.72,
      amount: 12.5,
      originalAmount: 50,
      tickSize: "0.01",
      negRisk: true,
    });

    const trades = getTradeHistory(db, { limit: 10 });
    expect(trades).toHaveLength(1);
    expect(trades[0].trader_address).toBe("0xtrader");
    expect(trades[0].condition_id).toBe("cond_btc");
    expect(trades[0].token_id).toBe("tok_btc");
    expect(trades[0].price).toBe(0.72);
    expect(trades[0].amount).toBe(12.5);
    expect(trades[0].original_amount).toBe(50);
    expect(trades[0].mode).toBe("preview");
  });
});
