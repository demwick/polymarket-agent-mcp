import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { initializeDb } from "../../src/db/schema.js";
import { BudgetManager } from "../../src/services/budget-manager.js";

describe("BudgetManager", () => {
  let db: Database.Database;
  let bm: BudgetManager;

  beforeEach(() => {
    db = new Database(":memory:");
    initializeDb(db);
    bm = new BudgetManager(db, 20);
  });

  it("calculates proportional copy amount with normal conviction", () => {
    const amount = bm.calculateCopyAmount({
      originalAmount: 30,
      activeTraderCount: 4,
    });
    expect(amount).toBe(5);
  });

  it("applies low conviction multiplier for small trades", () => {
    const amount = bm.calculateCopyAmount({
      originalAmount: 5,
      activeTraderCount: 4,
    });
    expect(amount).toBe(2.5);
  });

  it("applies high conviction multiplier for large trades", () => {
    const amount = bm.calculateCopyAmount({
      originalAmount: 100,
      activeTraderCount: 4,
    });
    expect(amount).toBe(5);
  });

  it("caps single trade at 25% of daily budget", () => {
    const amount = bm.calculateCopyAmount({
      originalAmount: 60,
      activeTraderCount: 1,
    });
    expect(amount).toBe(5);
  });

  it("returns 0 when daily budget is exhausted", () => {
    const today = new Date().toISOString().split("T")[0];
    bm.recordSpending(today, 20);
    const amount = bm.calculateCopyAmount({
      originalAmount: 30,
      activeTraderCount: 4,
    });
    expect(amount).toBe(0);
  });

  it("tracks remaining budget correctly", () => {
    const today = new Date().toISOString().split("T")[0];
    bm.recordSpending(today, 12);
    expect(bm.getRemainingBudget()).toBe(8);
  });
});
