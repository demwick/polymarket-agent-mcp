import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleAnalyzeTrader } from "../../src/tools/analyze-trader.js";

vi.mock("../../src/utils/license.js", () => ({
  checkLicense: vi.fn().mockResolvedValue(false),
  requirePro: vi.fn((name: string) => `${name} requires Pro`),
  resetLicenseCache: vi.fn(),
}));

vi.mock("../../src/services/trader-analyzer.js", () => ({
  analyzeTrader: vi.fn().mockResolvedValue({
    address: "0xtestaddr",
    activePositions: 5,
    recentTrades: [],
    totalPnl: 0,
    winRate: 72.5,
    avgPositionSize: 125.50,
  }),
}));

import { checkLicense } from "../../src/utils/license.js";
import { analyzeTrader } from "../../src/services/trader-analyzer.js";
const mockCheckLicense = vi.mocked(checkLicense);
const mockAnalyze = vi.mocked(analyzeTrader);

describe("handleAnalyzeTrader", () => {
  beforeEach(() => {
    mockCheckLicense.mockResolvedValue(false);
  });

  it("renders trader analysis with basic stats", async () => {
    const result = await handleAnalyzeTrader({ address: "0xtestaddr" });
    expect(result).toContain("Trader Analysis");
    expect(result).toContain("Active Positions");
    expect(result).toContain("5");
    expect(result).toContain("72.5%");
    expect(result).toContain("$125.50");
  });

  it("shows upgrade message for free tier", async () => {
    const result = await handleAnalyzeTrader({ address: "0xtestaddr" });
    expect(result).toContain("Upgrade to Pro");
  });

  it("shows recent trades for Pro tier", async () => {
    mockCheckLicense.mockResolvedValue(true);
    mockAnalyze.mockResolvedValue({
      address: "0xtestaddr",
      activePositions: 3,
      recentTrades: [
        { title: "Will BTC hit 100k?", side: "BUY", size: 50, price: 0.65, timestamp: "2026-01-01T10:30:00Z", outcome: "Yes" },
      ],
      totalPnl: 0,
      winRate: 80,
      avgPositionSize: 200,
    });

    const result = await handleAnalyzeTrader({ address: "0xtestaddr" });
    expect(result).toContain("Recent Trades");
    expect(result).toContain("Will BTC hit 100k?");
    expect(result).toContain("BUY");
  });
});
