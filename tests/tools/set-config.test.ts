import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { initializeDb } from "../../src/db/schema.js";
import { handleSetConfig } from "../../src/tools/set-config.js";
import { BudgetManager } from "../../src/services/budget-manager.js";
import { getConfig } from "../../src/db/queries.js";

vi.mock("../../src/utils/license.js", () => ({
  checkLicense: vi.fn().mockResolvedValue(true),
  requirePro: vi.fn((name: string) => `${name} requires Pro`),
  resetLicenseCache: vi.fn(),
}));

import { checkLicense } from "../../src/utils/license.js";
const mockCheckLicense = vi.mocked(checkLicense);

describe("handleSetConfig", () => {
  let db: Database.Database;
  let bm: BudgetManager;

  beforeEach(() => {
    db = new Database(":memory:");
    initializeDb(db);
    bm = new BudgetManager(db, 20);
    mockCheckLicense.mockResolvedValue(true);
  });

  it("updates daily budget and BudgetManager", async () => {
    const result = await handleSetConfig(db, bm, { key: "daily_budget", value: "50" });
    expect(result).toContain("50");
    expect(bm.getDailyLimit()).toBe(50);
    expect(getConfig(db, "daily_budget")).toBe("50");
  });

  it("rejects invalid budget value", async () => {
    const result = await handleSetConfig(db, bm, { key: "daily_budget", value: "abc" });
    expect(result).toContain("Invalid");
  });

  it("updates min_conviction config", async () => {
    const result = await handleSetConfig(db, bm, { key: "min_conviction", value: "5" });
    expect(result).toContain("min_conviction");
    expect(getConfig(db, "min_conviction")).toBe("5");
  });

  it("requires Pro license", async () => {
    mockCheckLicense.mockResolvedValue(false);
    const result = await handleSetConfig(db, bm, { key: "daily_budget", value: "50" });
    expect(result).toContain("Pro");
  });
});
