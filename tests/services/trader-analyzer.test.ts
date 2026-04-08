import { describe, it, expect, vi, afterEach } from "vitest";

// Mock fetchWithRetry to avoid retry delays in tests
vi.mock("../../src/utils/fetch.js", () => ({
  fetchWithRetry: vi.fn(async (url: string) => {
    return globalThis.fetch(url);
  }),
}));

import { analyzeTrader, getTraderOpenPositions } from "../../src/services/trader-analyzer.js";

describe("analyzeTrader", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns trader profile with basic stats", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("activity")) {
        return Response.json([
          // BUY entries (set avg entry prices)
          { title: "Market A", side: "BUY", size: "100", price: "0.50", timestamp: "2026-01-01T00:00:00Z", outcome: "Yes" },
          { title: "Market B", side: "BUY", size: "80", price: "0.40", timestamp: "2026-01-01T00:30:00Z", outcome: "Yes" },
          // SELL exits — Market A: sold at 0.70 > entry 0.50 → win. Market B: sold at 0.30 < entry 0.40 → loss
          { title: "Market A", side: "SELL", size: "100", price: "0.70", timestamp: "2026-01-01T01:00:00Z", outcome: "Yes" },
          { title: "Market B", side: "SELL", size: "80", price: "0.30", timestamp: "2026-01-01T02:00:00Z", outcome: "No" },
        ]);
      }
      if (urlStr.includes("positions")) {
        return Response.json([{ title: "Position 1" }, { title: "Position 2" }]);
      }
      return Response.json([]);
    });

    const profile = await analyzeTrader("0xtest", false);
    expect(profile.address).toBe("0xtest");
    expect(profile.activePositions).toBe(2);
    // 2 sells, 1 win (Market A sold higher) → 50%
    expect(profile.winRate).toBe(50);
    expect(profile.avgPositionSize).toBeGreaterThan(0);
    expect(profile.recentTrades).toHaveLength(0); // detailed=false
  });

  it("includes recent trades when detailed=true", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("activity")) {
        return Response.json([
          { title: "Market A", side: "BUY", size: "100", price: "0.50", timestamp: "2026-01-01T00:00:00Z", outcome: "Yes" },
        ]);
      }
      return Response.json([]);
    });

    const profile = await analyzeTrader("0xtest", true);
    expect(profile.recentTrades).toHaveLength(1);
    expect(profile.recentTrades[0].title).toBe("Market A");
  });

  it("handles empty API responses", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json([]));

    const profile = await analyzeTrader("0xtest", false);
    expect(profile.activePositions).toBe(0);
    expect(profile.recentTrades).toHaveLength(0);
    expect(profile.winRate).toBe(0);
    expect(profile.avgPositionSize).toBe(0);
  });

  it("handles API failure gracefully", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    const profile = await analyzeTrader("0xtest", false);
    expect(profile.activePositions).toBe(0);
    expect(profile.winRate).toBe(0);
  });
});

describe("getTraderOpenPositions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns positions from API", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json([
        { title: "Market A", size: "100", avgPrice: "0.50", currentValue: "60" },
        { title: "Market B", size: "50", avgPrice: "0.30", currentValue: "20" },
      ])
    );

    const positions = await getTraderOpenPositions("0xtest", 10);
    expect(positions).toHaveLength(2);
  });

  it("returns empty array on API failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fail"));

    const positions = await getTraderOpenPositions("0xtest");
    expect(positions).toHaveLength(0);
  });

  it("returns empty on non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));

    const positions = await getTraderOpenPositions("0xtest");
    expect(positions).toHaveLength(0);
  });
});
