import { z } from "zod";
import Database from "better-sqlite3";
import { getOpenPositions, getTradeStats } from "../db/queries.js";
import { BudgetManager } from "../services/budget-manager.js";

export async function handleAssessRisk(db: Database.Database, budgetManager: BudgetManager): Promise<string> {
  const positions = getOpenPositions(db);
  const stats = getTradeStats(db);
  const remaining = budgetManager.getRemainingBudget();
  const dailyLimit = budgetManager.getDailyLimit();

  if (positions.length === 0) {
    return "No open positions. Your risk exposure is zero.";
  }

  const totalInvested = positions.reduce((sum, p) => sum + p.amount, 0);
  const hasSl = positions.filter((p) => p.sl_price != null).length;
  const hasTp = positions.filter((p) => p.tp_price != null).length;

  // Concentration: largest single position vs total
  const largest = Math.max(...positions.map((p) => p.amount));
  const concentrationPct = totalInvested > 0 ? (largest / totalInvested) * 100 : 0;

  // Diversification: unique markets
  const uniqueMarkets = new Set(positions.map((p) => p.condition_id)).size;

  // Trader diversification
  const uniqueTraders = new Set(positions.map((p) => p.trader_address)).size;

  // Risk scoring
  let riskScore = 0;
  const warnings: string[] = [];
  const positives: string[] = [];

  // Concentration risk
  if (concentrationPct > 50) { riskScore += 30; warnings.push(`High concentration: largest position is ${concentrationPct.toFixed(0)}% of portfolio`); }
  else if (concentrationPct > 30) { riskScore += 15; warnings.push(`Moderate concentration: ${concentrationPct.toFixed(0)}%`); }
  else { positives.push("Good position sizing — no single position dominates"); }

  // Diversification
  if (uniqueMarkets < 3 && positions.length >= 3) { riskScore += 20; warnings.push(`Low market diversification: ${uniqueMarkets} unique markets`); }
  else { positives.push(`Diversified across ${uniqueMarkets} markets`); }

  if (uniqueTraders < 2 && positions.length >= 3) { riskScore += 10; warnings.push("All positions from same trader source"); }

  // Protection coverage
  const protectedPct = positions.length > 0 ? (hasSl / positions.length) * 100 : 0;
  if (protectedPct < 30) { riskScore += 20; warnings.push(`Only ${protectedPct.toFixed(0)}% of positions have stop-loss`); }
  else if (protectedPct < 70) { riskScore += 10; warnings.push(`${protectedPct.toFixed(0)}% of positions protected by stop-loss`); }
  else { positives.push(`${protectedPct.toFixed(0)}% of positions have stop-loss protection`); }

  // Budget usage
  const budgetUsedPct = dailyLimit > 0 ? ((dailyLimit - remaining) / dailyLimit) * 100 : 0;
  if (budgetUsedPct > 90) { riskScore += 15; warnings.push("Budget nearly exhausted (>90%)"); }

  // Win rate
  if (stats.winRate < 30 && stats.total >= 5) { riskScore += 10; warnings.push(`Low win rate: ${stats.winRate.toFixed(1)}%`); }

  riskScore = Math.min(100, riskScore);
  const level = riskScore >= 60 ? "HIGH" : riskScore >= 30 ? "MEDIUM" : "LOW";

  let output = `## Risk Assessment: **${level}** (${riskScore}/100)\n\n`;

  output += `| Metric | Value |\n|--------|-------|\n`;
  output += `| Open Positions | ${positions.length} |\n`;
  output += `| Total Invested | $${totalInvested.toFixed(2)} |\n`;
  output += `| Largest Position | $${largest.toFixed(2)} (${concentrationPct.toFixed(0)}%) |\n`;
  output += `| Unique Markets | ${uniqueMarkets} |\n`;
  output += `| Unique Traders | ${uniqueTraders} |\n`;
  output += `| SL Protected | ${hasSl}/${positions.length} |\n`;
  output += `| TP Set | ${hasTp}/${positions.length} |\n`;
  output += `| Budget Used | ${budgetUsedPct.toFixed(0)}% |\n`;
  output += `| Win Rate | ${stats.winRate.toFixed(1)}% (${stats.wins}W/${stats.losses}L) |\n`;

  if (warnings.length > 0) {
    output += `\n### Warnings\n\n`;
    for (const w of warnings) output += `- ${w}\n`;
  }

  if (positives.length > 0) {
    output += `\n### Strengths\n\n`;
    for (const p of positives) output += `- ${p}\n`;
  }

  return output;
}
