import Database from "better-sqlite3";
import { getOpenPositions, updateTradeExit, getDailySpent, addDailySpent } from "../db/queries.js";
import { log } from "../utils/logger.js";
import { fetchWithRetry } from "../utils/fetch.js";

const DATA_API_BASE = "https://data-api.polymarket.com";
const CLOB_API_BASE = "https://clob.polymarket.com";

export class PositionTracker {
  constructor(private db: Database.Database) {}

  /** Return closed amount + pnl back to daily budget */
  private recycleBudget(amount: number, pnl: number): void {
    const today = new Date().toISOString().split("T")[0];
    const returnAmount = amount + Math.max(0, pnl); // return principal + profit (not losses)
    const spent = getDailySpent(this.db, today);
    if (spent <= 0) return;
    // Reduce daily spent (don't go below 0)
    const reduction = Math.min(returnAmount, spent);
    this.db.prepare("UPDATE daily_budget SET spent = MAX(0, spent - ?) WHERE date = ?").run(reduction, today);
    log("monitor", `Budget recycled: +$${reduction.toFixed(2)} from resolved position`);
  }

  async checkExits(): Promise<number> {
    const openPositions = getOpenPositions(this.db);
    if (openPositions.length === 0) return 0;

    let closedCount = 0;

    for (const pos of openPositions) {
      try {
        // Guard: re-check position is still open (could have been closed by concurrent operation)
        const stillOpen = this.db.prepare(
          "SELECT 1 FROM trades WHERE id = ? AND status IN ('simulated', 'executed')"
        ).get(pos.id!);
        if (!stillOpen) continue;

        // Check 1: Did the trader exit?
        const traderExited = await this.checkTraderExit(
          pos.trader_address,
          pos.condition_id!
        );
        if (traderExited) {
          const exitPrice = await this.getCurrentPrice(pos.condition_id!);
          const pnl = this.calculatePnl(pos.price, exitPrice, pos.amount);
          updateTradeExit(this.db, pos.id!, exitPrice, "trader_exit", pnl);
          this.recycleBudget(pos.amount, pnl);
          log("trade", `Position closed (trader exit): ${pos.market_slug} P&L: $${pnl.toFixed(2)}`);
          closedCount++;
          continue;
        }

        // Check 2: Did the market resolve?
        const resolution = await this.checkMarketResolved(pos.condition_id!, pos.token_id!);
        if (resolution !== null) {
          const pnl = this.calculatePnl(pos.price, resolution, pos.amount);
          updateTradeExit(this.db, pos.id!, resolution, "market_resolved", pnl);
          this.recycleBudget(pos.amount, pnl);
          log("trade", `Position resolved: ${pos.market_slug} → ${resolution === 1 ? "WIN" : "LOSS"} P&L: $${pnl.toFixed(2)}`);
          closedCount++;
        }
      } catch (err) {
        log("error", `Error tracking position ${pos.id}: ${err}`);
      }
    }

    return closedCount;
  }

  private async checkTraderExit(traderAddress: string, conditionId: string): Promise<boolean> {
    try {
      const url = `${DATA_API_BASE}/activity?user=${traderAddress}&type=TRADE&side=SELL&limit=20`;
      const res = await fetchWithRetry(url);
      if (!res.ok) return false;
      const activities = await res.json();
      return activities.some((a: any) => a.conditionId === conditionId);
    } catch {
      return false;
    }
  }

  private async checkMarketResolved(conditionId: string, tokenId: string): Promise<number | null> {
    try {
      const url = `${CLOB_API_BASE}/markets/${conditionId}`;
      const res = await fetchWithRetry(url);
      if (!res.ok) return null;
      const market = await res.json();
      if (!market.closed) return null;

      const tokens = market.tokens;
      if (!Array.isArray(tokens)) return null;

      // Find our token to check if it won
      const ourToken = tokens.find((t: any) => t.token_id === tokenId);
      if (!ourToken) {
        // Fallback: check any winner
        const winner = tokens.find((t: any) => t.winner === true);
        if (winner) return winner.price ?? 1.0;
        // No winners declared yet
        if (tokens.every((t: any) => t.winner === undefined || t.winner === null)) return null;
        return 0.0;
      }

      // Winner status not yet set — market closed but not resolved
      if (ourToken.winner === undefined || ourToken.winner === null) return null;

      return ourToken.winner ? 1.0 : 0.0;
    } catch {
      return null;
    }
  }

  private async getCurrentPrice(conditionId: string): Promise<number> {
    try {
      const url = `${CLOB_API_BASE}/markets/${conditionId}`;
      const res = await fetchWithRetry(url);
      if (!res.ok) return 0;
      const market = await res.json();
      const tokens = market.tokens;
      if (!Array.isArray(tokens) || tokens.length === 0) return 0;
      // Return price of first token (the one we bought — typically "Yes" side)
      return parseFloat(tokens[0].price ?? "0");
    } catch {
      return 0;
    }
  }

  private calculatePnl(entryPrice: number, exitPrice: number, amount: number): number {
    if (entryPrice === 0) return 0;
    return ((exitPrice - entryPrice) * amount) / entryPrice;
  }
}
