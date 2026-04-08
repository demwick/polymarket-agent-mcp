import { log } from "../utils/logger.js";
import { fetchWithRetry } from "../utils/fetch.js";

const GAMMA_API_BASE = "https://gamma-api.polymarket.com";

export interface MarketInfo {
  conditionId: string;
  tokenId: string;
  slug: string;
  question: string;
  tickSize: string;
  negRisk: boolean;
}

export async function resolveMarketByConditionId(conditionId: string): Promise<MarketInfo | null> {
  try {
    const url = `${GAMMA_API_BASE}/markets?condition_id=${conditionId}`;
    const response = await fetchWithRetry(url);
    if (!response.ok) return null;

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const market = data[0];
    return {
      conditionId: market.conditionId ?? conditionId,
      tokenId: market.clobTokenIds?.[0] ?? "",
      slug: market.slug ?? "",
      question: market.question ?? "",
      tickSize: market.minimumTickSize ?? "0.01",
      negRisk: market.negRisk ?? false,
    };
  } catch (err) {
    log("error", `Failed to resolve market ${conditionId}`, { error: String(err) });
    return null;
  }
}
