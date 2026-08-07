import { z } from "zod";
import Database from "better-sqlite3";
import { discoverTraders } from "../services/leaderboard.js";
import { addToWatchlist } from "../db/queries.js";

export const discoverTradersSchema = z.object({
  pages: z.number().int().min(1).max(10).optional().default(3).describe("Number of leaderboard pages to fetch (1 page = 25 traders)"),
  period: z.enum(["ALL", "WEEK"]).optional().default("ALL").describe("Leaderboard time range: ALL for all-time, WEEK for last 7 days"),
  min_volume: z.number().optional().default(1000).describe("Minimum total trading volume in USDC to include a trader"),
  min_pnl: z.number().optional().default(0).describe("Minimum profit/loss in USDC to include a trader"),
  auto_watch: z.boolean().optional().default(false).describe("Automatically add discovered traders to your watchlist"),
});

export type DiscoverTradersInput = z.infer<typeof discoverTradersSchema>;

export async function handleDiscoverTraders(db: Database.Database, input: DiscoverTradersInput): Promise<string> {
  const traders = await discoverTraders({
    pages: input.pages,
    period: input.period,
    minVolume: input.min_volume,
    minPnl: input.min_pnl,
  });

  if (traders.length === 0) {
    return "No traders found matching the criteria.";
  }

  if (input.auto_watch) {
    for (const t of traders) {
      addToWatchlist(db, {
        address: t.address,
        alias: t.name,
        roi: 0,
        volume: t.volume,
        pnl: t.pnl,
        trade_count: 0,
      });
    }
  }

  const header = `## Discovered Traders (${traders.length})\n\nPeriod: ${input.period} | Pages: ${input.pages}\n`;
  const tableHeader = "| # | Name | Address | PnL | Volume | Rank |\n|---|------|---------|-----|--------|------|\n";
  const rows = traders.map((t, i) =>
    `| ${i + 1} | ${t.name} | ${t.address.slice(0, 6)}...${t.address.slice(-4)} | $${t.pnl.toLocaleString()} | $${t.volume.toLocaleString()} | ${t.rank} |`
  ).join("\n");

  const footer = input.auto_watch
    ? `\n\n${traders.length} traders added to watchlist.`
    : `\n\nUse \`watchlist.add\` to add traders to your watchlist.`;

  return header + tableHeader + rows + footer;
}
