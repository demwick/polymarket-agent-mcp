import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initializeDb } from "../../src/db/schema.js";
import { handleWatchWallet } from "../../src/tools/watch-wallet.js";
import { getWatchlist, addToWatchlist } from "../../src/db/queries.js";

describe("handleWatchWallet", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initializeDb(db);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("adds a wallet to watchlist", async () => {
    const result = await handleWatchWallet(db, {
      address: "0xabc123def456abc123def456abc123def456abc1",
      alias: "TestTrader",
      action: "add",
    });

    expect(result).toContain("Added");
    expect(result).toContain("TestTrader");
    const list = getWatchlist(db);
    expect(list).toHaveLength(1);
    expect(list[0].alias).toBe("TestTrader");
  });

  it("removes a wallet from watchlist", async () => {
    addToWatchlist(db, { address: "0xabc123def456abc123def456abc123def456abc1", alias: "A", roi: 0, volume: 0, pnl: 0, trade_count: 0 });

    const result = await handleWatchWallet(db, {
      address: "0xabc123def456abc123def456abc123def456abc1",
      action: "remove",
    });

    expect(result).toContain("Removed");
    expect(getWatchlist(db)).toHaveLength(0);
  });

  it("allows an unlimited number of wallets", async () => {
    for (let i = 1; i <= 3; i++) {
      const addr = `0x${"a".repeat(39)}${i}`;
      addToWatchlist(db, { address: addr, alias: null, roi: 0, volume: 0, pnl: 0, trade_count: 0 });
    }

    const result = await handleWatchWallet(db, {
      address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      action: "add",
    });

    expect(result).toContain("Added");
    expect(getWatchlist(db)).toHaveLength(4);
  });
});
