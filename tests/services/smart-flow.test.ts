import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("../../src/utils/fetch.js", () => ({
  fetchWithRetry: vi.fn(async (url: string, opts?: any) => globalThis.fetch(url)),
}));

import { discoverSmartFlow } from "../../src/services/smart-flow.js";

describe("SmartFlow", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("detects signal when multiple traders buy same market", async () => {
    const now = Math.floor(Date.now() / 1000);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);

      // Leaderboard
      if (urlStr.includes("leaderboard")) {
        return Response.json([
          { proxyWallet: "0xA", userName: "Whale", pnl: 5000, vol: 100000, rank: 1 },
          { proxyWallet: "0xB", userName: "Shark", pnl: 3000, vol: 80000, rank: 2 },
          { proxyWallet: "0xC", userName: "Fish", pnl: 1000, vol: 50000, rank: 3 },
        ]);
      }

      // Activity — A and B both bought same market
      if (urlStr.includes("0xA") && urlStr.includes("activity")) {
        return Response.json([
          { conditionId: "hot_market", title: "BTC 100k", side: "BUY", usdcSize: "500", price: "0.65", timestamp: now - 300 },
        ]);
      }
      if (urlStr.includes("0xB") && urlStr.includes("activity")) {
        return Response.json([
          { conditionId: "hot_market", title: "BTC 100k", side: "BUY", usdcSize: "300", price: "0.63", timestamp: now - 600 },
        ]);
      }
      if (urlStr.includes("0xC") && urlStr.includes("activity")) {
        return Response.json([
          { conditionId: "other_market", title: "ETH Merge", side: "BUY", usdcSize: "100", price: "0.40", timestamp: now - 120 },
        ]);
      }

      return Response.json([]);
    });

    const signals = await discoverSmartFlow({ topN: 3, maxAgeMinutes: 60, minSignalTraders: 2 });

    expect(signals.length).toBe(1);
    expect(signals[0].conditionId).toBe("hot_market");
    expect(signals[0].traders.length).toBe(2);
    expect(signals[0].totalAmount).toBe(800);
    expect(signals[0].title).toBe("BTC 100k");
  });

  it("returns empty when no convergence", async () => {
    const now = Math.floor(Date.now() / 1000);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("leaderboard")) {
        return Response.json([
          { proxyWallet: "0xA", userName: "A", pnl: 1000, vol: 50000, rank: 1 },
          { proxyWallet: "0xB", userName: "B", pnl: 800, vol: 40000, rank: 2 },
        ]);
      }
      if (urlStr.includes("0xA") && urlStr.includes("activity")) {
        return Response.json([{ conditionId: "m1", title: "Market 1", side: "BUY", usdcSize: "100", price: "0.5", timestamp: now }]);
      }
      if (urlStr.includes("0xB") && urlStr.includes("activity")) {
        return Response.json([{ conditionId: "m2", title: "Market 2", side: "BUY", usdcSize: "200", price: "0.6", timestamp: now }]);
      }
      return Response.json([]);
    });

    const signals = await discoverSmartFlow({ topN: 2, maxAgeMinutes: 60, minSignalTraders: 2 });
    expect(signals.length).toBe(0);
  });

  it("filters out old trades", async () => {
    const old = Math.floor(Date.now() / 1000) - 7200; // 2 hours ago

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("leaderboard")) {
        return Response.json([
          { proxyWallet: "0xA", userName: "A", pnl: 1000, vol: 50000, rank: 1 },
          { proxyWallet: "0xB", userName: "B", pnl: 800, vol: 40000, rank: 2 },
        ]);
      }
      // Both bought same market but 2 hours ago
      return Response.json([{ conditionId: "old_market", title: "Old", side: "BUY", usdcSize: "100", price: "0.5", timestamp: old }]);
    });

    const signals = await discoverSmartFlow({ topN: 2, maxAgeMinutes: 60, minSignalTraders: 2 });
    expect(signals.length).toBe(0);
  });
});
