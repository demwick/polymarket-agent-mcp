import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleGetTraderPositions } from "../../src/tools/get-trader-positions.js";

vi.mock("../../src/utils/license.js", () => ({
  checkLicense: vi.fn().mockResolvedValue(true),
  requirePro: vi.fn((name: string) => `${name} requires Pro`),
  resetLicenseCache: vi.fn(),
}));

vi.mock("../../src/services/trader-analyzer.js", () => ({
  getTraderOpenPositions: vi.fn().mockResolvedValue([]),
}));

import { checkLicense } from "../../src/utils/license.js";
import { getTraderOpenPositions } from "../../src/services/trader-analyzer.js";
const mockCheckLicense = vi.mocked(checkLicense);
const mockGetPositions = vi.mocked(getTraderOpenPositions);

describe("handleGetTraderPositions", () => {
  beforeEach(() => {
    mockCheckLicense.mockResolvedValue(true);
  });

  it("requires Pro license", async () => {
    mockCheckLicense.mockResolvedValue(false);
    const result = await handleGetTraderPositions({ address: "0xtest", limit: 20 });
    expect(result).toContain("Pro");
  });

  it("returns message when no positions", async () => {
    mockGetPositions.mockResolvedValue([]);
    const result = await handleGetTraderPositions({ address: "0xabc123def456abc123def456abc123def456abc1", limit: 20 });
    expect(result).toContain("No open positions");
  });

  it("renders positions table", async () => {
    mockGetPositions.mockResolvedValue([
      { title: "BTC 100k by EOY", size: "500", avgPrice: "0.45", currentValue: "300" },
      { title: "ETH flips BTC", size: "200", avgPrice: "0.15", currentValue: "25" },
    ]);

    const result = await handleGetTraderPositions({ address: "0xabc123def456abc123def456abc123def456abc1", limit: 20 });
    expect(result).toContain("Positions for 0xabc1");
    expect(result).toContain("BTC 100k by EOY");
    expect(result).toContain("ETH flips BTC");
    expect(result).toContain("500.00");
    expect(result).toContain("$0.45");
  });
});
