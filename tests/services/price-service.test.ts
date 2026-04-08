import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("../../src/utils/fetch.js", () => ({
  fetchWithRetry: vi.fn(async (url: string) => globalThis.fetch(url)),
}));

import { getMarketPrice, getMarketPriceByCondition } from "../../src/services/price-service.js";

describe("getMarketPrice", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns price from order book", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        bids: [{ price: "0.45" }, { price: "0.44" }],
        asks: [{ price: "0.47" }, { price: "0.48" }],
      })
    );

    const result = await getMarketPrice("tok123");
    expect(result).not.toBeNull();
    expect(result!.bid).toBe(0.45);
    expect(result!.ask).toBe(0.47);
    expect(result!.mid).toBeCloseTo(0.46, 4);
    expect(result!.spread).toBeCloseTo(0.02, 4);
    expect(result!.tokenId).toBe("tok123");
  });

  it("handles empty order book", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ bids: [], asks: [] })
    );

    const result = await getMarketPrice("tok_empty");
    expect(result).not.toBeNull();
    expect(result!.bid).toBe(0);
    expect(result!.ask).toBe(0);
    expect(result!.mid).toBe(0);
    expect(result!.spread).toBe(0);
  });

  it("handles bids-only book", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ bids: [{ price: "0.50" }], asks: [] })
    );

    const result = await getMarketPrice("tok_bid");
    expect(result).not.toBeNull();
    expect(result!.bid).toBe(0.5);
    expect(result!.ask).toBe(0);
    expect(result!.mid).toBe(0.5);
  });

  it("returns null on API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));
    const result = await getMarketPrice("tok_err");
    expect(result).toBeNull();
  });

  it("returns null on network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fail"));
    const result = await getMarketPrice("tok_err");
    expect(result).toBeNull();
  });
});

describe("getMarketPriceByCondition", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns price from gamma API with JSON string outcomePrices", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json([{
        outcomePrices: JSON.stringify([0.65, 0.35]),
        clobTokenIds: JSON.stringify(["tok_abc", "tok_def"]),
      }])
    );

    const result = await getMarketPriceByCondition("cond123");
    expect(result).not.toBeNull();
    expect(result!.price).toBeCloseTo(0.65, 4);
    expect(result!.tokenId).toBe("tok_abc");
  });

  it("handles array outcomePrices (not string)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json([{
        outcomePrices: [0.55, 0.45],
        clobTokenIds: ["tok_abc"],
      }])
    );

    const result = await getMarketPriceByCondition("cond123");
    expect(result).not.toBeNull();
    expect(result!.price).toBeCloseTo(0.55, 4);
    expect(result!.tokenId).toBe("tok_abc");
  });

  it("handles comma-separated outcomePrices fallback", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json([{
        outcomePrices: "0.70,0.30",
        clobTokenIds: "tok_xyz",
      }])
    );

    const result = await getMarketPriceByCondition("cond123");
    expect(result).not.toBeNull();
    expect(result!.price).toBeCloseTo(0.70, 4);
  });

  it("returns null on empty response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json([]));
    const result = await getMarketPriceByCondition("cond_none");
    expect(result).toBeNull();
  });

  it("returns null on API failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));
    const result = await getMarketPriceByCondition("cond_err");
    expect(result).toBeNull();
  });

  it("returns null on network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fail"));
    const result = await getMarketPriceByCondition("cond_err");
    expect(result).toBeNull();
  });

  it("handles missing outcomePrices", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json([{ clobTokenIds: ["tok1"] }])
    );

    const result = await getMarketPriceByCondition("cond123");
    expect(result).not.toBeNull();
    expect(result!.price).toBe(0);
  });
});
