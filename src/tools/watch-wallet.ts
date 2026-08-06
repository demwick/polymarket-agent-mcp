import { z } from "zod";
import Database from "better-sqlite3";
import { addToWatchlist, removeFromWatchlist } from "../db/queries.js";

export const watchWalletSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address").describe("Ethereum wallet address to watch (0x followed by 40 hex characters)"),
  alias: z.string().optional().describe("Friendly name for this wallet (e.g. 'whale_trader_1')"),
  action: z.enum(["add", "remove"]).default("add").describe("add=start watching this wallet, remove=stop watching"),
});

export type WatchWalletInput = z.infer<typeof watchWalletSchema>;

export async function handleWatchWallet(db: Database.Database, input: WatchWalletInput): Promise<string> {
  if (input.action === "remove") {
    removeFromWatchlist(db, input.address);
    return `Removed ${input.address} from watchlist.`;
  }

  addToWatchlist(db, {
    address: input.address,
    alias: input.alias ?? null,
    roi: 0,
    volume: 0,
    pnl: 0,
    trade_count: 0,
  });

  return `Added ${input.alias ?? input.address} to watchlist.`;
}
