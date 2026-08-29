import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { initializeDb } from "../../src/db/schema.js";
import { getTradeHistory } from "../../src/db/queries.js";

const createAndPostOrder = vi.fn();
const createOrDeriveApiKey = vi.fn(async () => ({ key: "k", secret: "s", passphrase: "p" }));
const getOpenOrders = vi.fn();
const cancelAll = vi.fn();
const clobCtor = vi.fn();

vi.mock("@polymarket/clob-client", () => ({
  ClobClient: class {
    constructor(...args: unknown[]) {
      clobCtor(...args);
    }
    createAndPostOrder = createAndPostOrder;
    createOrDeriveApiKey = createOrDeriveApiKey;
    getOpenOrders = getOpenOrders;
    cancelAll = cancelAll;
  },
  Side: { BUY: "BUY", SELL: "SELL" },
  OrderType: { GTC: "GTC", GTD: "GTD" },
}));

vi.mock("@ethersproject/wallet", () => ({
  Wallet: class {
    constructor(public key: string) {}
  },
}));

let liveCredentials = true;
let directory404RiskMode: "off" | "shadow" = "off";
vi.mock("../../src/utils/config.js", () => ({
  getConfig: () => ({
    DAILY_BUDGET: 20,
    CHAIN_ID: 137,
    POLY_FUNDER_ADDRESS: "0xfunder",
    DIRECTORY_404_RISK_MODE: directory404RiskMode,
    DIRECTORY_404_EXECUTION_MODE: "unattended",
    DIRECTORY_404_GEOGRAPHIC_ELIGIBILITY: "unknown",
  }),
  getSigningKey: () => "0x" + "a".repeat(64),
  hasLiveCredentials: () => liveCredentials,
}));

import { TradeExecutor, type TradeOrder } from "../../src/services/trade-executor.js";

function makeOrder(overrides: Partial<TradeOrder> = {}): TradeOrder {
  return {
    traderAddress: "0xabc",
    marketSlug: "test-market",
    conditionId: "cond_test",
    tokenId: "tok_test",
    price: 0.5,
    amount: 5,
    originalAmount: 20,
    tickSize: "0.01",
    negRisk: false,
    ...overrides,
  };
}

describe("TradeExecutor (live mode)", () => {
  let db: Database.Database;
  let executor: TradeExecutor;

  beforeEach(() => {
    vi.clearAllMocks();
    liveCredentials = true;
    directory404RiskMode = "off";
    createAndPostOrder.mockResolvedValue({ success: true, orderID: "ord_1" });
    getOpenOrders.mockResolvedValue([]);
    db = new Database(":memory:");
    initializeDb(db);
    executor = new TradeExecutor(db, "live");
  });

  it("refuses to trade when live credentials are missing", async () => {
    liveCredentials = false;

    const result = await executor.execute(makeOrder());

    expect(result).toMatchObject({ tradeId: -1, mode: "live", status: "failed" });
    expect(result.message).toContain("Live credentials not configured");
    expect(createAndPostOrder).not.toHaveBeenCalled();
    expect(getTradeHistory(db, { limit: 10 })).toHaveLength(0);
  });

  it("posts the order and records it as executed", async () => {
    const result = await executor.execute(makeOrder({ price: 0.42, amount: 7 }));

    expect(createAndPostOrder).toHaveBeenCalledWith(
      { tokenID: "tok_test", price: 0.42, side: "BUY", size: 7 },
      { tickSize: "0.01", negRisk: false },
      "GTC"
    );
    expect(result).toMatchObject({ mode: "live", status: "executed" });

    const [trade] = getTradeHistory(db, { limit: 10 });
    expect(trade).toMatchObject({ mode: "live", status: "executed", side: "BUY", price: 0.42 });
  });

  it("runs an optional shadow preflight without changing order execution", async () => {
    directory404RiskMode = "shadow";
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        receipt_id: "11111111-1111-4111-8111-111111111111",
        outcome_token: "a".repeat(48),
        decision: "review",
        reason_codes: ["TIME_BOUNDARY_UNCLEAR"],
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const result = await executor.execute(makeOrder({ outcome: "YES" }));

    expect(result).toMatchObject({ mode: "live", status: "executed" });
    expect(createAndPostOrder).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      market: "test-market",
      intended_action: "buy_yes",
      estimated_notional_usd: 5,
    });
    fetchMock.mockRestore();
  });

  it("passes GTD through as the order type", async () => {
    await executor.execute(makeOrder({ orderType: "GTD" }));

    expect(createAndPostOrder).toHaveBeenCalledWith(expect.anything(), expect.anything(), "GTD");
  });

  it("sends SELL as the CLOB side when the order says so", async () => {
    await executor.execute(makeOrder({ orderSide: "SELL" }));

    expect(createAndPostOrder).toHaveBeenCalledWith(
      expect.objectContaining({ side: "SELL" }),
      expect.anything(),
      expect.anything()
    );
  });

  it.each([
    ["success is false", { success: false }],
    ["errorMsg is set", { success: true, errorMsg: "insufficient balance" }],
    ["the response is empty", null],
  ])("records a failed trade when %s", async (_label, response) => {
    createAndPostOrder.mockResolvedValue(response);

    const result = await executor.execute(makeOrder());

    expect(result).toMatchObject({ mode: "live", status: "failed" });
    const [trade] = getTradeHistory(db, { limit: 10 });
    expect(trade).toMatchObject({ mode: "live", status: "failed" });
  });

  it("surfaces the CLOB rejection reason", async () => {
    createAndPostOrder.mockResolvedValue({ success: true, errorMsg: "insufficient balance" });

    const result = await executor.execute(makeOrder());

    expect(result.message).toContain("insufficient balance");
  });

  it("records a failed trade when posting throws", async () => {
    createAndPostOrder.mockRejectedValue(new Error("network down"));

    const result = await executor.execute(makeOrder());

    expect(result).toMatchObject({ mode: "live", status: "failed" });
    expect(result.message).toContain("network down");
    expect(getTradeHistory(db, { limit: 10 })[0]).toMatchObject({ status: "failed" });
  });

  it("redacts key-shaped hex from error messages", async () => {
    const key = "0x" + "b".repeat(64);
    createAndPostOrder.mockRejectedValue(new Error(`signing failed for ${key}`));

    const result = await executor.execute(makeOrder());

    expect(result.message).not.toContain(key);
    expect(result.message).toContain("[REDACTED]");
  });

  it("builds the CLOB client once and reuses it", async () => {
    await executor.execute(makeOrder());
    const afterFirst = clobCtor.mock.calls.length;

    await executor.execute(makeOrder());

    expect(clobCtor.mock.calls.length).toBe(afterFirst);
    expect(createOrDeriveApiKey).toHaveBeenCalledTimes(1);
  });

  it("drops the cached client when the mode changes", async () => {
    await executor.execute(makeOrder());
    executor.setMode("live");

    await executor.execute(makeOrder());

    expect(createOrDeriveApiKey).toHaveBeenCalledTimes(2);
  });

  it("routes executeSell through the live path", async () => {
    await executor.executeSell(makeOrder());

    expect(createAndPostOrder).toHaveBeenCalledWith(
      expect.objectContaining({ side: "SELL" }),
      expect.anything(),
      expect.anything()
    );
  });

  describe("cancelAllOrders", () => {
    it("does nothing when there are no open orders", async () => {
      getOpenOrders.mockResolvedValue([]);

      expect(await executor.cancelAllOrders()).toEqual({ cancelled: 0 });
      expect(cancelAll).not.toHaveBeenCalled();
    });

    it("cancels and reports how many were open", async () => {
      getOpenOrders.mockResolvedValue([{ id: "1" }, { id: "2" }, { id: "3" }]);

      expect(await executor.cancelAllOrders()).toEqual({ cancelled: 3 });
      expect(cancelAll).toHaveBeenCalledOnce();
    });
  });
});

describe("TradeExecutor.executeSell (preview mode)", () => {
  let db: Database.Database;

  beforeEach(() => {
    vi.clearAllMocks();
    db = new Database(":memory:");
    initializeDb(db);
  });

  it("records a simulated SELL without touching the CLOB", async () => {
    const executor = new TradeExecutor(db, "preview");

    const result = await executor.executeSell(makeOrder({ amount: 3, price: 0.6 }));

    expect(result).toMatchObject({ mode: "preview", status: "simulated" });
    expect(createAndPostOrder).not.toHaveBeenCalled();
    expect(getTradeHistory(db, { limit: 10 })[0]).toMatchObject({ side: "SELL", mode: "preview" });
  });
});
