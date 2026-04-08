import { z } from "zod";
import Database from "better-sqlite3";
import { setConfig, getConfig } from "../db/queries.js";
import { log } from "../utils/logger.js";

export const setSafetyLimitsSchema = z.object({
  max_order_size: z.number().min(1).optional().describe("Max single order size in USDC"),
  max_exposure: z.number().min(1).optional().describe("Max total open position exposure in USDC"),
  max_per_market: z.number().min(1).optional().describe("Max investment in a single market in USDC"),
  min_liquidity: z.number().min(0).optional().describe("Min required market liquidity in USDC"),
  max_spread: z.number().min(0).max(1).optional().describe("Max acceptable spread (e.g. 0.10 = 10%)"),
  show: z.boolean().optional().default(false).describe("Show current limits without changing"),
});

const DEFAULTS: Record<string, string> = {
  max_order_size: "50",
  max_exposure: "200",
  max_per_market: "100",
  min_liquidity: "50",
  max_spread: "0.10",
};

export function handleSetSafetyLimits(db: Database.Database, input: z.infer<typeof setSafetyLimitsSchema>): string {
  if (input.show) {
    return renderLimits(db);
  }

  const updates: string[] = [];

  if (input.max_order_size !== undefined) {
    setConfig(db, "safety_max_order_size", String(input.max_order_size));
    updates.push(`Max order size: $${input.max_order_size}`);
  }
  if (input.max_exposure !== undefined) {
    setConfig(db, "safety_max_exposure", String(input.max_exposure));
    updates.push(`Max exposure: $${input.max_exposure}`);
  }
  if (input.max_per_market !== undefined) {
    setConfig(db, "safety_max_per_market", String(input.max_per_market));
    updates.push(`Max per market: $${input.max_per_market}`);
  }
  if (input.min_liquidity !== undefined) {
    setConfig(db, "safety_min_liquidity", String(input.min_liquidity));
    updates.push(`Min liquidity: $${input.min_liquidity}`);
  }
  if (input.max_spread !== undefined) {
    setConfig(db, "safety_max_spread", String(input.max_spread));
    updates.push(`Max spread: ${(input.max_spread * 100).toFixed(1)}%`);
  }

  if (updates.length === 0) {
    return "No limits provided. Use `show=true` to see current limits, or set values like `max_order_size=50`.";
  }

  log("info", `Safety limits updated: ${updates.join(", ")}`);
  return `Safety limits updated:\n${updates.map((u) => "- " + u).join("\n")}\n\n` + renderLimits(db);
}

function renderLimits(db: Database.Database): string {
  const get = (key: string) => getConfig(db, `safety_${key}`) ?? DEFAULTS[key] ?? "not set";

  let output = "## Safety Limits\n\n";
  output += "| Limit | Value |\n|-------|-------|\n";
  output += `| Max Order Size | $${get("max_order_size")} |\n`;
  output += `| Max Total Exposure | $${get("max_exposure")} |\n`;
  output += `| Max Per Market | $${get("max_per_market")} |\n`;
  output += `| Min Liquidity | $${get("min_liquidity")} |\n`;
  output += `| Max Spread | ${(parseFloat(get("max_spread")) * 100).toFixed(1)}% |\n`;

  return output;
}

export function getSafetyLimit(db: Database.Database, key: string): number {
  const val = getConfig(db, `safety_${key}`);
  return val ? parseFloat(val) : parseFloat(DEFAULTS[key] ?? "0");
}
