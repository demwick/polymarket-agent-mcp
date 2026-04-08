import { z } from "zod";
import { discoverSmartFlow } from "../services/smart-flow.js";
import { checkLicense, requirePro } from "../utils/license.js";

export const discoverFlowSchema = z.object({
  top_traders: z.number().int().min(5).max(100).optional().default(30).describe("Number of top traders to scan"),
  max_age_minutes: z.number().min(5).max(1440).optional().default(60).describe("Max trade age in minutes"),
  min_traders: z.number().int().min(2).max(20).optional().default(2).describe("Min unique traders for a signal"),
});

export async function handleDiscoverFlow(input: z.infer<typeof discoverFlowSchema>): Promise<string> {
  const isPro = await checkLicense();
  if (!isPro) return requirePro("discover_flow");

  const signals = await discoverSmartFlow({
    topN: input.top_traders,
    maxAgeMinutes: input.max_age_minutes,
    minSignalTraders: input.min_traders,
  });

  if (signals.length === 0) {
    return `No smart money signals found in the last ${input.max_age_minutes} minutes from top ${input.top_traders} traders. Try increasing the time window or reducing min_traders.`;
  }

  let output = `## Smart Money Flow (last ${input.max_age_minutes}min)\n\n`;
  output += `Scanned **${input.top_traders}** top traders. Found **${signals.length}** signals.\n\n`;

  for (let i = 0; i < signals.length; i++) {
    const s = signals[i];
    const icon = s.strength === "strong" ? "***" : s.strength === "moderate" ? "**" : "*";
    output += `### ${i + 1}. ${s.title}\n`;
    output += `${icon}${s.strength.toUpperCase()}${icon} — ${s.traders.length} traders ${s.side} | Total: $${s.totalAmount.toFixed(0)} | Avg: $${s.avgPrice.toFixed(2)}\n\n`;

    output += `| Trader | Rank | Amount | Price |\n|--------|------|--------|-------|\n`;
    for (const t of s.traders) {
      output += `| ${t.name.slice(0, 20)} | #${t.rank} | $${t.amount.toFixed(0)} | $${t.price.toFixed(2)} |\n`;
    }
    output += `\n`;
  }

  return output;
}
