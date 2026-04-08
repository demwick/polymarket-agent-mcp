import { log } from "../utils/logger.js";
import { fetchWithRetry } from "../utils/fetch.js";
import { fetchLeaderboardPage } from "./leaderboard.js";

const DATA_API_BASE = "https://data-api.polymarket.com";

export interface FlowSignal {
  conditionId: string;
  title: string;
  side: string;
  traders: { address: string; name: string; amount: number; price: number; rank: number }[];
  totalAmount: number;
  avgPrice: number;
  strength: "strong" | "moderate" | "weak";
}

export interface FlowOptions {
  topN?: number;        // how many top traders to scan (default: 30)
  maxAgeMinutes?: number; // max trade age (default: 60)
  minSignalTraders?: number; // min traders in same market to signal (default: 2)
}

export async function discoverSmartFlow(opts: FlowOptions = {}): Promise<FlowSignal[]> {
  const topN = opts.topN ?? 30;
  const maxAgeMinutes = opts.maxAgeMinutes ?? 60;
  const minSignalTraders = opts.minSignalTraders ?? 2;
  const maxAgeMs = maxAgeMinutes * 60 * 1000;

  log("info", `Scanning smart money flow: top ${topN} traders, last ${maxAgeMinutes}min`);

  // Fetch top traders from leaderboard
  const traders = await fetchLeaderboardPage("ALL", 0, topN);
  if (traders.length === 0) {
    log("warn", "No leaderboard traders found");
    return [];
  }

  // Fetch recent activity for each trader (parallel, batched)
  const batchSize = 5;
  const allTrades: { address: string; name: string; rank: number; conditionId: string; title: string; side: string; amount: number; price: number; timestamp: number }[] = [];

  for (let i = 0; i < traders.length; i += batchSize) {
    const batch = traders.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(async (t) => {
      try {
        const url = `${DATA_API_BASE}/activity?user=${t.proxyWallet}&type=TRADE&limit=10`;
        const res = await fetchWithRetry(url, { retries: 1, timeoutMs: 5_000 });
        if (!res.ok) return [];
        const activities = await res.json();
        return activities.map((a: any) => ({
          address: t.proxyWallet,
          name: t.userName || `Trader-${t.rank}`,
          rank: t.rank,
          conditionId: a.conditionId ?? "",
          title: a.title ?? "",
          side: a.side ?? "",
          amount: parseFloat(a.usdcSize ?? a.size ?? "0"),
          price: parseFloat(a.price ?? "0"),
          timestamp: typeof a.timestamp === "number" ? a.timestamp * 1000 : new Date(a.timestamp).getTime(),
        }));
      } catch {
        return [];
      }
    }));
    allTrades.push(...results.flat());
  }

  // Filter by recency
  const now = Date.now();
  const recentTrades = allTrades.filter((t) => t.conditionId && (now - t.timestamp) < maxAgeMs);

  log("info", `Found ${recentTrades.length} recent trades from ${traders.length} top traders`);

  // Group by conditionId + side
  const groups = new Map<string, typeof recentTrades>();
  for (const t of recentTrades) {
    const key = `${t.conditionId}:${t.side}`;
    const existing = groups.get(key) ?? [];
    // Deduplicate by address
    if (!existing.some((e) => e.address === t.address)) {
      existing.push(t);
    }
    groups.set(key, existing);
  }

  // Build signals (only groups with >= minSignalTraders unique traders)
  const signals: FlowSignal[] = [];
  for (const [key, trades] of groups) {
    if (trades.length < minSignalTraders) continue;

    const totalAmount = trades.reduce((sum, t) => sum + t.amount, 0);
    const avgPrice = trades.reduce((sum, t) => sum + t.price, 0) / trades.length;
    const strength = trades.length >= 5 ? "strong" : trades.length >= 3 ? "moderate" : "weak";

    signals.push({
      conditionId: trades[0].conditionId,
      title: trades[0].title,
      side: trades[0].side,
      traders: trades.map((t) => ({
        address: t.address,
        name: t.name,
        amount: t.amount,
        price: t.price,
        rank: t.rank,
      })),
      totalAmount,
      avgPrice,
      strength,
    });
  }

  // Sort by number of traders (strongest signals first)
  signals.sort((a, b) => b.traders.length - a.traders.length);

  log("info", `Generated ${signals.length} smart money signals`);
  return signals;
}
