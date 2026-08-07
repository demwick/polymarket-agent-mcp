import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";

vi.mock("../../src/utils/fetch.js", () => ({ fetchWithRetry: vi.fn() }));
vi.mock("../../src/services/market-filter.js", () => ({ checkMarketQuality: vi.fn() }));
vi.mock("../../src/services/market-resolver.js", () => ({ resolveMarketByConditionId: vi.fn() }));

import { fetchWithRetry } from "../../src/utils/fetch.js";
import { checkMarketQuality } from "../../src/services/market-filter.js";
import { resolveMarketByConditionId } from "../../src/services/market-resolver.js";
import { initializeDb } from "../../src/db/schema.js";
import { addToWatchlist, getWatchlist, getTradeHistory, recordTrade } from "../../src/db/queries.js";
import { BudgetManager } from "../../src/services/budget-manager.js";
import { TradeExecutor } from "../../src/services/trade-executor.js";
import { WalletMonitor } from "../../src/services/wallet-monitor.js";

const mockFetch = vi.mocked(fetchWithRetry);
const mockQuality = vi.mocked(checkMarketQuality);
const mockResolve = vi.mocked(resolveMarketByConditionId);

const WALLET = "0x" + "a".repeat(40);

function activity(over: Record<string, unknown> = {}) {
  return {
    type: "TRADE",
    side: "BUY",
    size: "20",
    price: "0.5",
    usdcSize: 10,
    asset: "tok_asset",
    timestamp: new Date().toISOString(),
    conditionId: "cond_1",
    title: "Will it rain?",
    slug: "will-it-rain",
    outcome: "Yes",
    transactionHash: "0xhash",
    ...over,
  };
}

const activityResponse = (items: unknown[]) => Response.json(items) as unknown as Response;

// tick() and executeTick() are private; the monitor only ever runs them off a
// timer, so the tests drive them directly rather than waiting on setInterval.
type Ticker = { tick(): Promise<void>; executeTick(): Promise<void> };

describe("WalletMonitor tick", () => {
  let db: Database.Database;
  let monitor: WalletMonitor;
  let executor: TradeExecutor;
  let budget: BudgetManager;

  beforeEach(() => {
    vi.clearAllMocks();
    db = new Database(":memory:");
    initializeDb(db);
    budget = new BudgetManager(db, 100);
    executor = new TradeExecutor(db, "preview");
    monitor = new WalletMonitor(db, budget, executor, 1, 300);

    mockFetch.mockResolvedValue(activityResponse([activity()]));
    mockQuality.mockResolvedValue({ pass: true, reasons: [], spread: 0.01, bidDepth: 500, askDepth: 500, midPrice: 0.5 });
    mockResolve.mockResolvedValue(null);
  });

  function watch(address = WALLET) {
    addToWatchlist(db, { address, alias: "T", roi: 0, volume: 0, pnl: 0, trade_count: 0 });
  }

  it("does nothing when the watchlist is empty", async () => {
    await (monitor as unknown as Ticker).executeTick();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(getTradeHistory(db, { limit: 10 })).toHaveLength(0);
  });

  it("copies a qualifying trade and stamps the wallet as checked", async () => {
    watch();

    await (monitor as unknown as Ticker).executeTick();

    const [trade] = getTradeHistory(db, { limit: 10 });
    expect(trade).toMatchObject({
      trader_address: WALLET,
      condition_id: "cond_1",
      mode: "preview",
      status: "simulated",
    });
    expect(getWatchlist(db)[0].last_checked).toBeTruthy();
  });

  it("skips a market it already holds a position in", async () => {
    watch();
    recordTrade(db, {
      trader_address: "0xother",
      market_slug: "will-it-rain",
      condition_id: "cond_1",
      token_id: "tok_asset",
      side: "BUY",
      price: 0.5,
      amount: 5,
      original_amount: 10,
      mode: "preview",
      status: "simulated",
    });

    await (monitor as unknown as Ticker).executeTick();

    expect(getTradeHistory(db, { limit: 10 })).toHaveLength(1);
    expect(mockQuality).not.toHaveBeenCalled();
  });

  it("skips when the budget has nothing left to allocate", async () => {
    watch();
    vi.spyOn(budget, "calculateCopyAmount").mockReturnValue(0);

    await (monitor as unknown as Ticker).executeTick();

    expect(getTradeHistory(db, { limit: 10 })).toHaveLength(0);
    expect(mockQuality).not.toHaveBeenCalled();
  });

  it("skips when the market fails the quality check", async () => {
    watch();
    mockQuality.mockResolvedValue({ pass: false, reasons: ["spread too wide"], spread: 0.4, bidDepth: 1, askDepth: 1, midPrice: 0.5 });

    await (monitor as unknown as Ticker).executeTick();

    expect(getTradeHistory(db, { limit: 10 })).toHaveLength(0);
  });

  it("resolves market metadata only when the activity has no slug", async () => {
    watch();
    mockFetch.mockResolvedValue(activityResponse([activity({ slug: undefined })]));
    mockResolve.mockResolvedValue({
      slug: "resolved-slug",
      tokenId: "tok_resolved",
      tickSize: "0.001",
      negRisk: true,
      conditionId: "cond_1",
      question: "Will it rain?",
    });

    await (monitor as unknown as Ticker).executeTick();

    expect(mockResolve).toHaveBeenCalledWith("cond_1");
    expect(getTradeHistory(db, { limit: 10 })[0]).toMatchObject({
      market_slug: "resolved-slug",
      token_id: "tok_resolved",
    });
  });

  it("does not resolve metadata when the activity already carries a slug", async () => {
    watch();

    await (monitor as unknown as Ticker).executeTick();

    expect(mockResolve).not.toHaveBeenCalled();
  });

  it("keeps going through the watchlist when one wallet errors", async () => {
    const second = "0x" + "b".repeat(40);
    watch();
    watch(second);
    mockFetch
      .mockRejectedValueOnce(new Error("activity API down"))
      .mockResolvedValue(activityResponse([activity({ conditionId: "cond_2" })]));

    await (monitor as unknown as Ticker).executeTick();

    const trades = getTradeHistory(db, { limit: 10 });
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({ trader_address: second, condition_id: "cond_2" });
  });

  it("treats a non-ok activity response as a wallet error", async () => {
    watch();
    mockFetch.mockResolvedValue({ ok: false, status: 502 } as Response);

    await (monitor as unknown as Ticker).executeTick();

    expect(getTradeHistory(db, { limit: 10 })).toHaveLength(0);
  });

  it("records live-mode spending against the budget", async () => {
    watch();
    executor.setMode("live");
    vi.spyOn(executor, "execute").mockResolvedValue({
      tradeId: 1,
      mode: "live",
      status: "executed",
      message: "Executed",
    });
    const record = vi.spyOn(budget, "recordSpending");

    await (monitor as unknown as Ticker).executeTick();

    expect(record).toHaveBeenCalledOnce();
  });

  it("does not record spending when a live order fails", async () => {
    watch();
    executor.setMode("live");
    vi.spyOn(executor, "execute").mockResolvedValue({
      tradeId: -1,
      mode: "live",
      status: "failed",
      message: "Failed",
    });
    const record = vi.spyOn(budget, "recordSpending");

    await (monitor as unknown as Ticker).executeTick();

    expect(record).not.toHaveBeenCalled();
  });

  describe("position tracking", () => {
    it("checks exits before scanning wallets", async () => {
      const tracker = { checkExits: vi.fn().mockResolvedValue(2) };
      const m = new WalletMonitor(db, budget, executor, 1, 300, tracker as never);

      await (m as unknown as Ticker).executeTick();

      expect(tracker.checkExits).toHaveBeenCalledOnce();
    });

    it("still scans wallets when exit checking throws", async () => {
      watch();
      const tracker = { checkExits: vi.fn().mockRejectedValue(new Error("tracker down")) };
      const m = new WalletMonitor(db, budget, executor, 1, 300, tracker as never);

      await (m as unknown as Ticker).executeTick();

      expect(getTradeHistory(db, { limit: 10 })).toHaveLength(1);
    });
  });

  it("drops a tick that lands while the previous one is still running", async () => {
    watch();
    let release!: () => void;
    mockFetch.mockImplementation(
      () => new Promise((resolve) => { release = () => resolve(activityResponse([])); })
    );

    const first = (monitor as unknown as Ticker).tick();
    await Promise.resolve();
    await (monitor as unknown as Ticker).tick();

    expect(mockFetch).toHaveBeenCalledTimes(1);

    release();
    await first;
  });
});
