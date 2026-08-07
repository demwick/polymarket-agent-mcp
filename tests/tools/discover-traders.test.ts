import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { initializeDb } from "../../src/db/schema.js";
import { handleDiscoverTraders } from "../../src/tools/discover-traders.js";
import { getWatchlist } from "../../src/db/queries.js";

vi.mock("../../src/services/leaderboard.js", () => ({
  discoverTraders: vi.fn().mockResolvedValue([]),
  filterTraders: vi.fn((t: any[]) => t),
}));

import { discoverTraders } from "../../src/services/leaderboard.js";
const mockDiscover = vi.mocked(discoverTraders);

describe("handleDiscoverTraders", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initializeDb(db);
  });

  it("returns message when no traders found", async () => {
    mockDiscover.mockResolvedValue([]);
    const result = await handleDiscoverTraders(db, {
      pages: 1, period: "ALL", min_volume: 1000, min_pnl: 0, auto_watch: false,
    });
    expect(result).toContain("No traders found");
  });

  it("requests every page and lists every trader returned", async () => {
    const traders = Array.from({ length: 15 }, (_, i) => ({
      address: `0x${"a".repeat(39)}${i}`,
      name: `Trader ${i}`,
      pnl: 1000 * (i + 1),
      volume: 5000 * (i + 1),
      rank: i + 1,
      period: "ALL" as const,
    }));
    mockDiscover.mockResolvedValue(traders);

    const result = await handleDiscoverTraders(db, {
      pages: 5, period: "ALL", min_volume: 0, min_pnl: 0, auto_watch: false,
    });

    expect(mockDiscover).toHaveBeenCalledWith(expect.objectContaining({ pages: 5 }));
    expect(result).toContain("Discovered Traders (15)");
  });

  it("auto_watch adds traders to watchlist", async () => {
    const traders = [
      { address: "0xabc123def456abc123def456abc123def456abc1", name: "Auto Trader", pnl: 5000, volume: 20000, rank: 1, period: "ALL" as const },
    ];
    mockDiscover.mockResolvedValue(traders);

    const result = await handleDiscoverTraders(db, {
      pages: 1, period: "ALL", min_volume: 0, min_pnl: 0, auto_watch: true,
    });

    expect(result).toContain("added to watchlist");
    const list = getWatchlist(db);
    expect(list).toHaveLength(1);
    expect(list[0].alias).toBe("Auto Trader");
  });
});
