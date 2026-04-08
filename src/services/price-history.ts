import { log } from "../utils/logger.js";
import { fetchWithRetry } from "../utils/fetch.js";

const CLOB_API_BASE = "https://clob.polymarket.com";

export interface PricePoint {
  timestamp: string;
  price: number;
}

export interface PriceHistory {
  tokenId: string;
  interval: string;
  points: PricePoint[];
  high: number;
  low: number;
  open: number;
  close: number;
  change: number;
  changePct: number;
}

export type Interval = "1h" | "6h" | "1d" | "1w" | "1m";

const INTERVAL_SECONDS: Record<Interval, number> = {
  "1h": 3600,
  "6h": 21600,
  "1d": 86400,
  "1w": 604800,
  "1m": 2592000,
};

export async function getPriceHistory(
  tokenId: string,
  interval: Interval = "1d",
  fidelity: number = 60
): Promise<PriceHistory> {
  const startTs = Math.floor(Date.now() / 1000) - INTERVAL_SECONDS[interval];
  const url = `${CLOB_API_BASE}/prices-history?market=${tokenId}&startTs=${startTs}&fidelity=${fidelity}`;

  log("info", `Fetching price history: ${tokenId} interval=${interval}`);

  try {
    const res = await fetchWithRetry(url, { retries: 1, timeoutMs: 8_000 });
    if (!res.ok) {
      log("warn", `Price history API returned ${res.status} for ${tokenId}`);
      return emptyHistory(tokenId, interval);
    }

    const data = await res.json();
    const history = data.history ?? [];

    if (history.length === 0) return emptyHistory(tokenId, interval);

    const points: PricePoint[] = history.map((h: any) => ({
      timestamp: new Date(h.t * 1000).toISOString(),
      price: parseFloat(h.p),
    }));

    const prices = points.map((p) => p.price);
    const open = prices[0];
    const close = prices[prices.length - 1];
    const high = Math.max(...prices);
    const low = Math.min(...prices);
    const change = close - open;
    const changePct = open > 0 ? (change / open) * 100 : 0;

    return { tokenId, interval, points, high, low, open, close, change, changePct };
  } catch (err) {
    log("error", `Failed to fetch price history for ${tokenId}: ${err}`);
    return emptyHistory(tokenId, interval);
  }
}

function emptyHistory(tokenId: string, interval: string): PriceHistory {
  return { tokenId, interval, points: [], high: 0, low: 0, open: 0, close: 0, change: 0, changePct: 0 };
}
