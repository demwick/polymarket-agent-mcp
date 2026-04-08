import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("../../src/utils/fetch.js", () => ({
  fetchWithRetry: vi.fn(async (url: string, opts?: any) => globalThis.fetch(url)),
}));

import { getPriceHistory } from "../../src/services/price-history.js";

describe("PriceHistory", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("returns OHLC and change from history data", async () => {
    const now = Math.floor(Date.now() / 1000);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      history: [
        { t: now - 3600, p: 0.50 },
        { t: now - 2400, p: 0.55 },
        { t: now - 1200, p: 0.48 },
        { t: now, p: 0.60 },
      ],
    }));

    const result = await getPriceHistory("tok_test", "1d");
    expect(result.points.length).toBe(4);
    expect(result.open).toBe(0.50);
    expect(result.close).toBe(0.60);
    expect(result.high).toBe(0.60);
    expect(result.low).toBe(0.48);
    expect(result.change).toBeCloseTo(0.10, 4);
    expect(result.changePct).toBeCloseTo(20, 0);
  });

  it("returns empty history on API failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("timeout"));

    const result = await getPriceHistory("tok_fail", "1h");
    expect(result.points.length).toBe(0);
    expect(result.open).toBe(0);
  });

  it("returns empty history when no data", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ history: [] }));

    const result = await getPriceHistory("tok_empty", "1w");
    expect(result.points.length).toBe(0);
  });
});
