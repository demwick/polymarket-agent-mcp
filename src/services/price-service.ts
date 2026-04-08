import { log } from "../utils/logger.js";

const CLOB_API_BASE = "https://clob.polymarket.com";
const GAMMA_API_BASE = "https://gamma-api.polymarket.com";

export interface MarketPrice {
  tokenId: string;
  bid: number;
  ask: number;
  mid: number;
  spread: number;
  lastPrice: number;
}

export async function getMarketPrice(tokenId: string): Promise<MarketPrice | null> {
  try {
    const url = `${CLOB_API_BASE}/book?token_id=${tokenId}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const book = await res.json();

    const bestBid = book.bids?.length > 0 ? parseFloat(book.bids[0].price) : 0;
    const bestAsk = book.asks?.length > 0 ? parseFloat(book.asks[0].price) : 0;
    const mid = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : bestBid || bestAsk;
    const spread = bestAsk && bestBid ? bestAsk - bestBid : 0;

    return { tokenId, bid: bestBid, ask: bestAsk, mid, spread, lastPrice: mid };
  } catch (err) {
    log("error", `Failed to get price for ${tokenId}: ${err}`);
    return null;
  }
}

export async function getMarketPriceByCondition(conditionId: string): Promise<{ price: number; tokenId: string } | null> {
  try {
    const url = `${GAMMA_API_BASE}/markets?condition_id=${conditionId}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const market = data[0];
    const prices = market.outcomePrices;
    const price = Array.isArray(prices) ? parseFloat(prices[0]) : parseFloat((prices ?? "").split(",")[0] ?? "0");
    const tokenId = market.clobTokenIds?.[0] ?? "";

    return { price, tokenId };
  } catch (err) {
    log("error", `Failed to get price by condition ${conditionId}: ${err}`);
    return null;
  }
}
