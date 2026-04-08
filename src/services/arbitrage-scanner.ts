import { log } from "../utils/logger.js";
import { fetchWithRetry } from "../utils/fetch.js";

const CLOB_API_BASE = "https://clob.polymarket.com";
const GAMMA_API_BASE = "https://gamma-api.polymarket.com";

export interface ArbitrageOpportunity {
  conditionId: string;
  question: string;
  tokens: { outcome: string; price: number; tokenId: string }[];
  totalPrice: number;
  spread: number;
  type: "overpriced" | "underpriced";
  potentialProfit: number;
}

export async function scanArbitrage(limit: number = 50, minSpread: number = 0.02): Promise<ArbitrageOpportunity[]> {
  log("info", `Scanning ${limit} markets for arbitrage (min spread: ${(minSpread * 100).toFixed(1)}%)`);

  try {
    const url = `${GAMMA_API_BASE}/markets?closed=false&order=volume&ascending=false&limit=${limit}`;
    const res = await fetchWithRetry(url);
    if (!res.ok) return [];

    const markets = await res.json();
    const opportunities: ArbitrageOpportunity[] = [];

    for (const market of markets) {
      try {
        const conditionId = market.conditionId;
        if (!conditionId) continue;

        // Parse outcome prices
        let prices: number[] = [];
        const rawPrices = market.outcomePrices;
        if (rawPrices) {
          const parsed = typeof rawPrices === "string" ? JSON.parse(rawPrices) : rawPrices;
          prices = Array.isArray(parsed) ? parsed.map(Number) : [];
        }

        if (prices.length < 2) continue;

        const totalPrice = prices.reduce((sum, p) => sum + p, 0);
        const spread = Math.abs(totalPrice - 1.0);

        if (spread < minSpread) continue;

        // Parse token IDs
        let tokenIds: string[] = [];
        const rawTokens = market.clobTokenIds;
        if (rawTokens) {
          const parsed = typeof rawTokens === "string" ? JSON.parse(rawTokens) : rawTokens;
          tokenIds = Array.isArray(parsed) ? parsed : [];
        }

        const outcomes = market.outcomes ? (typeof market.outcomes === "string" ? JSON.parse(market.outcomes) : market.outcomes) : ["Yes", "No"];

        const tokens = prices.map((p, i) => ({
          outcome: outcomes[i] ?? `Outcome ${i}`,
          price: p,
          tokenId: tokenIds[i] ?? "",
        }));

        opportunities.push({
          conditionId,
          question: market.question ?? "",
          tokens,
          totalPrice,
          spread,
          type: totalPrice > 1.0 ? "overpriced" : "underpriced",
          potentialProfit: spread * 100,
        });
      } catch {
        continue;
      }
    }

    opportunities.sort((a, b) => b.spread - a.spread);
    log("info", `Found ${opportunities.length} arbitrage opportunities`);
    return opportunities;
  } catch (err) {
    log("error", `Arbitrage scan failed: ${err}`);
    return [];
  }
}
