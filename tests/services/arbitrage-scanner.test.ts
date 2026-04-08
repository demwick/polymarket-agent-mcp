import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("../../src/utils/fetch.js", () => ({
  fetchWithRetry: vi.fn(async (url: string) => globalThis.fetch(url)),
}));

import { scanArbitrage } from "../../src/services/arbitrage-scanner.js";

describe("ArbitrageScanner", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("detects overpriced market (YES+NO > 1.00)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json([
      {
        conditionId: "cond1",
        question: "Will BTC hit 100k?",
        outcomePrices: "[0.55, 0.50]",
        clobTokenIds: '["tok1","tok2"]',
        outcomes: '["Yes","No"]',
        volume: "5000",
      },
    ]));

    const results = await scanArbitrage(10, 0.01);
    expect(results.length).toBe(1);
    expect(results[0].type).toBe("overpriced");
    expect(results[0].totalPrice).toBeCloseTo(1.05, 2);
    expect(results[0].spread).toBeCloseTo(0.05, 2);
  });

  it("detects underpriced market (YES+NO < 1.00)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json([
      {
        conditionId: "cond2",
        question: "ETH merge?",
        outcomePrices: "[0.40, 0.55]",
        clobTokenIds: '["tok1","tok2"]',
        outcomes: '["Yes","No"]',
        volume: "3000",
      },
    ]));

    const results = await scanArbitrage(10, 0.01);
    expect(results.length).toBe(1);
    expect(results[0].type).toBe("underpriced");
  });

  it("filters out markets within spread threshold", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json([
      {
        conditionId: "cond3",
        question: "Normal market",
        outcomePrices: "[0.50, 0.50]",
        clobTokenIds: '["tok1","tok2"]',
        volume: "1000",
      },
    ]));

    const results = await scanArbitrage(10, 0.02);
    expect(results.length).toBe(0);
  });

  it("returns empty on API failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("timeout"));
    const results = await scanArbitrage(10);
    expect(results.length).toBe(0);
  });
});
