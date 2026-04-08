import { describe, it, expect } from "vitest";
import { filterNewTrades, type RawActivity } from "../../src/services/wallet-monitor.js";

describe("filterNewTrades", () => {
  const now = Date.now();

  const mockActivities: RawActivity[] = [
    { type: "TRADE", side: "BUY", size: "10", price: "0.45", asset: "tok1", timestamp: new Date(now - 60_000).toISOString(), conditionId: "c1", title: "Market A", outcome: "Yes", transactionHash: "0x1" },
    { type: "TRADE", side: "SELL", size: "5", price: "0.60", asset: "tok2", timestamp: new Date(now - 120_000).toISOString(), conditionId: "c2", title: "Market B", outcome: "No", transactionHash: "0x2" },
    { type: "TRADE", side: "BUY", size: "2", price: "0.30", asset: "tok3", timestamp: new Date(now - 60_000).toISOString(), conditionId: "c3", title: "Market C", outcome: "Yes", transactionHash: "0x3" },
    { type: "TRADE", side: "BUY", size: "50", price: "0.80", asset: "tok4", timestamp: new Date(now - 400_000).toISOString(), conditionId: "c4", title: "Market D", outcome: "Yes", transactionHash: "0x4" },
  ];

  it("filters only BUY trades", () => {
    const result = filterNewTrades(mockActivities, 0, 600);
    expect(result.every((t) => t.side === "BUY")).toBe(true);
  });

  it("filters out trades older than maxAge", () => {
    const result = filterNewTrades(mockActivities, 0, 300);
    expect(result.find((t) => t.conditionId === "c4")).toBeUndefined();
  });

  it("filters by minimum conviction amount", () => {
    const result = filterNewTrades(mockActivities, 3, 600);
    expect(result.find((t) => t.conditionId === "c1")).toBeDefined();
    expect(result.find((t) => t.conditionId === "c3")).toBeUndefined();
  });
});
