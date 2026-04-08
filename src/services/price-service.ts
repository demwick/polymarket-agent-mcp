import { log } from "../utils/logger.js";
import { fetchWithRetry } from "../utils/fetch.js";

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
    const res = await fetchWithRetry(url);
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
    const res = await fetchWithRetry(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const market = data[0];
    const rawPrices = market.outcomePrices;
    let price = 0;
    if (rawPrices) {
      try {
        const parsed = typeof rawPrices === "string" ? JSON.parse(rawPrices) : rawPrices;
        price = Array.isArray(parsed) ? parseFloat(parsed[0]) : parseFloat(String(rawPrices));
      } catch {
        price = parseFloat(String(rawPrices).split(",")[0] ?? "0");
      }
    }
    const rawTokenIds = market.clobTokenIds;
    let tokenId = "";
    if (rawTokenIds) {
      try {
        const parsed = typeof rawTokenIds === "string" ? JSON.parse(rawTokenIds) : rawTokenIds;
        tokenId = Array.isArray(parsed) ? parsed[0] : String(rawTokenIds);
      } catch {
        tokenId = String(rawTokenIds);
      }
    }

    return { price, tokenId };
  } catch (err) {
    log("error", `Failed to get price by condition ${conditionId}: ${err}`);
    return null;
  }
}
