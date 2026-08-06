import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import Database from "better-sqlite3";
import { handleStopMonitor } from "../../src/tools/stop-monitor.js";
import { BudgetManager } from "../../src/services/budget-manager.js";
import { WalletMonitor } from "../../src/services/wallet-monitor.js";
import { makeTestDb, makePreviewExecutor } from "../helpers/fixtures.js";

describe("handleStopMonitor (complementary)", () => {
  let db: Database.Database;
  let monitor: WalletMonitor;

  beforeEach(() => {
    db = makeTestDb();
    const bm = new BudgetManager(db, 20);
    const executor = makePreviewExecutor(db);
    monitor = new WalletMonitor(db, bm, executor, 3);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls monitor.stop exactly once when running", async () => {
    vi.spyOn(monitor, "getStatus").mockReturnValue({ running: true } as ReturnType<WalletMonitor["getStatus"]>);
    const stopSpy = vi.spyOn(monitor, "stop").mockImplementation(() => {});

    const result = await handleStopMonitor(monitor);

    expect(result).toContain("Monitor stopped");
    expect(stopSpy).toHaveBeenCalledTimes(1);
  });

  it("does not call monitor.stop when not running", async () => {
    vi.spyOn(monitor, "getStatus").mockReturnValue({ running: false } as ReturnType<WalletMonitor["getStatus"]>);
    const stopSpy = vi.spyOn(monitor, "stop").mockImplementation(() => {});

    const result = await handleStopMonitor(monitor);

    expect(result).toContain("not running");
    expect(stopSpy).not.toHaveBeenCalled();
  });


});
