import { z } from "zod";
import Database from "better-sqlite3";

export const logCycleSchema = z.object({
  agent_name: z.string().describe("Name of the AI agent logging this cycle"),
  strategy: z.string().describe("Trading strategy used in this cycle (e.g. 'copy_top_traders', 'stink_bids')"),
  status: z.enum(["ok", "warning", "risk_alert", "error"]).default("ok").describe("Cycle outcome: ok=normal, warning=minor issue, risk_alert=needs attention, error=failed"),
  positions_open: z.number().int().default(0).describe("Number of currently open positions"),
  positions_closed: z.number().int().default(0).describe("Number of positions closed this cycle"),
  realized_pnl: z.number().default(0).describe("Realized profit/loss in USDC from closed positions"),
  unrealized_pnl: z.number().default(0).describe("Unrealized profit/loss in USDC from open positions"),
  win_rate: z.number().default(0).describe("Win rate as a decimal (0.0-1.0)"),
  budget_used: z.number().default(0).describe("Amount of daily budget spent in USDC"),
  budget_limit: z.number().default(0).describe("Total daily budget limit in USDC"),
  actions_taken: z.string().optional().describe("Comma-separated list of actions taken (e.g. 'bought YES on Bitcoin market')"),
  notes: z.string().optional().describe("Free-text notes about this cycle"),
});

export type LogCycleInput = z.infer<typeof logCycleSchema>;

export function handleLogCycle(db: Database.Database, input: LogCycleInput): string {
  db.prepare(`
    INSERT INTO agent_cycles (agent_name, strategy, status, positions_open, positions_closed, realized_pnl, unrealized_pnl, win_rate, budget_used, budget_limit, actions_taken, notes)
    VALUES (@agent_name, @strategy, @status, @positions_open, @positions_closed, @realized_pnl, @unrealized_pnl, @win_rate, @budget_used, @budget_limit, @actions_taken, @notes)
  `).run(input);

  return `Cycle logged for ${input.agent_name}`;
}
