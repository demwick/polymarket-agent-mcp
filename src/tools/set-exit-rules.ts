import { z } from "zod";
import Database from "better-sqlite3";
import { setExitRules } from "../db/queries.js";
import { checkLicense, requirePro } from "../utils/license.js";

export const setExitRulesSchema = z.object({
  trade_id: z.number().int().describe("ID of the open position to set exit rules on (from get_positions)"),
  stop_loss: z.number().min(0).max(1).optional().describe("Price at which to sell (stop-loss). E.g. 0.30 means sell if price drops to $0.30"),
  take_profit: z.number().min(0).max(1).optional().describe("Price at which to sell (take-profit). E.g. 0.85 means sell if price rises to $0.85"),
});

export async function handleSetExitRules(db: Database.Database, input: z.infer<typeof setExitRulesSchema>): Promise<string> {
  const isPro = await checkLicense();
  if (!isPro) return requirePro("set_exit_rules");

  if (!input.stop_loss && !input.take_profit) {
    return "Provide at least one of `stop_loss` or `take_profit`. Values are market prices between 0 and 1.";
  }

  const trade = db.prepare("SELECT * FROM trades WHERE id = ? AND status IN ('simulated', 'executed')").get(input.trade_id) as any;
  if (!trade) {
    return `No open position found with ID ${input.trade_id}. Use \`get_positions\` to see your open positions.`;
  }

  // Validate SL is below entry, TP is above entry
  if (input.stop_loss && input.stop_loss >= trade.price) {
    return `Stop-loss ($${input.stop_loss}) must be below entry price ($${trade.price.toFixed(2)}).`;
  }
  if (input.take_profit && input.take_profit <= trade.price) {
    return `Take-profit ($${input.take_profit}) must be above entry price ($${trade.price.toFixed(2)}).`;
  }

  const updated = setExitRules(db, input.trade_id, input.stop_loss ?? null, input.take_profit ?? null);
  if (!updated) return "Failed to set exit rules. Position may have been closed.";

  const parts: string[] = [];
  if (input.stop_loss) parts.push(`SL: $${input.stop_loss}`);
  if (input.take_profit) parts.push(`TP: $${input.take_profit}`);

  return `Exit rules set for position #${input.trade_id} (${trade.market_slug}):\n` +
    `Entry: $${trade.price.toFixed(2)} | ${parts.join(" | ")}\n` +
    `Rules will be checked automatically on each monitor tick.`;
}
