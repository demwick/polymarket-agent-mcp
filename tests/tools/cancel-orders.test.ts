import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { initializeDb } from "../../src/db/schema.js";
import { TradeExecutor } from "../../src/services/trade-executor.js";

import { handleCancelOrders } from "../../src/tools/cancel-orders.js";

describe("handleCancelOrders", () => {
  let db: Database.Database;
  let executor: TradeExecutor;

  beforeEach(() => {
    db = new Database(":memory:");
    initializeDb(db);
    executor = new TradeExecutor(db, "preview");
  });


  it("refuses to run in preview mode", async () => {
    // executor is preview by default
    const result = await handleCancelOrders(executor);
    expect(result).toContain("only works in live mode");
    expect(result).toContain("go_live");
  });

  it("returns 'no open orders' when executor finds none", async () => {
    executor.setMode("live");
    const spy = vi
      .spyOn(executor, "cancelAllOrders")
      .mockResolvedValue({ cancelled: 0 });

    const result = await handleCancelOrders(executor);

    expect(spy).toHaveBeenCalledOnce();
    expect(result).toContain("No open orders");
  });

  it("reports cancelled count on success", async () => {
    executor.setMode("live");
    vi.spyOn(executor, "cancelAllOrders").mockResolvedValue({ cancelled: 3 });

    const result = await handleCancelOrders(executor);
    expect(result).toContain("Cancelled 3 open orders");
  });

  it("returns credential hint when executor throws credential error", async () => {
    executor.setMode("live");
    vi.spyOn(executor, "cancelAllOrders").mockRejectedValue(
      new Error("Missing credentials for CLOB")
    );

    const result = await handleCancelOrders(executor);
    expect(result).toContain("Failed to cancel");
    expect(result).toContain("credentials");
  });

  it("returns generic failure for non-credential errors", async () => {
    executor.setMode("live");
    vi.spyOn(executor, "cancelAllOrders").mockRejectedValue(
      new Error("Network timeout")
    );

    const result = await handleCancelOrders(executor);
    expect(result).toContain("Failed to cancel");
    expect(result).not.toContain("Verify your API credentials");
  });
});
