import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { initializeDb } from "../../src/db/schema.js";
import { handleDiscoverTraders } from "../../src/tools/discover-traders.js";
import { getWatchlist } from "../../src/db/queries.js";

vi.mock("../../src/utils/license.js", () => ({
  checkLicense: vi.fn().mockResolvedValue(false),
  requirePro: vi.fn((name: string) => `${name} requires Pro`),
  resetLicenseCache: vi.fn(),
}));

vi.mock("../../src/services/leaderboard.js", () => ({
  discoverTraders: vi.fn().mockResolvedValue([]),
  filterTraders: vi.fn((t: any[]) => t),
}));

import { checkLicense } from "../../src/utils/license.js";
import { discoverTraders } from "../../src/services/leaderboard.js";
const mockCheckLicense = vi.mocked(checkLicense);
const mockDiscover = vi.mocked(discoverTraders);

describe("handleDiscoverTraders", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initializeDb(db);
    mockCheckLicense.mockResolvedValue(false);
  });

  it("returns message when no traders found", async () => {
    mockDiscover.mockResolvedValue([]);
    const result = await handleDiscoverTraders(db, {
      pages: 1, period: "ALL", min_volume: 1000, min_pnl: 0, auto_watch: false,
    });
    expect(result).toContain("No traders found");
  });

  it("limits free tier to 1 page and 10 traders", async () => {
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

    // Free tier: pages capped to 1
    expect(mockDiscover).toHaveBeenCalledWith(expect.objectContaining({ pages: 1 }));
    // Free tier: only top 10 shown
    expect(result).toContain("Discovered Traders (10)");
    expect(result).toContain("FREE");
    expect(result).toContain("5 more traders available with Pro");
  });

  it("Pro tier shows all traders and pages", async () => {
    mockCheckLicense.mockResolvedValue(true);
    const traders = Array.from({ length: 5 }, (_, i) => ({
      address: `0x${"b".repeat(39)}${i}`,
      name: `Pro Trader ${i}`,
      pnl: 2000 * (i + 1),
      volume: 10000 * (i + 1),
      rank: i + 1,
      period: "ALL" as const,
    }));
    mockDiscover.mockResolvedValue(traders);

    const result = await handleDiscoverTraders(db, {
      pages: 5, period: "ALL", min_volume: 0, min_pnl: 0, auto_watch: false,
    });

    expect(mockDiscover).toHaveBeenCalledWith(expect.objectContaining({ pages: 5 }));
    expect(result).toContain("PRO");
    expect(result).toContain("Discovered Traders (5)");
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
