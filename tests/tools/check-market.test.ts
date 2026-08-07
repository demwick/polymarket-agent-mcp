import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/services/market-filter.js", () => ({
  checkMarketQuality: vi.fn(),
}));

import { handleCheckMarket } from "../../src/tools/check-market.js";
import { checkMarketQuality } from "../../src/services/market-filter.js";

const mockQuality = vi.mocked(checkMarketQuality);

function passing(midPrice = 0.55) {
  return {
    conditionId: "tok",
    pass: true,
    reasons: [] as string[],
    metrics: { spread: 0.02, bidDepth: 1234, askDepth: 5678, midPrice },
  };
}

function failing(reasons: string[]) {
  return {
    conditionId: "tok",
    pass: false,
    reasons,
    metrics: { spread: 0.18, bidDepth: 12, askDepth: 8, midPrice: 0.5 },
  };
}

describe("handleCheckMarket", () => {
  beforeEach(() => {
    mockQuality.mockResolvedValue(passing());
  });


  it("renders PASS verdict and metrics table", async () => {
    const result = await handleCheckMarket({ token_id: "tok" });
    expect(result).toContain("Market Quality: PASS");
    expect(result).toContain("Spread");
    expect(result).toContain("2.0%");
    expect(result).toContain("Bid Depth");
    expect(result).toContain("$1234");
    expect(result).toContain("Ask Depth");
    expect(result).toContain("$5678");
    expect(result).toContain("Mid Price");
    expect(result).toContain("$0.5500");
    // No issues section on PASS
    expect(result).not.toContain("Issues");
  });

  it("renders FAIL verdict with issues list", async () => {
    mockQuality.mockResolvedValue(failing(["Spread too wide", "Bid depth too thin"]));
    const result = await handleCheckMarket({ token_id: "tok" });
    expect(result).toContain("Market Quality: FAIL");
    expect(result).toContain("Issues");
    expect(result).toContain("Spread too wide");
    expect(result).toContain("Bid depth too thin");
  });

  it("forwards max_spread and min_depth options to the service", async () => {
    await handleCheckMarket({ token_id: "tok", max_spread: 0.05, min_depth: 200 });
    expect(mockQuality).toHaveBeenCalledWith("tok", { maxSpread: 0.05, minDepth: 200 });
  });

  it("passes undefined options when not provided so service uses defaults", async () => {
    await handleCheckMarket({ token_id: "tok" });
    expect(mockQuality).toHaveBeenCalledWith("tok", { maxSpread: undefined, minDepth: undefined });
  });

  it("formats spread as percentage with one decimal", async () => {
    mockQuality.mockResolvedValue({
      conditionId: "tok",
      pass: true,
      reasons: [],
      metrics: { spread: 0.0345, bidDepth: 100, askDepth: 100, midPrice: 0.5 },
    });
    const result = await handleCheckMarket({ token_id: "tok" });
    expect(result).toContain("3.5%");
  });
});
