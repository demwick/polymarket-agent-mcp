import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { initializeDb } from "../../src/db/schema.js";
import { handleGoLive } from "../../src/tools/go-live.js";
import { TradeExecutor } from "../../src/services/trade-executor.js";

vi.mock("../../src/utils/config.js", () => ({
  getConfig: vi.fn(() => ({
    POLY_PRIVATE_KEY: "",
    POLY_API_KEY: "",
    POLY_API_SECRET: "",
    POLY_API_PASSPHRASE: "",
    POLY_FUNDER_ADDRESS: "",
    DAILY_BUDGET: 20,
    MIN_CONVICTION: 3,
    COPY_MODE: "preview",
    CHAIN_ID: 137,
  })),
  hasLiveCredentials: vi.fn(() => false),
  validateLiveCredentials: vi.fn(() => ["POLY_PRIVATE_KEY", "POLY_API_KEY"]),
}));

import { validateLiveCredentials } from "../../src/utils/config.js";
const mockValidate = vi.mocked(validateLiveCredentials);

describe("handleGoLive", () => {
  let db: Database.Database;
  let executor: TradeExecutor;

  beforeEach(() => {
    db = new Database(":memory:");
    initializeDb(db);
    executor = new TradeExecutor(db, "preview");
  });


  it("cancels when confirm is false", async () => {
    const result = await handleGoLive(executor, { confirm: false });
    expect(result).toContain("cancelled");
    expect(executor.getMode()).toBe("preview");
  });

  it("rejects when credentials are missing", async () => {
    mockValidate.mockReturnValue(["POLY_PRIVATE_KEY", "POLY_API_KEY"]);
    const result = await handleGoLive(executor, { confirm: true });
    expect(result).toContain("Missing credentials");
    expect(result).toContain("POLY_PRIVATE_KEY");
  });

  it("activates live mode with valid credentials", async () => {
    mockValidate.mockReturnValue([]);
    const result = await handleGoLive(executor, { confirm: true });
    expect(result).toContain("LIVE MODE");
    expect(executor.getMode()).toBe("live");
  });
});
