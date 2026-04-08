import { z } from "zod";
import { scanArbitrage } from "../services/arbitrage-scanner.js";

export const detectArbitrageSchema = z.object({
  limit: z.number().int().min(10).max(200).optional().default(50).describe("Number of top markets to scan"),
  min_spread: z.number().min(0.005).max(0.5).optional().default(0.02).describe("Minimum price spread to report (default: 2%)"),
});

export async function handleDetectArbitrage(input: z.infer<typeof detectArbitrageSchema>): Promise<string> {
  const opps = await scanArbitrage(input.limit, input.min_spread);

  if (opps.length === 0) {
    return `No arbitrage opportunities found in top ${input.limit} markets (min spread: ${(input.min_spread * 100).toFixed(1)}%). Try increasing limit or lowering min_spread.`;
  }

  let output = `## Arbitrage Scanner (${opps.length} found)\n\n`;
  output += `Scanned top ${input.limit} markets by volume.\n\n`;
  output += `| # | Market | Prices | Total | Spread | Type | Profit |\n`;
  output += `|---|--------|--------|-------|--------|------|--------|\n`;

  for (let i = 0; i < Math.min(opps.length, 20); i++) {
    const o = opps[i];
    const prices = o.tokens.map((t) => `${t.outcome}: $${t.price.toFixed(2)}`).join(", ");
    output += `| ${i + 1} | ${o.question.slice(0, 35)} | ${prices} | $${o.totalPrice.toFixed(3)} | ${(o.spread * 100).toFixed(1)}% | ${o.type} | ~${o.potentialProfit.toFixed(1)}% |\n`;
  }

  output += `\n**Overpriced** = total > $1.00 (sell both sides). **Underpriced** = total < $1.00 (buy both sides).\n`;

  return output;
}
