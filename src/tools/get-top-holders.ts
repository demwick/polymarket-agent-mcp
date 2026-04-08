import { z } from "zod";
import { fetchWithRetry } from "../utils/fetch.js";
import { log } from "../utils/logger.js";

const DATA_API_BASE = "https://data-api.polymarket.com";

export const getTopHoldersSchema = z.object({
  condition_id: z.string().describe("Polymarket market condition ID to find top holders for"),
  limit: z.number().int().min(1).max(50).optional().default(10).describe("Maximum number of top holders to return"),
});

export async function handleGetTopHolders(input: z.infer<typeof getTopHoldersSchema>): Promise<string> {
  log("info", `Fetching top holders for ${input.condition_id.slice(0, 12)}...`);

  try {
    const url = `${DATA_API_BASE}/positions?market=${input.condition_id}&sortBy=CURRENT&limit=${input.limit}`;
    const res = await fetchWithRetry(url, { retries: 1, timeoutMs: 8_000 });
    if (!res.ok) return "Could not fetch holder data. The API may be unavailable.";

    const positions = await res.json();
    if (!Array.isArray(positions) || positions.length === 0) {
      return "No position holders found for this market.";
    }

    let output = `## Top Holders (${positions.length})\n\n`;
    output += `| # | Trader | Size | Avg Entry | Side | Current Value |\n`;
    output += `|---|--------|------|-----------|------|---------------|\n`;

    for (let i = 0; i < positions.length; i++) {
      const p = positions[i] as any;
      const addr = (p.proxyWallet ?? p.user ?? "").slice(0, 8) + "..";
      const size = parseFloat(p.size ?? "0");
      const avgPrice = parseFloat(p.avgPrice ?? "0");
      const currentValue = parseFloat(p.currentValue ?? "0");
      const side = p.outcome ?? "Yes";

      output += `| ${i + 1} | ${addr} | $${size.toFixed(0)} | $${avgPrice.toFixed(2)} | ${side} | $${currentValue.toFixed(0)} |\n`;
    }

    // Summary stats
    const totalSize = positions.reduce((sum: number, p: any) => sum + parseFloat(p.size ?? "0"), 0);
    const avgEntry = positions.reduce((sum: number, p: any) => sum + parseFloat(p.avgPrice ?? "0"), 0) / positions.length;
    output += `\n**Total held:** $${totalSize.toFixed(0)} | **Avg entry:** $${avgEntry.toFixed(2)}\n`;

    return output;
  } catch (err) {
    log("error", `Top holders failed: ${err}`);
    return "Could not reach the Polymarket API. Try again in a moment.";
  }
}
