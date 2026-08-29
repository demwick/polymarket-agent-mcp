import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { initializeDb } from "../../src/db/schema.js";
import { getConfig as getStoredConfig } from "../../src/db/queries.js";

const runtime = vi.hoisted(() => ({
  mode: "shadow" as "off" | "shadow",
  executionMode: "unattended" as "supervised" | "unattended",
  eligibility: "unknown" as "eligible" | "blocked" | "unknown",
}));

vi.mock("../../src/utils/config.js", () => ({
  getConfig: () => ({
    DIRECTORY_404_RISK_MODE: runtime.mode,
    DIRECTORY_404_EXECUTION_MODE: runtime.executionMode,
    DIRECTORY_404_GEOGRAPHIC_ELIGIBILITY: runtime.eligibility,
  }),
}));

import {
  evaluateDirectory404Risk,
  reportDirectory404Outcome,
} from "../../src/services/directory404-risk.js";

function evaluationResponse(): Response {
  return new Response(
    JSON.stringify({
      receipt_id: "11111111-1111-4111-8111-111111111111",
      outcome_token: "a".repeat(48),
      decision: "review",
      reason_codes: ["TIME_BOUNDARY_UNCLEAR"],
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

describe("404.directory shadow preflight", () => {
  let db: Database.Database;

  beforeEach(() => {
    runtime.mode = "shadow";
    runtime.executionMode = "unattended";
    runtime.eligibility = "unknown";
    db = new Database(":memory:");
    initializeDb(db);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    db.close();
  });

  it("sends only bounded public order context and persists a random Agent ID", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(evaluationResponse())
      .mockResolvedValueOnce(evaluationResponse());
    vi.stubGlobal("fetch", fetchMock);

    const order = {
      marketSlug: "will-example-happen",
      outcome: "YES" as const,
      side: "BUY" as const,
      estimatedNotionalUsd: 25,
    };
    const first = await evaluateDirectory404Risk(db, order);
    const second = await evaluateDirectory404Risk(db, order);

    expect(first).toMatchObject({ decision: "review", reasonCodes: ["TIME_BOUNDARY_UNCLEAR"] });
    expect(second).not.toBeNull();

    const storedAgentId = getStoredConfig(db, "directory_404_agent_id");
    expect(storedAgentId).toMatch(/^agent:[0-9a-f-]{36}$/i);

    const [, firstInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [, secondInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect((firstInit.headers as Record<string, string>)["x-404-agent-id"]).toBe(storedAgentId);
    expect((secondInit.headers as Record<string, string>)["x-404-agent-id"]).toBe(storedAgentId);

    const body = JSON.parse(String(firstInit.body));
    expect(body).toEqual({
      market: "will-example-happen",
      intended_action: "buy_yes",
      estimated_notional_usd: 25,
      execution_mode: "unattended",
      geographic_eligibility: "unknown",
    });
    expect(JSON.stringify(body)).not.toMatch(/wallet|private|token|prompt|strategy|trader/i);
  });

  it("does nothing while disabled or when the exact binary outcome is unavailable", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    runtime.mode = "off";

    expect(await evaluateDirectory404Risk(db, {
      marketSlug: "market",
      outcome: "NO",
      side: "SELL",
      estimatedNotionalUsd: 10,
    })).toBeNull();

    runtime.mode = "shadow";
    expect(await evaluateDirectory404Risk(db, {
      marketSlug: "market",
      side: "SELL",
      estimatedNotionalUsd: 10,
    })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails open on network and response errors", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(new Response("bad gateway", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);
    const order = {
      marketSlug: "market",
      outcome: "NO" as const,
      side: "BUY" as const,
      estimatedNotionalUsd: 10,
    };

    expect(await evaluateDirectory404Risk(db, order)).toBeNull();
    expect(await evaluateDirectory404Risk(db, order)).toBeNull();
  });

  it("reports only a bounded execution outcome", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const receipt = {
      receiptId: "11111111-1111-4111-8111-111111111111",
      outcomeToken: "a".repeat(48),
      decision: "review" as const,
      reasonCodes: ["TIME_BOUNDARY_UNCLEAR"],
    };

    await reportDirectory404Outcome(db, receipt, "failed");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/evaluations/${receipt.receiptId}/outcome`);
    expect(JSON.parse(String(init.body))).toEqual({
      outcome_token: receipt.outcomeToken,
      action_taken: "proceeded",
      execution_result: "failed",
      failure_type: "execution",
    });
  });
});
