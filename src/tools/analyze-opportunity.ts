import { z } from "zod";
import { getMarketPriceByCondition, getMarketPrice } from "../services/price-service.js";
import { checkMarketQuality } from "../services/market-filter.js";
import { getPriceHistory } from "../services/price-history.js";
import { log } from "../utils/logger.js";

export const analyzeOpportunitySchema = z.object({
  condition_id: z.string(),
});

export async function handleAnalyzeOpportunity(input: z.infer<typeof analyzeOpportunitySchema>): Promise<string> {
  log("info", `Analyzing opportunity for ${input.condition_id.slice(0, 12)}...`);

  const priceInfo = await getMarketPriceByCondition(input.condition_id);
  if (!priceInfo) return "Could not resolve market. Check the condition_id.";

  const [book, quality, history] = await Promise.all([
    getMarketPrice(priceInfo.tokenId),
    checkMarketQuality(priceInfo.tokenId),
    getPriceHistory(priceInfo.tokenId, "1d"),
  ]);

  const mid = book?.mid ?? priceInfo.price;
  const spread = book?.spread ?? 0;
  const bid = book?.bid ?? 0;
  const ask = book?.ask ?? 0;

  // Trend analysis
  let trend = "neutral";
  let momentum = 0;
  if (history.points.length >= 3) {
    const recent = history.points.slice(-5);
    const oldest = recent[0].price;
    const newest = recent[recent.length - 1].price;
    momentum = oldest > 0 ? ((newest - oldest) / oldest) * 100 : 0;
    trend = momentum > 2 ? "bullish" : momentum < -2 ? "bearish" : "neutral";
  }

  // Signal scoring
  let score = 50; // neutral
  const signals: string[] = [];

  // Price momentum
  if (momentum > 5) { score += 15; signals.push("Strong upward momentum (+5%+)"); }
  else if (momentum > 2) { score += 8; signals.push("Mild upward trend"); }
  else if (momentum < -5) { score -= 15; signals.push("Strong downward momentum (-5%+)"); }
  else if (momentum < -2) { score -= 8; signals.push("Mild downward trend"); }
  else { signals.push("Price stable"); }

  // Spread quality
  if (spread < 0.03) { score += 10; signals.push("Tight spread (good liquidity)"); }
  else if (spread < 0.08) { score += 3; signals.push("Moderate spread"); }
  else { score -= 10; signals.push("Wide spread (poor liquidity)"); }

  // Depth quality
  if (quality.pass) { score += 10; signals.push("Market quality check passed"); }
  else { score -= 15; signals.push("Market quality issues: " + quality.reasons[0]); }

  // Price range edge
  if (mid < 0.15) { score += 5; signals.push("Low price — potential high upside"); }
  else if (mid > 0.85) { score -= 5; signals.push("High price — limited upside"); }

  // OHLC volatility
  if (history.high > 0 && history.low > 0) {
    const volatility = (history.high - history.low) / history.low * 100;
    if (volatility > 20) { signals.push(`High volatility (${volatility.toFixed(0)}% range)`); }
    else if (volatility < 5) { signals.push("Low volatility"); }
  }

  score = Math.max(0, Math.min(100, score));
  const recommendation = score >= 65 ? "BUY" : score >= 45 ? "HOLD" : "AVOID";
  const recClass = recommendation === "BUY" ? "strong candidate" : recommendation === "HOLD" ? "wait for better entry" : "too risky";

  let output = `## Opportunity Analysis\n\n`;
  output += `### Recommendation: **${recommendation}** (${score}/100) — ${recClass}\n\n`;

  output += `| Metric | Value |\n|--------|-------|\n`;
  output += `| Mid Price | $${mid.toFixed(4)} |\n`;
  output += `| Bid / Ask | $${bid.toFixed(4)} / $${ask.toFixed(4)} |\n`;
  output += `| Spread | ${(spread * 100).toFixed(1)}% |\n`;
  output += `| 24h Trend | ${trend} (${momentum >= 0 ? "+" : ""}${momentum.toFixed(1)}%) |\n`;
  if (history.high > 0) output += `| 24h Range | $${history.low.toFixed(4)} — $${history.high.toFixed(4)} |\n`;

  output += `\n### Signals\n\n`;
  for (const s of signals) {
    const icon = s.includes("Strong upward") || s.includes("Tight") || s.includes("passed") ? "+" :
                 s.includes("Strong downward") || s.includes("Wide") || s.includes("issues") ? "-" : "~";
    output += `- [${icon}] ${s}\n`;
  }

  return output;
}
