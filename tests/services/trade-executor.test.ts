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
});
