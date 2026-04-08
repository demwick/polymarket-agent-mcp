import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("../../src/utils/fetch.js", () => ({
  fetchWithRetry: vi.fn(async (url: string) => globalThis.fetch(url)),
}));

import { resolveMarketByConditionId } from "../../src/services/market-resolver.js";

describe("resolveMarketByConditionId", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns market info from gamma API", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json([{
        conditionId: "cond123",
        clobTokenIds: ["tok_abc"],
        slug: "test-market",
        question: "Will it happen?",
        minimumTickSize: "0.01",
        negRisk: false,
      }])
    );

    const result = await resolveMarketByConditionId("cond123");
    expect(result).not.toBeNull();
    expect(result!.conditionId).toBe("cond123");
    expect(result!.tokenId).toBe("tok_abc");
    expect(result!.slug).toBe("test-market");
    expect(result!.question).toBe("Will it happen?");
    expect(result!.tickSize).toBe("0.01");
    expect(result!.negRisk).toBe(false);
  });

  it("returns null on empty response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json([]));
    const result = await resolveMarketByConditionId("cond_none");
    expect(result).toBeNull();
  });

  it("returns null on non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 404 }));
    const result = await resolveMarketByConditionId("cond_err");
    expect(result).toBeNull();
  });

  it("returns null on network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));
    const result = await resolveMarketByConditionId("cond_err");
    expect(result).toBeNull();
  });

  it("handles missing optional fields with defaults", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json([{ conditionId: "cond123" }])
    );

    const result = await resolveMarketByConditionId("cond123");
    expect(result).not.toBeNull();
    expect(result!.tokenId).toBe("");
    expect(result!.slug).toBe("");
    expect(result!.tickSize).toBe("0.01");
    expect(result!.negRisk).toBe(false);
  });
});
