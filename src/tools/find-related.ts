import { z } from "zod";
import { fetchWithRetry } from "../utils/fetch.js";
import { log } from "../utils/logger.js";

const GAMMA_API_BASE = "https://gamma-api.polymarket.com";

export const findRelatedSchema = z.object({
  condition_id: z.string().optional().describe("Find markets related to this market"),
  query: z.string().optional().describe("Keyword to find related markets (e.g. 'bitcoin', 'trump')"),
  limit: z.number().int().min(1).max(30).optional().default(10).describe("Maximum number of related markets to return"),
});

export async function handleFindRelated(input: z.infer<typeof findRelatedSchema>): Promise<string> {
  if (!input.condition_id && !input.query) {
    return "Provide a `condition_id` or `query` to find related markets.";
  }

  let tag = input.query ?? "";

  // If condition_id provided, fetch the market first to get its tag/slug
  if (input.condition_id) {
    try {
      const res = await fetchWithRetry(`${GAMMA_API_BASE}/markets?condition_id=${input.condition_id}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const market = data[0];
          // Use first tag or slug words as search
          tag = market.tags?.[0] ?? market.slug?.split("-").slice(0, 2).join(" ") ?? market.question?.split(" ").slice(0, 3).join(" ") ?? "";
        }
      }
    } catch {
      // Fall through to query-based search
    }
  }

  if (!tag) return "Could not determine related topic. Provide a `query` parameter.";

  log("info", `Finding markets related to: "${tag}"`);

  try {
    const encoded = encodeURIComponent(tag);
    const res = await fetchWithRetry(`${GAMMA_API_BASE}/markets?_q=${encoded}&closed=false&order=volume&ascending=false&limit=${input.limit}`);
    if (!res.ok) return "Could not reach the Polymarket API. Try again in a moment.";

    const markets = await res.json();
    if (!Array.isArray(markets) || markets.length === 0) {
      return `No related markets found for "${tag}".`;
    }

    // Filter out the source market if condition_id was provided
    const filtered = input.condition_id
      ? markets.filter((m: any) => m.conditionId !== input.condition_id)
      : markets;

    if (filtered.length === 0) return `No other related markets found for "${tag}".`;

    let output = `## Related Markets: "${tag}" (${filtered.length})\n\n`;
    output += `| # | Market | Volume | End Date | Condition ID |\n`;
    output += `|---|--------|--------|----------|--------------|\n`;

    for (let i = 0; i < filtered.length; i++) {
      const m = filtered[i] as any;
      const question = (m.question ?? "").slice(0, 40);
      const vol = parseFloat(m.volume ?? "0");
      const end = (m.endDate ?? "").slice(0, 10);
      output += `| ${i + 1} | ${question} | $${vol.toFixed(0)} | ${end} | ${(m.conditionId ?? "").slice(0, 12)}... |\n`;
    }

    return output;
  } catch (err) {
    log("error", `Find related failed: ${err}`);
    return "Could not reach the Polymarket API. Try again in a moment.";
  }
}
