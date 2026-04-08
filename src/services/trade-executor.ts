import Database from "better-sqlite3";
import { ClobClient, Side, OrderType } from "@polymarket/clob-client";
import { Wallet } from "@ethersproject/wallet";
import { recordTrade } from "../db/queries.js";
import { getConfig, hasLiveCredentials } from "../utils/config.js";
import { log } from "../utils/logger.js";

export interface TradeOrder {
  traderAddress: string;
  marketSlug: string | null;
  conditionId: string;
  tokenId: string;
  price: number;
  amount: number;
  originalAmount: number;
  tickSize: string;
  negRisk: boolean;
  orderSide?: "BUY" | "SELL";
  orderType?: "GTC" | "GTD";
}

export interface TradeResult {
  tradeId: number;
  mode: "preview" | "live";
  status: "simulated" | "executed" | "failed";
  message: string;
}

export class TradeExecutor {
  private clobClient: ClobClient | null = null;

  constructor(
    private db: Database.Database,
    private mode: "preview" | "live"
  ) {}

  async execute(order: TradeOrder): Promise<TradeResult> {
    if (this.mode === "preview") {
      return this.simulateTrade(order);
    }
    return this.executeLiveTrade(order);
  }

  private simulateTrade(order: TradeOrder): TradeResult {
    const tradeId = recordTrade(this.db, {
      trader_address: order.traderAddress,
      market_slug: order.marketSlug,
      condition_id: order.conditionId,
      token_id: order.tokenId,
      side: "BUY",
      price: order.price,
      amount: order.amount,
      original_amount: order.originalAmount,
      mode: "preview",
      status: "simulated",
    });

    log("trade", `[PREVIEW] Simulated BUY $${order.amount} @ ${order.price} on ${order.marketSlug}`, {
      trader: order.traderAddress,
      tradeId,
    });

    return { tradeId, mode: "preview", status: "simulated", message: `Simulated: BUY $${order.amount} @ ${order.price}` };
  }

  private async executeLiveTrade(order: TradeOrder): Promise<TradeResult> {
    if (!hasLiveCredentials()) {
      return {
        tradeId: -1,
        mode: "live",
        status: "failed",
        message: "Live credentials not configured",
      };
    }

    try {
      const client = await this.getClobClient();
      const resp = await client.createAndPostOrder(
        {
          tokenID: order.tokenId,
          price: order.price,
          side: Side.BUY,
          size: order.amount,
        },
        { tickSize: order.tickSize as "0.1" | "0.01" | "0.001" | "0.0001", negRisk: order.negRisk },
        order.orderType === "GTD" ? OrderType.GTD : OrderType.GTC
      );

      const tradeId = recordTrade(this.db, {
        trader_address: order.traderAddress,
        market_slug: order.marketSlug,
        condition_id: order.conditionId,
        token_id: order.tokenId,
        side: "BUY",
        price: order.price,
        amount: order.amount,
        original_amount: order.originalAmount,
        mode: "live",
        status: "executed",
      });

      log("trade", `[LIVE] Executed BUY $${order.amount} @ ${order.price} on ${order.marketSlug}`, {
        trader: order.traderAddress,
        tradeId,
        response: resp,
      });

      return { tradeId, mode: "live", status: "executed", message: `Executed: BUY $${order.amount} @ ${order.price}` };
    } catch (err) {
      const tradeId = recordTrade(this.db, {
        trader_address: order.traderAddress,
        market_slug: order.marketSlug,
        condition_id: order.conditionId,
        token_id: order.tokenId,
        side: "BUY",
        price: order.price,
        amount: order.amount,
        original_amount: order.originalAmount,
        mode: "live",
        status: "failed",
      });

      log("error", `[LIVE] Failed BUY on ${order.marketSlug}: ${err}`, { tradeId });

      return { tradeId, mode: "live", status: "failed", message: `Failed: ${err}` };
    }
  }

  private async getClobClient(): Promise<ClobClient> {
    if (this.clobClient) return this.clobClient;

    const config = getConfig();
    const signer = new Wallet(config.POLY_PRIVATE_KEY);
    const host = "https://clob.polymarket.com";

    const creds = await new ClobClient(host, config.CHAIN_ID, signer).createOrDeriveApiKey();

    this.clobClient = new ClobClient(
      host,
      config.CHAIN_ID,
      signer,
      creds,
      1,
      config.POLY_FUNDER_ADDRESS
    );

    return this.clobClient;
  }

  async executeSell(order: TradeOrder): Promise<TradeResult> {
    if (this.mode === "preview") {
      const tradeId = recordTrade(this.db, {
        trader_address: order.traderAddress,
        market_slug: order.marketSlug,
        condition_id: order.conditionId,
        token_id: order.tokenId,
        side: "SELL",
        price: order.price,
        amount: order.amount,
        original_amount: order.originalAmount,
        mode: "preview",
        status: "simulated",
      });
      log("trade", `[PREVIEW] Simulated SELL $${order.amount} @ ${order.price} on ${order.marketSlug}`);
      return { tradeId, mode: "preview", status: "simulated", message: `Simulated: SELL $${order.amount} @ ${order.price}` };
    }

    if (!hasLiveCredentials()) {
      return { tradeId: -1, mode: "live", status: "failed", message: "Live credentials not configured" };
    }

    try {
      const client = await this.getClobClient();
      const orderType = order.orderType === "GTD" ? OrderType.GTD : OrderType.GTC;
      const resp = await client.createAndPostOrder(
        {
          tokenID: order.tokenId,
          price: order.price,
          side: Side.SELL,
          size: order.amount,
        },
        { tickSize: order.tickSize as any, negRisk: order.negRisk },
        orderType
      );

      const tradeId = recordTrade(this.db, {
        trader_address: order.traderAddress,
        market_slug: order.marketSlug,
        condition_id: order.conditionId,
        token_id: order.tokenId,
        side: "SELL",
        price: order.price,
        amount: order.amount,
        original_amount: order.originalAmount,
        mode: "live",
        status: "executed",
      });

      log("trade", `[LIVE] Executed SELL $${order.amount} @ ${order.price} on ${order.marketSlug}`, { response: resp });
      return { tradeId, mode: "live", status: "executed", message: `Executed: SELL $${order.amount} @ ${order.price}` };
    } catch (err) {
      log("error", `[LIVE] Failed SELL on ${order.marketSlug}: ${err}`);
      return { tradeId: -1, mode: "live", status: "failed", message: `Failed: ${err}` };
    }
  }

  setMode(mode: "preview" | "live"): void {
    this.mode = mode;
    this.clobClient = null;
  }

  getMode(): string {
    return this.mode;
  }
}
