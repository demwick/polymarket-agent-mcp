import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/utils/fetch.js", () => ({ fetchWithRetry: vi.fn() }));

import { fetchWithRetry } from "../../src/utils/fetch.js";
import {
  filterTraders,
  fetchLeaderboardPage,
  discoverTraders,
  type RawLeaderboardEntry,
} from "../../src/services/leaderboard.js";

const mockFetch = vi.mocked(fetchWithRetry);
const entry = (over: Partial<RawLeaderboardEntry> = {}): RawLeaderboardEntry => ({
  proxyWallet: "0xaaa",
  userName: "Alpha",
  pnl: 15000,
  vol: 50000,
  rank: 1,
  ...over,
});
const okResponse = (body: unknown) => Response.json(body) as unknown as Response;

describe("filterTraders", () => {
  const mockTraders: RawLeaderboardEntry[] = [
    { proxyWallet: "0xaaa", userName: "Alpha", pnl: 15000, vol: 50000, rank: 1 },
    { proxyWallet: "0xbbb", userName: "Beta", pnl: -500, vol: 2000, rank: 2 },
    { proxyWallet: "0xccc", userName: "Gamma", pnl: 200, vol: 300, rank: 3 },
    { proxyWallet: "0xddd", userName: "Delta", pnl: 8000, vol: 25000, rank: 4 },
  ];

  it("filters by minimum volume", () => {
    const result = filterTraders(mockTraders, { minVolume: 10000, minPnl: 0 });
    expect(result.every((t) => t.vol >= 10000)).toBe(true);
    expect(result).toHaveLength(2);
  });

  it("filters out negative PnL", () => {
    const result = filterTraders(mockTraders, { minVolume: 0, minPnl: 0 });
    expect(result.every((t) => t.pnl >= 0)).toBe(true);
    expect(result.find((t) => t.proxyWallet === "0xbbb")).toBeUndefined();
  });

  it("returns empty array when no traders match", () => {
    const result = filterTraders(mockTraders, { minVolume: 999999, minPnl: 0 });
    expect(result).toHaveLength(0);
  });
});

describe("fetchLeaderboardPage", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("requests the given period, offset and limit", async () => {
    mockFetch.mockResolvedValue(okResponse([entry()]));

    const result = await fetchLeaderboardPage("WEEK", 50, 25);

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("timePeriod=WEEK");
    expect(url).toContain("offset=50");
    expect(url).toContain("limit=25");
    expect(result).toHaveLength(1);
  });

  it("throws with the status when the API responds with an error", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503, statusText: "Service Unavailable" } as Response);

    await expect(fetchLeaderboardPage("ALL", 0, 25)).rejects.toThrow("503");
  });
});

describe("discoverTraders", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("walks three pages by default and pages by 25", async () => {
    mockFetch.mockResolvedValue(okResponse([]));

    await discoverTraders();

    expect(mockFetch).toHaveBeenCalledTimes(3);
    const offsets = mockFetch.mock.calls.map((c) => new URL(c[0] as string).searchParams.get("offset"));
    expect(offsets).toEqual(["0", "25", "50"]);
  });

  it("applies the volume and pnl floors", async () => {
    mockFetch.mockResolvedValue(
      okResponse([
        entry({ proxyWallet: "0xkeep", vol: 50000, pnl: 15000 }),
        entry({ proxyWallet: "0xthin", vol: 100, pnl: 15000 }),
        entry({ proxyWallet: "0xlosing", vol: 50000, pnl: -20 }),
      ])
    );

    const result = await discoverTraders({ pages: 1, minVolume: 1000, minPnl: 0 });

    expect(result.map((t) => t.address)).toEqual(["0xkeep"]);
  });

  it("keeps the remaining pages when one page fails", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("upstream down"))
      .mockResolvedValue(okResponse([entry({ proxyWallet: "0xsecond" })]));

    const result = await discoverTraders({ pages: 2 });

    expect(result.map((t) => t.address)).toEqual(["0xsecond"]);
  });

  it("returns nothing when every page fails", async () => {
    mockFetch.mockRejectedValue(new Error("upstream down"));

    await expect(discoverTraders({ pages: 2 })).resolves.toEqual([]);
  });

  it("falls back to a rank-derived name when userName is blank", async () => {
    mockFetch.mockResolvedValue(okResponse([entry({ userName: "", rank: 7 })]));

    const [trader] = await discoverTraders({ pages: 1 });

    expect(trader.name).toBe("Trader-7");
  });

  it("echoes the requested period on each profile", async () => {
    mockFetch.mockResolvedValue(okResponse([entry()]));

    const [trader] = await discoverTraders({ pages: 1, period: "WEEK" });

    expect(trader).toMatchObject({ period: "WEEK", address: "0xaaa", volume: 50000 });
  });
});
