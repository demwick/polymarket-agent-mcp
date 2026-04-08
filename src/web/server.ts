import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import Database from "better-sqlite3";
import { getWatchlist, getTradeHistory, getTradeStats } from "../db/queries.js";
import { BudgetManager } from "../services/budget-manager.js";
import { WalletMonitor } from "../services/wallet-monitor.js";
import { TradeExecutor } from "../services/trade-executor.js";
import { getRecentLogs } from "../utils/logger.js";
import { log } from "../utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function startWebDashboard(
  db: Database.Database,
  budgetManager: BudgetManager,
  monitor: WalletMonitor,
  executor: TradeExecutor,
  port: number
): void {
  const app = express();

  app.use(express.static(path.join(__dirname, "public")));

  app.get("/api/dashboard", (_req, res) => {
    const stats = getTradeStats(db);
    const remaining = budgetManager.getRemainingBudget();
    const dailyLimit = budgetManager.getDailyLimit();
    const watchlist = getWatchlist(db);
    const recentTrades = getTradeHistory(db, { limit: 20 });
    const monitorStatus = monitor.getStatus();
    const logs = getRecentLogs(20);

    res.json({
      mode: executor.getMode(),
      budget: { spent: dailyLimit - remaining, limit: dailyLimit, remaining },
      stats,
      watchlist,
      recentTrades,
      monitor: monitorStatus,
      logs,
    });
  });

  app.post("/api/monitor/start", (_req, res) => {
    if (monitor.getStatus().running) {
      res.json({ ok: true, message: "Already running" });
    } else {
      monitor.start(30_000);
      res.json({ ok: true, message: "Monitor started" });
    }
  });

  app.post("/api/monitor/stop", (_req, res) => {
    if (!monitor.getStatus().running) {
      res.json({ ok: true, message: "Already stopped" });
    } else {
      monitor.stop();
      res.json({ ok: true, message: "Monitor stopped" });
    }
  });

  app.listen(port, () => {
    log("info", `Web dashboard running at http://localhost:${port}`);
    // Auto-open dashboard in browser
    const url = `http://localhost:${port}`;
    const cmd = process.platform === "darwin" ? `open "${url}"`
      : process.platform === "win32" ? `start "${url}"`
      : `xdg-open "${url}"`;
    exec(cmd);
  });
}
